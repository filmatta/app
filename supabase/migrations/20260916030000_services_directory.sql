begin;

create function private.valid_service_links(items jsonb) returns boolean
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(items) <> 'array' then false
  when jsonb_array_length(items)>6 then false else not exists(
    select 1 from jsonb_array_elements(items) item where
      jsonb_typeof(item)<>'object' or jsonb_typeof(item->'label') is distinct from 'string'
      or jsonb_typeof(item->'url') is distinct from 'string'
      or char_length(btrim(item->>'label')) not between 2 and 80
      or char_length(item->>'url')>2000
      or item->>'url' !~ '^https://[a-zA-Z0-9][^[:space:]]*$'
      or item->>'url' ~ '^https://[^/?#]*@'
      or (item - 'label' - 'url') <> '{}'::jsonb
  ) end;
$$;
revoke all on function private.valid_service_links(jsonb) from public,anon,authenticated;
grant execute on function private.valid_service_links(jsonb) to authenticated;

create table public.service_listings(
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug text not null unique check(char_length(slug) between 3 and 160 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check(title=btrim(title) and char_length(title) between 3 and 160),
  category text not null check(category in ('equipment','postproduction','sound','art','production','transport','catering','other')),
  description text not null default '' check(char_length(description)<=12000),
  city text check(city=btrim(city) and char_length(city) between 2 and 120),
  work_mode text not null default 'on_site' check(work_mode in ('on_site','remote','hybrid')),
  indicative_price numeric(12,2), currency text,
  portfolio_links jsonb not null default '[]'::jsonb check(private.valid_service_links(portfolio_links)),
  status text not null default 'draft' check(status in ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,owner_user_id),
  constraint service_price_check check(
    (indicative_price is null and currency is null) or
    (indicative_price is not null and indicative_price <> 'NaN'::numeric and indicative_price>=0 and currency is not null and currency in ('MXN','USD','EUR'))
  ),
  constraint service_publication_check check(status<>'published' or (char_length(btrim(description))>=40 and (work_mode='remote' or city is not null))),
  constraint service_publication_timestamp_check check((published_at is null or isfinite(published_at)) and (status<>'published' or published_at is not null))
);
create index service_public_catalog_idx on public.service_listings(published_at desc,id) where status='published';
create index service_category_catalog_idx on public.service_listings(category,published_at desc,id) where status='published';
create index service_owner_idx on public.service_listings(owner_user_id,updated_at desc,id);
create function private.service_identity_immutable() returns trigger
language plpgsql set search_path='' as $$ begin
  if new.id<>old.id or new.owner_user_id<>old.owner_user_id or new.slug<>old.slug then
    raise exception 'Service identity is immutable' using errcode='22023';
  end if; return new;
end; $$;
revoke all on function private.service_identity_immutable() from public,anon,authenticated;
create trigger service_identity before update on public.service_listings for each row execute function private.service_identity_immutable();
create trigger service_timestamps before insert or update on public.service_listings for each row execute function private.set_vertical_foundation_timestamps();
create trigger service_publication before insert or update on public.service_listings for each row execute function private.set_vertical_publication_timestamp();
alter table public.service_listings enable row level security;
revoke all on public.service_listings from public,anon,authenticated;
grant select(id,slug,title,category,description,city,work_mode,indicative_price,currency,portfolio_links,status,published_at,created_at,updated_at) on public.service_listings to anon;
grant select,insert,update on public.service_listings to authenticated;
create policy service_public_read on public.service_listings for select to anon,authenticated using(status='published');
create policy service_owner_read on public.service_listings for select to authenticated using(owner_user_id=(select auth.uid()));
create policy service_owner_insert on public.service_listings for insert to authenticated with check(owner_user_id=(select auth.uid()));
create policy service_owner_update on public.service_listings for update to authenticated using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
create policy service_admin on public.service_listings for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));

create function public.save_my_service(p_id uuid,p_data jsonb,p_status text default 'draft') returns uuid
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid:=coalesce(p_id,gen_random_uuid()); new_slug text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_id is not null then
    select slug into new_slug from public.service_listings where id=p_id and owner_user_id=actor for update;
    if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  else
    if p_status not in ('draft','published') then raise exception 'Invalid initial status' using errcode='22023'; end if;
    new_slug:=trim(both '-' from left(regexp_replace(lower(btrim(p_data->>'title')),'[^a-z0-9]+','-','g'),120));
    new_slug:=coalesce(nullif(new_slug,''),'servicio')||'-'||replace(target::text,'-','');
  end if;
  insert into public.service_listings(id,owner_user_id,slug,title,category,description,city,work_mode,indicative_price,currency,portfolio_links,status)
    values(target,actor,new_slug,btrim(p_data->>'title'),p_data->>'category',btrim(coalesce(p_data->>'description','')),nullif(btrim(p_data->>'city'),''),p_data->>'work_mode',(p_data->>'indicative_price')::numeric,nullif(p_data->>'currency',''),coalesce(p_data->'portfolio_links','[]'::jsonb),p_status)
  on conflict(id) do update set title=excluded.title,category=excluded.category,description=excluded.description,city=excluded.city,work_mode=excluded.work_mode,indicative_price=excluded.indicative_price,currency=excluded.currency,portfolio_links=excluded.portfolio_links,status=excluded.status
    where public.service_listings.owner_user_id=actor;
  return target;
