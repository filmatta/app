-- Portfolio media has its own lifecycle; professional_profiles remains the identity.
begin;
alter table public.professional_profiles add column media_initialized boolean not null default false;
create table public.profile_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.professional_profiles(user_id) on delete cascade,
  category text not null check(category in ('work','reel','book')),
  title text not null check(length(btrim(title)) between 1 and 100),
  role text not null default '' check(length(role)<=80),
  year text not null default '' check(year ~ '^(|19[0-9]{2}|20[0-9]{2})$'),
  description text not null default '' check(length(description)<=240),
  media_type text not null check(media_type in ('image','video','link')),
  source text not null check(source in ('external','storage','mux')),
  url text not null default '' check(length(url)<=500),
  provider text check(provider in ('youtube','vimeo')),
  external_video_id text,
  thumbnail_id uuid references public.profile_media(id) on delete set null,
  featured boolean not null default false,
  sort_order integer not null default 0 check(sort_order>=0),
  visibility text not null default 'visible' check(visibility in ('visible','hidden','archived')),
  status text not null default 'ready' check(status in ('uploading','processing','ready','errored','rejected','deleted')),
  storage_path text unique,
  expected_size_bytes bigint check(expected_size_bytes>0),
  mime_type text,
  mux_upload_id text unique, mux_asset_id text unique, mux_playback_id text,
  mux_environment_id text, mux_environment_type text,
  expires_at timestamptz,
  cleanup_after timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(source<>'mux' or media_type='video'), check(source<>'storage' or media_type='image')
);
create index profile_media_owner_order on public.profile_media(owner_id,category,sort_order,id);
create index profile_media_cleanup on public.profile_media(cleanup_after) where cleanup_after is not null;
create unique index profile_media_one_feature on public.profile_media(owner_id,category) where featured and visibility='visible';
alter table public.profile_media enable row level security;
revoke all on public.profile_media from public,anon,authenticated;
grant select on public.profile_media to authenticated;
create policy profile_media_owner_read on public.profile_media for select to authenticated using(owner_id=(select auth.uid()));
grant select,update on public.profile_media to service_role;
create trigger profile_media_updated before update on public.profile_media for each row execute function private.set_professional_profiles_updated_at();

-- Import once under a row lock. Retain historical JSONB for rollback; no destructive copy.
create function public.initialize_my_profile_media() returns void language plpgsql security definer set search_path='' as $$
declare p public.professional_profiles; item jsonb; n integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into p from public.professional_profiles where user_id=auth.uid() for update;
  if not found then raise exception 'Save profile identity first' using errcode='22023'; end if;
  if p.media_initialized then return; end if;
  for item in select value from jsonb_array_elements(p.portfolio_items) loop
    insert into public.profile_media(owner_id,category,title,description,media_type,source,url,sort_order)
    values(p.user_id,case when item->>'kind'='reel' then 'reel' else 'work' end,item->>'title',coalesce(item->>'summary',''),'link','external',item->>'url',n);
    n:=n+1;
  end loop;
  n:=0;
  for item in select value from jsonb_array_elements(p.presentation->'book') loop
    insert into public.profile_media(owner_id,category,title,media_type,source,url,sort_order)
    values(p.user_id,'book',coalesce(nullif(item->>'caption',''),'Book'),'image','external',item->>'url',n);
    n:=n+1;
  end loop;
  update public.professional_profiles set media_initialized=true where user_id=p.user_id;
end $$;
revoke all on function public.initialize_my_profile_media() from public,anon;
grant execute on function public.initialize_my_profile_media() to authenticated;

