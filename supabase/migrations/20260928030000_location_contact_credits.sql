begin;

-- Channels are location-specific and private. Existing explicit values are
-- migrated without inferring anything from Auth or Professional Profiles.
create table private.location_contact_channels (
  location_id uuid primary key,
  owner_id uuid not null,
  email text,
  phone text,
  whatsapp text,
  instagram text,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_contact_channels_owner_fk foreign key(location_id,owner_id)
    references public.locations(id,owner_id) on update cascade on delete cascade,
  constraint location_contact_channels_email_check check (
    email is null or (char_length(email)<=254 and email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),
  constraint location_contact_channels_phone_check check (
    phone is null or (char_length(phone) between 7 and 40 and phone~'^\+?[0-9 ()-]+$')
  ),
  constraint location_contact_channels_whatsapp_check check (
    whatsapp is null or (char_length(whatsapp) between 7 and 20 and whatsapp~'^\+?[1-9][0-9]+$')
  ),
  constraint location_contact_channels_instagram_check check (
    instagram is null or (char_length(instagram) between 1 and 30 and instagram~'^[A-Za-z0-9._]+$')
  ),
  constraint location_contact_channels_website_check check (
    website is null or (char_length(website)<=500 and website~'^https://[^[:space:]@]+$')
  )
);
revoke all on private.location_contact_channels from public,anon,authenticated;

insert into private.location_contact_channels(
  location_id,owner_id,email,phone,whatsapp,website,created_at,updated_at
)
select location_id,owner_id,email,phone,whatsapp,website,created_at,updated_at
from public.location_public_contacts;

drop table public.location_public_contacts;

create function private.location_contact_channels_valid(p_location uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.location_contact_channels c where c.location_id=p_location
    and (c.email is not null or c.phone is not null or c.whatsapp is not null or c.instagram is not null));
$$;
revoke all on function private.location_contact_channels_valid(uuid) from public,anon,authenticated;

create function public.get_my_location_contact_channels(p_location_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(c)-'owner_id'-'created_at'-'updated_at'
  from private.location_contact_channels c join public.locations l on l.id=c.location_id
  where c.location_id=p_location_id and l.owner_id=auth.uid();
$$;
revoke all on function public.get_my_location_contact_channels(uuid) from public,anon;
grant execute on function public.get_my_location_contact_channels(uuid) to authenticated;

create function public.save_my_location_contact_channels(p_location_id uuid,p_channels jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e text; p text; w text; i text; site text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from public.locations where id=p_location_id and owner_id=actor for update;
  if not found then raise exception 'Location unavailable' using errcode='42501'; end if;
  if jsonb_typeof(p_channels) is distinct from 'object' or exists(
    select 1 from jsonb_object_keys(p_channels) k where k not in ('email','phone','whatsapp','instagram','website')
  ) then raise exception 'Invalid channels' using errcode='22023'; end if;
  e:=nullif(btrim(p_channels->>'email'),''); p:=nullif(btrim(p_channels->>'phone'),'');
  w:=nullif(btrim(p_channels->>'whatsapp'),''); i:=nullif(trim(both '@' from btrim(p_channels->>'instagram')),'');
  site:=nullif(btrim(p_channels->>'website'),'');
  if e is not null and (length(e)>254 or e!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email' using errcode='22023'; end if;
  if p is not null and (length(p) not between 7 and 40 or p!~'^\+?[0-9 ()-]+$') then raise exception 'Invalid phone' using errcode='22023'; end if;
  if w is not null and (length(w) not between 7 and 20 or w!~'^\+?[1-9][0-9]+$') then raise exception 'Invalid WhatsApp' using errcode='22023'; end if;
  if i is not null and (length(i) not between 1 and 30 or i!~'^[A-Za-z0-9._]+$') then raise exception 'Invalid Instagram' using errcode='22023'; end if;
  if site is not null and (length(site)>500 or site!~'^https://[^[:space:]@]+$') then raise exception 'Invalid website' using errcode='22023'; end if;
  if e is null and p is null and w is null and i is null and site is null then
    delete from private.location_contact_channels where location_id=p_location_id and owner_id=actor;
  else
    insert into private.location_contact_channels(location_id,owner_id,email,phone,whatsapp,instagram,website)
    values(p_location_id,actor,e,p,w,i,site)
    on conflict(location_id) do update set email=excluded.email,phone=excluded.phone,
      whatsapp=excluded.whatsapp,instagram=excluded.instagram,website=excluded.website,updated_at=now()
    where private.location_contact_channels.owner_id=actor;
  end if;
end $$;
revoke all on function public.save_my_location_contact_channels(uuid,jsonb) from public,anon;
grant execute on function public.save_my_location_contact_channels(uuid,jsonb) to authenticated;

create table private.location_credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  initial_credits smallint not null default 5 check(initial_credits=5),
  created_at timestamptz not null default now()
);
revoke all on private.location_credit_accounts from public,anon,authenticated;

create table public.location_contact_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  idempotency_key uuid not null,
  requester_display_name text not null,
  owner_display_name text not null,
  location_title_snapshot text not null,
  location_slug_snapshot text not null,
  message text not null check(message=btrim(message) and char_length(message) between 20 and 500),
  state text not null default 'pending' check(state in ('pending','accepted','rejected','expired','cancelled')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  contact_unlocked_at timestamptz,
  shared_contact_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_request_not_self check(requester_id<>owner_id),
  constraint location_request_expiry_check check(expires_at=created_at+interval '48 hours'),
  constraint location_request_snapshot_check check(
    (state='accepted' and accepted_at is not null and contact_unlocked_at is not null
      and jsonb_typeof(shared_contact_snapshot)='object' and shared_contact_snapshot<>'{}'::jsonb)
    or (state<>'accepted' and accepted_at is null and contact_unlocked_at is null and shared_contact_snapshot is null)
  ),
  unique(requester_id,idempotency_key)
);
create unique index location_request_one_pending
  on public.location_contact_requests(requester_id,location_id) where state='pending';
create unique index location_request_one_accepted_owner
  on public.location_contact_requests(requester_id,location_id,owner_id) where state='accepted';
create index location_requests_participants on public.location_contact_requests(owner_id,requester_id,created_at desc);
create index location_requests_expiry on public.location_contact_requests(expires_at,requester_id) where state='pending';
alter table public.location_contact_requests enable row level security;
revoke all on public.location_contact_requests from public,anon,authenticated;

create table private.location_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references private.location_credit_accounts(user_id) on delete cascade,
  request_id uuid references public.location_contact_requests(id) on delete restrict,
  event text not null check(event in ('grant','reserve','consume','release')),
  delta smallint not null,
  created_at timestamptz not null default now(),
  constraint location_credit_ledger_shape check(
    (event='grant' and request_id is null and delta=5)
    or (event='reserve' and request_id is not null and delta=-1)
    or (event='consume' and request_id is not null and delta=0)
    or (event='release' and request_id is not null and delta=1)
  )
);
create unique index location_credit_one_grant on private.location_credit_ledger(user_id) where event='grant';
create unique index location_credit_request_event on private.location_credit_ledger(request_id,event) where request_id is not null;
revoke all on private.location_credit_ledger from public,anon,authenticated;

create function private.ensure_location_credit_account(p_user uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.location_credit_accounts where user_id=p_user) then return true; end if;
  if p_user<>auth.uid() or public.get_my_billing_plan() is not null then return false; end if;
  insert into private.location_credit_accounts(user_id) values(p_user) on conflict do nothing;
  insert into private.location_credit_ledger(user_id,event,delta)
    values(p_user,'grant',5) on conflict do nothing;
  return true;
end $$;
revoke all on function private.ensure_location_credit_account(uuid) from public,anon,authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check(type in (
  'contact_request_received','contact_request_accepted','contact_request_rejected','contact_request_expiring','follow_received',
  'location_request_received','location_request_accepted','location_request_rejected','location_request_expired','location_request_cancelled'
));
alter table public.notifications drop constraint notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check check(entity_type in ('contact_request','profile','location_request'));

create function private.release_location_credit(p_request uuid,p_user uuid)
returns void language sql security definer set search_path='' as $$
  insert into private.location_credit_ledger(user_id,request_id,event,delta)
  values(p_user,p_request,'release',1) on conflict do nothing;
$$;
revoke all on function private.release_location_credit(uuid,uuid) from public,anon,authenticated;

create function private.expire_location_requests_for(p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare sender uuid; expired_row record;
begin
  for sender in select distinct requester_id from public.location_contact_requests
    where state='pending' and expires_at<=clock_timestamp()
      and p_actor in(requester_id,owner_id) order by requester_id loop
    perform 1 from private.location_credit_accounts where user_id=sender for update;
    for expired_row in update public.location_contact_requests set state='expired',updated_at=now()
      where requester_id=sender and state='pending' and expires_at<=clock_timestamp()
        and p_actor in(requester_id,owner_id)
      returning id,requester_id,owner_id loop
      perform private.release_location_credit(expired_row.id,expired_row.requester_id);
      insert into public.notifications(user_id,actor_user_id,type,entity_type,entity_id)
      values(expired_row.requester_id,expired_row.owner_id,'location_request_expired','location_request',expired_row.id),
            (expired_row.owner_id,expired_row.requester_id,'location_request_expired','location_request',expired_row.id)
      on conflict do nothing;
    end loop;
  end loop;
end $$;
revoke all on function private.expire_location_requests_for(uuid) from public,anon,authenticated;

create function public.refresh_my_location_requests()
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform private.expire_location_requests_for(auth.uid());
end $$;
revoke all on function public.refresh_my_location_requests() from public,anon;
grant execute on function public.refresh_my_location_requests() to authenticated;

create function public.get_my_location_credit_wallet()
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); eligible boolean; available integer; held integer; spent integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  eligible:=private.ensure_location_credit_account(actor);
  if not eligible then
    return jsonb_build_object('eligible',false,'initial_credits',0,'available_credits',0,
      'reserved_credits',0,'consumed_credits',0,'policy_pending',true);
  end if;
  perform private.expire_location_requests_for(actor);
  select coalesce(sum(delta),0)::int into available from private.location_credit_ledger where user_id=actor;
  select count(*)::int into held from public.location_contact_requests where requester_id=actor and state='pending' and expires_at>clock_timestamp();
  select count(*)::int into spent from private.location_credit_ledger where user_id=actor and event='consume';
  return jsonb_build_object('eligible',true,'initial_credits',5,'available_credits',greatest(0,available),
    'reserved_credits',held,'consumed_credits',spent,'policy_pending',false);
end $$;
revoke all on function public.get_my_location_credit_wallet() from public,anon;
grant execute on function public.get_my_location_credit_wallet() to authenticated;

create function public.send_location_contact_request(
  p_slug text,p_message text,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.locations; existing public.location_contact_requests;
  clean text:=btrim(coalesce(p_message,'')); result uuid; available integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_idempotency_key is null or length(clean) not between 20 and 500 then
    raise exception 'Invalid request' using errcode='22023';
  end if;
  select * into target from public.locations where slug=p_slug and status='published' for update;
  if not found or target.owner_id=actor then raise exception 'Location unavailable' using errcode='42501'; end if;
  if not private.location_contact_channels_valid(target.id) then raise exception 'Location contact unavailable' using errcode='LCN01'; end if;
  if not private.ensure_location_credit_account(actor) then raise exception 'Location plan policy pending' using errcode='LCP01'; end if;
  perform 1 from private.location_credit_accounts where user_id=actor for update;
  perform private.expire_location_requests_for(actor);

  select * into existing from public.location_contact_requests
    where requester_id=actor and idempotency_key=p_idempotency_key;
  if found then
    if existing.location_id<>target.id then raise exception 'Idempotency key conflict' using errcode='22023'; end if;
    return existing.id;
  end if;
  select * into existing from public.location_contact_requests
    where requester_id=actor and location_id=target.id
      and (state='accepted' or (state='pending' and expires_at>clock_timestamp()))
    order by created_at desc limit 1;
  if found then return existing.id; end if;

  select coalesce(sum(delta),0)::int into available from private.location_credit_ledger where user_id=actor;
  if available<=0 then raise exception 'No location credits available' using errcode='LCC01'; end if;
  insert into public.location_contact_requests(
    requester_id,owner_id,location_id,idempotency_key,requester_display_name,
    owner_display_name,location_title_snapshot,location_slug_snapshot,message,expires_at
  ) values(
    actor,target.owner_id,target.id,p_idempotency_key,private.profile_contact_sender_name(actor),
    private.profile_contact_sender_name(target.owner_id),target.title,target.slug,clean,now()+interval '48 hours'
  ) returning id into result;
  insert into private.location_credit_ledger(user_id,request_id,event,delta)
    values(actor,result,'reserve',-1);
  insert into public.notifications(user_id,actor_user_id,type,entity_type,entity_id)
    values(target.owner_id,actor,'location_request_received','location_request',result) on conflict do nothing;
  return result;
end $$;
revoke all on function public.send_location_contact_request(text,text,uuid) from public,anon;
grant execute on function public.send_location_contact_request(text,text,uuid) to authenticated;

create function public.transition_location_contact_request(p_id uuid,p_action text)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); initial public.location_contact_requests; r public.location_contact_requests;
  location_row public.locations; snapshot jsonb:='{}'::jsonb; channels private.location_contact_channels;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into initial from public.location_contact_requests where id=p_id and actor in(requester_id,owner_id);
  if not found then raise exception 'Request unavailable' using errcode='42501'; end if;
  select * into location_row from public.locations where id=initial.location_id for update;
  perform 1 from private.location_credit_accounts where user_id=initial.requester_id for update;
  select * into r from public.location_contact_requests where id=p_id for update;
  if p_action not in ('accept','reject','cancel')
    or (p_action in ('accept','reject') and actor<>r.owner_id)
    or (p_action='cancel' and actor<>r.requester_id) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if r.state<>'pending' then return r.state; end if;
  if r.expires_at<=clock_timestamp() then
    update public.location_contact_requests set state='expired',updated_at=now() where id=p_id;
    perform private.release_location_credit(r.id,r.requester_id);
    insert into public.notifications(user_id,actor_user_id,type,entity_type,entity_id)
      values(r.requester_id,r.owner_id,'location_request_expired','location_request',r.id),
            (r.owner_id,r.requester_id,'location_request_expired','location_request',r.id)
      on conflict do nothing;
    return 'expired';
  end if;
  if p_action='accept' then
    if location_row.id is null or location_row.owner_id<>r.owner_id or actor<>location_row.owner_id
      or location_row.status<>'published' then
      raise exception 'Location unavailable' using errcode='42501';
    end if;
    select * into channels from private.location_contact_channels
      where location_id=r.location_id and owner_id=actor for share;
    if channels.email is not null then snapshot:=snapshot||jsonb_build_object('email',channels.email); end if;
    if channels.phone is not null then snapshot:=snapshot||jsonb_build_object('phone',channels.phone); end if;
    if channels.whatsapp is not null then snapshot:=snapshot||jsonb_build_object('whatsapp',channels.whatsapp); end if;
    if channels.instagram is not null then snapshot:=snapshot||jsonb_build_object('instagram',channels.instagram); end if;
    if snapshot='{}'::jsonb then raise exception 'Configure a contact channel first' using errcode='LCN01'; end if;
    insert into private.location_credit_ledger(user_id,request_id,event,delta)
      values(r.requester_id,r.id,'consume',0) on conflict do nothing;
    update public.location_contact_requests set state='accepted',accepted_at=now(),
      contact_unlocked_at=now(),shared_contact_snapshot=snapshot,updated_at=now() where id=r.id;
    insert into public.notifications(user_id,actor_user_id,type,entity_type,entity_id)
      values(r.requester_id,actor,'location_request_accepted','location_request',r.id) on conflict do nothing;
    return 'accepted';
  end if;
  update public.location_contact_requests set state=case when p_action='reject' then 'rejected' else 'cancelled' end,
    updated_at=now() where id=r.id;
  perform private.release_location_credit(r.id,r.requester_id);
  if p_action='reject' then
    insert into public.notifications(user_id,actor_user_id,type,entity_type,entity_id)
      values(r.requester_id,actor,'location_request_rejected','location_request',r.id) on conflict do nothing;
  end if;
  return case when p_action='reject' then 'rejected' else 'cancelled' end;
end $$;
revoke all on function public.transition_location_contact_request(uuid,text) from public,anon;
grant execute on function public.transition_location_contact_request(uuid,text) to authenticated;

create function private.cancel_pending_location_requests()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record;
begin
  if (new.status is distinct from old.status and new.status<>'published') or new.owner_id is distinct from old.owner_id then
    for r in select id,requester_id,owner_id from public.location_contact_requests
      where location_id=new.id and state='pending' order by requester_id for update loop
      perform 1 from private.location_credit_accounts where user_id=r.requester_id for update;
      update public.location_contact_requests set state='cancelled',updated_at=now() where id=r.id and state='pending';
      if found then
        perform private.release_location_credit(r.id,r.requester_id);
        insert into public.notifications(user_id,actor_user_id,type,entity_type,entity_id)
          values(r.requester_id,r.owner_id,'location_request_cancelled','location_request',r.id) on conflict do nothing;
      end if;
    end loop;
  end if;
  if new.owner_id is distinct from old.owner_id then
    delete from private.location_contact_channels where location_id=new.id;
  end if;
  return new;
end $$;
revoke all on function private.cancel_pending_location_requests() from public,anon,authenticated;
create trigger locations_cancel_pending_contact_requests after update of status,owner_id on public.locations
for each row execute function private.cancel_pending_location_requests();

create function private.location_request_projection(r public.location_contact_requests)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',r.id,'is_recipient',r.owner_id=auth.uid(),'message',r.message,'state',r.state,
    'created_at',r.created_at,'expires_at',r.expires_at,'accepted_at',r.accepted_at,
    'contact_unlocked_at',r.contact_unlocked_at,'shared_contact_snapshot',r.shared_contact_snapshot,
    'location_id',r.location_id,'location_title',coalesce(l.title,r.location_title_snapshot),
    'location_slug',case when l.status='published' then l.slug else r.location_slug_snapshot end,
    'counterpart_name',case when r.owner_id=auth.uid() then r.requester_display_name else r.owner_display_name end,
    'counterpart_slug',p.slug,'portrait_media_id',p.presentation->>'portrait_media_id',
    'portrait_url',p.presentation->>'portrait_url')
  from (values(1)) v(x)
  left join public.locations l on l.id=r.location_id
  left join public.professional_profiles p on p.user_id=case when r.owner_id=auth.uid() then r.requester_id else r.owner_id end and p.is_public;
$$;
revoke all on function private.location_request_projection(public.location_contact_requests) from public,anon,authenticated;

create function public.list_my_location_contact_requests(p_box text default 'received',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_box not in ('received','sent','accepted','expired') then raise exception 'Invalid list' using errcode='22023'; end if;
  perform private.expire_location_requests_for(auth.uid());
  return coalesce((select jsonb_agg(private.location_request_projection(x)) from (
    select r.* from public.location_contact_requests r where auth.uid() in(r.requester_id,r.owner_id) and (
      (p_box='received' and r.owner_id=auth.uid() and r.state in ('pending','rejected','cancelled')) or
      (p_box='sent' and r.requester_id=auth.uid() and r.state in ('pending','rejected','cancelled')) or
      (p_box='accepted' and r.state='accepted') or (p_box='expired' and r.state='expired')
    ) order by r.created_at desc,r.id limit 25 offset (greatest(1,least(coalesce(p_page,1),1000))-1)*24
  ) x),'[]'::jsonb);
end $$;
revoke all on function public.list_my_location_contact_requests(text,integer) from public,anon;
grant execute on function public.list_my_location_contact_requests(text,integer) to authenticated;

create function public.get_my_location_contact_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform private.expire_location_requests_for(auth.uid());
  return (select private.location_request_projection(r) from public.location_contact_requests r
    where r.id=p_id and auth.uid() in(r.requester_id,r.owner_id));
end $$;
revoke all on function public.get_my_location_contact_request(uuid) from public,anon;
grant execute on function public.get_my_location_contact_request(uuid) to authenticated;

create function public.get_my_location_contact_access(p_slug text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.locations; wallet jsonb; thread public.location_contact_requests;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  wallet:=public.get_my_location_credit_wallet();
  select * into target from public.locations where slug=p_slug and status='published';
  if target.id is null then return wallet||jsonb_build_object('contact_available',false,'is_owner',false,'thread_id',null,'thread_state',null); end if;
  select * into thread from public.location_contact_requests where requester_id=actor and location_id=target.id
    and owner_id=target.owner_id and (state='accepted' or (state='pending' and expires_at>clock_timestamp()))
    order by case when state='accepted' then 0 else 1 end,created_at desc limit 1;
  return wallet||jsonb_build_object('contact_available',private.location_contact_channels_valid(target.id),
    'is_owner',target.owner_id=actor,'thread_id',thread.id,'thread_state',thread.state);
end $$;
revoke all on function public.get_my_location_contact_access(text) from public,anon;
grant execute on function public.get_my_location_contact_access(text) to authenticated;

-- Public location projections expose only whether protected contact is available.
create or replace function public.get_public_location(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',l.id,'title',l.title,'slug',l.slug,'summary',l.summary,'description',l.description,
    'city',l.city,'area',l.area,'space_type',l.space_type,'environment',l.environment,
    'price_amount',l.price_amount,'price_currency',l.price_currency,'price_unit',l.price_unit,
    'restrictions',l.restrictions,'characteristics',l.characteristics,
    'shooting_conditions',l.shooting_conditions,'tour_video_url',l.tour_video_url,
    'operational_notes',l.operational_notes,'published_at',l.published_at,
    'photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'image_url',p.image_url,
      'managed',p.storage_path is not null,'alt_text',p.alt_text) order by p.is_cover desc,p.sort_order,p.id)
      from public.location_photos p where p.location_id=l.id and p.status='published'
        and p.lifecycle_status='ready'),'[]'::jsonb),
    'contact_available',private.location_contact_channels_valid(l.id)
  ) from public.locations l where l.slug=p_slug and l.status='published';