end; $$;
revoke all on function public.save_my_service(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_my_service(uuid,jsonb,text) to authenticated;

create function public.get_service_provider(p_slug text) returns table(profile_slug text,display_name text)
language sql stable security definer set search_path='' as $$
  select p.slug,p.display_name from public.service_listings s join public.professional_profiles p on p.user_id=s.owner_user_id
  where s.slug=p_slug and s.status='published' and p.is_public;
$$;
revoke all on function public.get_service_provider(text) from public,anon,authenticated;
grant execute on function public.get_service_provider(text) to anon,authenticated;

-- Private, one-way initial inquiries. No email/phone is exposed by the directory.
-- This inbox can gain another FK target in Jobs without a second messaging engine.
create table public.catalog_inquiries(
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  message text not null check(message=btrim(message) and char_length(message) between 20 and 3000),
  status text not null default 'pending' check(status in ('pending','accepted','declined','archived')),
  created_at timestamptz not null default now(),
  foreign key(service_id,recipient_id) references public.service_listings(id,owner_user_id) on delete cascade,
  unique(service_id,sender_id), check(sender_id<>recipient_id)
);
create index catalog_inquiries_sender_idx on public.catalog_inquiries(sender_id,created_at desc,id);
create index catalog_inquiries_recipient_idx on public.catalog_inquiries(recipient_id,created_at desc,id);
alter table public.catalog_inquiries enable row level security;
revoke all on public.catalog_inquiries from public,anon,authenticated;
grant select on public.catalog_inquiries to authenticated;
grant update(status) on public.catalog_inquiries to authenticated;
create policy inquiry_participant_read on public.catalog_inquiries for select to authenticated using((select auth.uid()) in (sender_id,recipient_id) or (select private.is_admin()));
create policy inquiry_recipient_update on public.catalog_inquiries for update to authenticated using(recipient_id=(select auth.uid()) or (select private.is_admin())) with check(recipient_id=(select auth.uid()) or (select private.is_admin()));

create function public.send_service_inquiry(p_slug text,p_message text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); listing public.service_listings; target uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.professional_profiles where user_id=actor and is_public) then raise exception 'Public professional profile required' using errcode='42501'; end if;
  select * into listing from public.service_listings where slug=p_slug and status='published' for share;
  if not found or listing.owner_user_id=actor then raise exception 'Service unavailable for inquiry' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if (select count(*) from public.catalog_inquiries where sender_id=actor and created_at>now()-interval '24 hours')>=10 then raise exception 'Daily inquiry limit reached' using errcode='22023'; end if;
  insert into public.catalog_inquiries(service_id,sender_id,recipient_id,message) values(listing.id,actor,listing.owner_user_id,btrim(p_message)) returning id into target;
  return target;
end; $$;
revoke all on function public.send_service_inquiry(text,text) from public,anon,authenticated;
grant execute on function public.send_service_inquiry(text,text) to authenticated;

create function public.list_my_catalog_inquiries(p_page integer default 1)
returns table(id uuid,message text,status text,created_at timestamptz,is_recipient boolean,target_title text,target_href text,profile_name text,profile_slug text)
language sql stable security definer set search_path='' as $$
  select i.id,i.message,i.status,i.created_at,i.recipient_id=auth.uid(),
    case when s.status='published' or i.recipient_id=auth.uid() then s.title else 'Servicio no disponible' end,
    case when s.status='published' then '/marketplace/'||s.slug else null end,
    p.display_name,p.slug
  from public.catalog_inquiries i join public.service_listings s on s.id=i.service_id
  left join public.professional_profiles p on p.user_id=case when i.sender_id=auth.uid() then i.recipient_id else i.sender_id end and p.is_public
  where auth.uid() in(i.sender_id,i.recipient_id)
  order by i.created_at desc,i.id limit 25 offset ((greatest(1,least(coalesce(p_page,1),1000))-1)*24);
$$;
revoke all on function public.list_my_catalog_inquiries(integer) from public,anon,authenticated;
grant execute on function public.list_my_catalog_inquiries(integer) to authenticated;
commit;