create function public.get_profile_media(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when p.media_initialized then coalesce((select jsonb_agg(jsonb_build_object(
 'id',m.id,'category',m.category,'title',m.title,'role',m.role,'year',m.year,'description',m.description,
 'media_type',m.media_type,'source',m.source,'url',m.url,'provider',m.provider,'external_video_id',m.external_video_id,
 'thumbnail_id',m.thumbnail_id,'featured',m.featured,'sort_order',m.sort_order,'visibility',m.visibility,'status',m.status,
 'created_at',m.created_at,'updated_at',m.updated_at) order by m.sort_order,m.id)
 from public.profile_media m where m.owner_id=p.user_id and (p.user_id=auth.uid() or (m.visibility='visible' and m.status='ready'))),'[]'::jsonb) else null end
 from public.professional_profiles p where p.slug=p_slug and (p.is_public or p.user_id=auth.uid());
$$;
revoke all on function public.get_profile_media(text) from public;
grant execute on function public.get_profile_media(text) to anon,authenticated;

create function public.save_my_profile_media(p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare m public.profile_media; result uuid; category_value text; video_id text; provider_value text; target_url text;
begin
  perform public.initialize_my_profile_media();
  if p_id is not null then
    select * into m from public.profile_media where id=p_id and owner_id=auth.uid() for update;
    if not found then raise exception 'Not allowed' using errcode='42501'; end if;
  end if;
  category_value:=p_data->>'category'; target_url:=coalesce(p_data->>'url','');
  if category_value not in ('reel','work','book') or jsonb_typeof(p_data->'featured') is distinct from 'boolean' then raise exception 'Invalid metadata' using errcode='22023'; end if;
  if p_id is null then
    if p_data->>'source'<>'external' or p_data->>'media_type'<>'video' or category_value='book' then raise exception 'Reserve upload first' using errcode='22023'; end if;
    if (select count(*) from public.profile_media where owner_id=auth.uid() and visibility<>'archived')>=100 then raise exception 'Portfolio limit reached'; end if;
  elsif p_data->>'source' is distinct from m.source or p_data->>'media_type' is distinct from m.media_type or category_value is distinct from m.category then
    raise exception 'Media source is immutable' using errcode='22023';
  end if;
  if p_id is null or (m.media_type='video' and m.source='external') then
    if target_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$' then provider_value:='youtube'; video_id:=split_part(target_url,'=',2);
    elsif target_url ~ '^https://vimeo\.com/[0-9]{1,15}(/[A-Za-z0-9]{1,64})?$' then provider_value:='vimeo'; video_id:=split_part(target_url,'/',4);
    else raise exception 'Invalid provider' using errcode='22023'; end if;
  elsif target_url is distinct from m.url then raise exception 'Media URL is immutable' using errcode='22023'; end if;
  if coalesce(p_data->>'role','')='' and category_value='work' and (p_id is null or m.source<>'external') then raise exception 'Role required'; end if;
  if (p_data->>'featured')::boolean then update public.profile_media set featured=false where owner_id=auth.uid() and category=category_value and featured; end if;
  if p_id is null then
    insert into public.profile_media(owner_id,category,title,role,year,description,media_type,source,url,provider,external_video_id,featured,sort_order)
    values(auth.uid(),category_value,p_data->>'title',coalesce(p_data->>'role',''),coalesce(p_data->>'year',''),coalesce(p_data->>'description',''),'video','external',target_url,provider_value,video_id,(p_data->>'featured')::boolean,
      coalesce((select max(sort_order)+1 from public.profile_media where owner_id=auth.uid() and category=category_value),0)) returning id into result;
  else
    update public.profile_media set title=p_data->>'title',role=coalesce(p_data->>'role',''),year=coalesce(p_data->>'year',''),description=coalesce(p_data->>'description',''),url=target_url,
      provider=coalesce(provider_value,provider),external_video_id=coalesce(video_id,external_video_id),featured=(p_data->>'featured')::boolean where id=p_id returning id into result;
  end if;
  return result;
end $$;
revoke all on function public.save_my_profile_media(uuid,jsonb) from public,anon;
grant execute on function public.save_my_profile_media(uuid,jsonb) to authenticated;

create function public.manage_my_profile_media(p_id uuid,p_action text,p_target uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare m public.profile_media; neighbor public.profile_media;
begin
  perform public.initialize_my_profile_media();
  select * into m from public.profile_media where id=p_id and owner_id=auth.uid() for update;
  if not found or m.status='deleted' then raise exception 'Not allowed' using errcode='42501'; end if;
  if p_action in ('up','down') then
    -- Normalize under the parent lock so legacy/import ties cannot lose order.
    with positions as(select id,row_number() over(order by sort_order,id)-1 n from public.profile_media where owner_id=auth.uid() and category=m.category and visibility<>'archived')
    update public.profile_media t set sort_order=positions.n from positions where t.id=positions.id;
    select * into m from public.profile_media where id=p_id;
    select * into neighbor from public.profile_media where owner_id=auth.uid() and category=m.category and visibility<>'archived' and sort_order=m.sort_order+case when p_action='up' then -1 else 1 end;
    if found then update public.profile_media set sort_order=case when id=m.id then neighbor.sort_order else m.sort_order end where id in(m.id,neighbor.id); end if;
  elsif p_action='feature' then
    update public.profile_media set featured=false where owner_id=auth.uid() and category=m.category and featured;
    update public.profile_media set featured=not m.featured,visibility='visible' where id=p_id;
  elsif p_action in ('hide','show','archive','restore') then
    update public.profile_media set visibility=case p_action when 'show' then 'visible' when 'restore' then 'hidden' when 'hide' then 'hidden' else 'archived' end,
      featured=false,cleanup_after=case when p_action='archive' then now()+interval '30 days' else null end where id=p_id;
  elsif p_action='thumbnail' then
    if p_target is not null and not exists(select 1 from public.profile_media where id=p_target and owner_id=auth.uid() and media_type='image' and status='ready' and visibility<>'archived') then raise exception 'Invalid thumbnail' using errcode='42501'; end if;
    update public.profile_media set thumbnail_id=p_target where id=p_id;
  else raise exception 'Invalid action' using errcode='22023'; end if;
end $$;
revoke all on function public.manage_my_profile_media(uuid,text,uuid) from public,anon;
grant execute on function public.manage_my_profile_media(uuid,text,uuid) to authenticated;

-- Reservation counts survive archive/failure. Serializing by profile closes quota races.
create function public.reserve_my_profile_upload(p_data jsonb,p_size bigint,p_mime text,p_extension text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid:=gen_random_uuid(); src text:=p_data->>'source'; kind text:=p_data->>'media_type'; cat text:=p_data->>'category';
begin
 perform public.initialize_my_profile_media();
 if src not in ('mux','storage') or (src='mux' and kind<>'video') or (src='storage' and kind<>'image') or cat not in ('work','reel','book') or (cat='reel' and kind<>'video') or (cat='book' and kind<>'image') then raise exception 'Invalid upload'; end if;
 if p_size is null or p_size<=0 or p_size>(case when src='mux' then 5000000000 else 20000000 end) then raise exception 'File too large or invalid'; end if;
 if p_mime is null or p_extension is null or not ((src='mux' and ((p_mime='video/mp4' and p_extension='mp4') or (p_mime='video/quicktime' and p_extension='mov'))) or
 (src='storage' and ((p_mime='image/jpeg' and p_extension in('jpg','jpeg')) or (p_mime='image/png' and p_extension='png') or (p_mime='image/webp' and p_extension='webp')))) then raise exception 'Invalid file type'; end if;
 update public.profile_media set status='errored',cleanup_after=now() where owner_id=auth.uid() and status in('uploading','processing') and expires_at<now();
 if (select count(*) from public.profile_media where owner_id=auth.uid() and status in('uploading','processing'))>=2 then raise exception 'Pending upload limit'; end if;
 if (select count(*) from public.profile_media where owner_id=auth.uid() and source=src and created_at>now()-interval '1 day')>=(case when src='mux' then 10 else 30 end) then raise exception 'Daily upload limit'; end if;
 if (select count(*) from public.profile_media where owner_id=auth.uid() and source=src and created_at>now()-interval '30 days')>=(case when src='mux' then 30 else 100 end) then raise exception 'Monthly upload limit'; end if;
 if (select count(*) from public.profile_media where owner_id=auth.uid() and visibility<>'archived')>=100 then raise exception 'Portfolio limit'; end if;
 if cat='work' and coalesce(p_data->>'role','')='' then raise exception 'Role required'; end if;
 insert into public.profile_media(id,owner_id,category,title,role,year,description,media_type,source,status,expected_size_bytes,mime_type,storage_path,expires_at,sort_order)
 values(result,auth.uid(),cat,p_data->>'title',coalesce(p_data->>'role',''),coalesce(p_data->>'year',''),coalesce(p_data->>'description',''),kind,src,'uploading',p_size,p_mime,
 case when src='storage' then auth.uid()::text||'/'||result::text||'/original.'||p_extension else null end,now()+interval '2 hours',
 coalesce((select max(sort_order)+1 from public.profile_media where owner_id=auth.uid() and category=cat),0));
 return result;
end $$;
revoke all on function public.reserve_my_profile_upload(jsonb,bigint,text,text) from public,anon;
grant execute on function public.reserve_my_profile_upload(jsonb,bigint,text,text) to authenticated;

-- Binding is not verification: webhook independently verifies Mux's canonical passthrough.
create function public.bind_my_profile_upload(p_id uuid,p_upload text,p_environment text,p_environment_type text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.profile_media set mux_upload_id=p_upload,mux_environment_id=p_environment,mux_environment_type=p_environment_type
 where id=p_id and owner_id=auth.uid() and source='mux' and status='uploading' and mux_upload_id is null;
 if not found then raise exception 'Not allowed' using errcode='42501'; end if;
end $$;
revoke all on function public.bind_my_profile_upload(uuid,text,text,text) from public,anon;
grant execute on function public.bind_my_profile_upload(uuid,text,text,text) to authenticated;

create function public.get_profile_media_resource(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('storage_path',m.storage_path,'source',m.source,'url',m.url,'mux_playback_id',m.mux_playback_id,'mux_environment_id',m.mux_environment_id,'mux_environment_type',m.mux_environment_type)
 from public.profile_media m join public.professional_profiles p on p.user_id=m.owner_id
 where m.id=p_id and m.status='ready' and m.visibility<>'archived' and (p.user_id=auth.uid() or (p.is_public and m.visibility='visible'));
$$;
revoke all on function public.get_profile_media_resource(uuid) from public;
grant execute on function public.get_profile_media_resource(uuid) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('profile-media','profile-media',false,20000000,array['image/jpeg','image/png','image/webp']);
create policy profile_media_image_insert on storage.objects for insert to authenticated with check(
 bucket_id='profile-media' and exists(select 1 from public.profile_media m where m.owner_id=auth.uid() and m.storage_path=name and m.source='storage' and m.status='uploading' and m.expires_at>now()));
-- Definer predicate exposes only an authorization decision, never profile/private fields.
create function public.can_read_profile_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profile_media m join public.professional_profiles p on p.user_id=m.owner_id where m.storage_path=p_path and
 (m.owner_id=auth.uid() or (p.is_public and m.visibility='visible' and m.status='ready')));
$$;
revoke all on function public.can_read_profile_image(text) from public;
grant execute on function public.can_read_profile_image(text) to anon,authenticated;
create policy profile_media_image_read on storage.objects for select to anon,authenticated using(bucket_id='profile-media' and public.can_read_profile_image(name));
-- Compatibility readers must never expose historical JSON after an item is hidden.
create function private.profile_visible_links(p_owner uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('kind',case when category='reel' then 'reel' else 'project' end,'title',title,'url',url,'summary',description) order by featured desc,sort_order,id),'[]'::jsonb)
 from public.profile_media where owner_id=p_owner and visibility='visible' and status='ready' and source='external' and media_type<>'image';
$$;
revoke all on function private.profile_visible_links(uuid) from public,anon,authenticated;
create function private.profile_visible_presentation(p public.professional_profiles) returns jsonb language sql stable set search_path='' as $$
 select case when p.media_initialized then jsonb_set(p.presentation,'{book}',coalesce((select jsonb_agg(jsonb_build_object('url',url,'caption',title) order by featured desc,sort_order,id) from public.profile_media where owner_id=p.user_id and category='book' and source='external' and visibility='visible' and status='ready'),'[]'::jsonb)) else p.presentation end;
$$;
revoke all on function private.profile_visible_presentation(public.professional_profiles) from public,anon,authenticated;
create or replace function public.get_public_professional_profile(p_slug text)
returns table(slug text,display_name text,disciplines text[],city text,bio text,availability text,skills text[],equipment text[],portfolio_items jsonb,contact_policy text,is_public boolean,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
 select p.slug,p.display_name,p.disciplines,p.city,p.bio,p.availability,p.skills,p.equipment,
 case when p.media_initialized then private.profile_visible_links(p.user_id) else p.portfolio_items end,p.contact_policy,p.is_public,p.updated_at
 from public.professional_profiles p where p.slug=p_slug and p.is_public limit 1;
$$;
create or replace function public.get_public_professional_portfolio(p_slug text)
returns table(slug text,display_name text,disciplines text[],city text,bio text,availability text,skills text[],equipment text[],portfolio_items jsonb,contact_policy text,is_public boolean,updated_at timestamptz,presentation jsonb)
language sql stable security definer set search_path='' as $$
 select p.slug,p.display_name,p.disciplines,p.city,p.bio,p.availability,p.skills,p.equipment,
 case when p.media_initialized then private.profile_visible_links(p.user_id) else p.portfolio_items end,p.contact_policy,p.is_public,p.updated_at,private.profile_visible_presentation(p)
 from public.professional_profiles p where p.slug=p_slug and p.is_public limit 1;
$$;
create or replace function public.list_public_professional_portfolios(p_page integer default 1,p_discipline text default '',p_city text default '',p_availability text default '',p_talent boolean default false)
returns table(slug text,display_name text,disciplines text[],city text,bio text,availability text,updated_at timestamptz,portfolio_items jsonb,presentation jsonb)
language sql stable security definer set search_path='' as $$
 select p.slug,p.display_name,p.disciplines,p.city,p.bio,p.availability,p.updated_at,
 case when p.media_initialized then private.profile_visible_links(p.user_id) else p.portfolio_items end,
 jsonb_set(jsonb_set(private.profile_visible_presentation(p),'{rate_range}','""'::jsonb),'{credits}','[]'::jsonb)
 from public.list_public_professional_profiles(p_page,p_discipline,p_city,p_availability,p_talent) summary
 join public.professional_profiles p on p.slug=summary.slug and p.is_public order by p.updated_at desc,p.slug asc;
$$;
commit;