$$;
revoke all on function public.get_public_location(text) from public;
grant execute on function public.get_public_location(text) to anon,authenticated;

-- Add Location requests to the existing in-app notification stream without
-- changing Profile request rows, wallet, transitions, or email behavior.
create or replace function public.get_my_network_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
  perform public.refresh_my_contact_requests();
  perform public.refresh_my_location_requests();
  return jsonb_build_object(
    'followers',(select count(*) from public.profile_follows where profile_id=auth.uid()),
    'following',(select count(*) from public.profile_follows where follower_id=auth.uid()),
    'pending_received',(select count(*) from public.catalog_inquiries where recipient_id=auth.uid() and request_state='pending'),
    'location_pending_received',(select count(*) from public.location_contact_requests where owner_id=auth.uid() and state='pending'),
    'unread',(select count(*) from public.notifications where user_id=auth.uid() and read_at is null));
end $$;

create or replace function public.get_my_network_notifications(p_page integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
  perform public.refresh_my_contact_requests();
  perform public.refresh_my_location_requests();
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select n.id,n.type,n.created_at,n.read_at,
      case when n.actor_user_id is null then 'FILMATTA' else private.profile_contact_sender_name(n.actor_user_id) end actor_name,
      case when n.type not in ('contact_request_expiring','location_request_expired') then p.presentation->>'portrait_media_id' end portrait_media_id,
      case when n.type not in ('contact_request_expiring','location_request_expired') then p.presentation->>'portrait_url' end portrait_url,
      n.actor_user_id is not null and n.type not in ('contact_request_expiring','location_request_expired') as has_actor,
      case when q.sender_id=auth.uid() or q.recipient_id=auth.uid() then q.project_snapshot->>'title' end project_title,
      case when n.entity_type='location_request' then lr.location_title_snapshot end location_title,
      case when n.entity_type='contact_request' then '/cuenta/contactos/'||n.entity_id::text
        when n.entity_type='location_request' then '/cuenta/contactos/locaciones/'||n.entity_id::text
        when p.slug is not null then '/perfiles/'||p.slug else '/mi-red' end href
    from public.notifications n
    left join public.professional_profiles p on p.user_id=n.actor_user_id and p.is_public
    left join public.catalog_inquiries q on n.entity_type='contact_request' and q.id=n.entity_id
    left join public.location_contact_requests lr on n.entity_type='location_request' and lr.id=n.entity_id
    where n.user_id=auth.uid() order by n.created_at desc,n.id
    limit 25 offset (greatest(1,least(coalesce(p_page,1),1000))-1)*24
  ) x),'[]'::jsonb);
end $$;
revoke all on function public.get_my_network_notifications(integer) from public,anon;
grant execute on function public.get_my_network_notifications(integer) to authenticated;

comment on table private.location_credit_accounts is 'One-time Location credit grant. Profile and AI balances are intentionally unrelated.';
comment on table public.location_contact_requests is 'Protected, location-scoped requests. Contact snapshots are returned only through participant RPCs.';

commit;
