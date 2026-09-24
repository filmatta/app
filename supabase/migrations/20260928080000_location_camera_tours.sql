begin;

create table public.location_tour_attempts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation bigint not null check (generation > 0),
  status text not null default 'authorizing' check (status in (
    'authorizing','uploading','processing','ready','errored','cancelled',
    'rejected','delete_pending','deleted'
  )),
  declared_blob_bytes bigint not null check (declared_blob_bytes between 1 and 150000000),
  declared_mime_type text not null check (
    length(declared_mime_type) <= 128
    and lower(declared_mime_type) ~ '^video\/(webm|mp4)(;[a-z0-9._=,+ -]+)?$'
  ),
  mux_upload_id text unique,
  mux_asset_id text unique,
  mux_playback_id text,
  mux_environment_id text,
  mux_environment_type text check (mux_environment_type in ('development','production')),
  duration_seconds numeric,
  aspect_ratio text,
  has_audio boolean,
  authorization_expires_at timestamptz not null default (now() + interval '15 minutes'),
  cleanup_after timestamptz,
  terminal_reason text,
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, generation),
  check ((mux_upload_id is null) = (mux_environment_id is null)),
  check ((mux_upload_id is null) = (mux_environment_type is null)),
  check (duration_seconds is null or duration_seconds > 0)
);

create unique index location_tour_one_pending
  on public.location_tour_attempts(location_id)
  where status in ('authorizing','uploading','processing');
create index location_tour_owner_created
  on public.location_tour_attempts(owner_id, location_id, created_at desc);
create index location_tour_cleanup
  on public.location_tour_attempts(cleanup_after)
  where cleanup_after is not null;

alter table public.locations
  add column tour_generation bigint not null default 0,
  add column active_tour_attempt_id uuid references public.location_tour_attempts(id) on delete set null;

create function private.protect_location_tour_system_columns()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    if tg_op='INSERT' and new.tour_video_url is not null then
      raise exception 'External location tours cannot be created' using errcode='42501';
    end if;
    if tg_op='UPDATE' and (
      new.tour_video_url is distinct from old.tour_video_url
      or new.tour_generation is distinct from old.tour_generation
      or new.active_tour_attempt_id is distinct from old.active_tour_attempt_id
    ) then raise exception 'Location tour state is server-managed' using errcode='42501'; end if;
  end if;
  return new;
end $$;

create trigger locations_protect_tour_state
before insert or update on public.locations
for each row execute function private.protect_location_tour_system_columns();
revoke all on function private.protect_location_tour_system_columns() from public,anon,authenticated;

create trigger location_tour_attempts_updated
before update on public.location_tour_attempts
for each row execute function private.set_professional_profiles_updated_at();

alter table public.location_tour_attempts enable row level security;
revoke all on public.location_tour_attempts from public, anon, authenticated;
grant select on public.location_tour_attempts to authenticated;
grant select, insert, update, delete on public.location_tour_attempts to service_role;
create policy location_tour_owner_read on public.location_tour_attempts
  for select to authenticated using (owner_id = (select auth.uid()));

create function public.reserve_my_location_tour(
  p_location_id uuid,
  p_blob_bytes bigint,
  p_mime_type text
) returns table (attempt_id uuid, can_create_upload boolean)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.locations;
  pending public.location_tour_attempts;
  next_generation bigint;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_blob_bytes is null or p_blob_bytes < 1 or p_blob_bytes > 150000000
    or p_mime_type is null or length(p_mime_type) > 128
    or lower(p_mime_type) !~ '^video\/(webm|mp4)(;[a-z0-9._=,+ -]+)?$'
  then raise exception 'Invalid camera recording declaration' using errcode='22023'; end if;

  select * into target from public.locations
    where id=p_location_id and owner_id=actor for update;
  if not found then raise exception 'Location not found' using errcode='42501'; end if;

  select * into pending from public.location_tour_attempts
    where location_id=target.id and status in ('authorizing','uploading','processing')
    order by generation desc limit 1 for update;
  if found and pending.status='authorizing' and pending.authorization_expires_at <= now() then
    update public.location_tour_attempts set status='errored', terminal_reason='authorization-expired'
      where id=pending.id;
    pending := null;
  end if;
  if pending.id is not null then
    return query select pending.id, false;
    return;
  end if;

  if (select count(*) from public.location_tour_attempts
      where location_id=target.id and status='delete_pending') >= 3
  then raise exception 'Location tour cleanup pending' using errcode='55000'; end if;

  next_generation := target.tour_generation + 1;
  update public.locations set tour_generation=next_generation where id=target.id;
  insert into public.location_tour_attempts(
    location_id,owner_id,generation,declared_blob_bytes,declared_mime_type
  ) values (
    target.id,actor,next_generation,p_blob_bytes,lower(p_mime_type)
  ) returning id into attempt_id;
  can_create_upload := true;
  return next;
end $$;

create function public.bind_my_location_tour_upload(
  p_attempt_id uuid,
  p_upload_id text,
  p_environment_id text,
  p_environment_type text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if auth.uid() is null or p_upload_id is null or p_upload_id !~ '^[A-Za-z0-9]+$'
    or p_environment_id is null or p_environment_type not in ('development','production')
  then return false; end if;
  update public.location_tour_attempts set
    status='uploading', mux_upload_id=p_upload_id,
    mux_environment_id=p_environment_id, mux_environment_type=p_environment_type
  where id=p_attempt_id and owner_id=auth.uid() and status='authorizing'
    and authorization_expires_at > now();
  get diagnostics changed = row_count;
  return changed=1;
end $$;

create function public.fail_my_location_tour_reservation(p_attempt_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.location_tour_attempts set status='errored',terminal_reason='upload-creation-failed'
  where id=p_attempt_id and owner_id=auth.uid() and status='authorizing';
$$;

create function public.cancel_my_location_tour_reservation(p_attempt_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update public.location_tour_attempts set status='cancelled',terminal_reason='cancelled-by-owner'
  where id=p_attempt_id and owner_id=auth.uid() and status='authorizing';
  get diagnostics changed = row_count;
  return changed=1;
end $$;

revoke all on function public.reserve_my_location_tour(uuid,bigint,text) from public,anon;
revoke all on function public.bind_my_location_tour_upload(uuid,text,text,text) from public,anon;
revoke all on function public.fail_my_location_tour_reservation(uuid) from public,anon;
revoke all on function public.cancel_my_location_tour_reservation(uuid) from public,anon;
grant execute on function public.reserve_my_location_tour(uuid,bigint,text) to authenticated;
grant execute on function public.bind_my_location_tour_upload(uuid,text,text,text) to authenticated;
grant execute on function public.fail_my_location_tour_reservation(uuid) to authenticated;
grant execute on function public.cancel_my_location_tour_reservation(uuid) to authenticated;

create function public.promote_location_tour(
  p_attempt_id uuid,
  p_generation bigint,
  p_upload_id text,
  p_asset_id text,
  p_playback_id text,
  p_environment_id text,
  p_environment_type text,
  p_duration_seconds numeric,
  p_aspect_ratio text,
  p_has_audio boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  candidate public.location_tour_attempts;
  target public.locations;
  previous public.location_tour_attempts;
begin
  select * into candidate from public.location_tour_attempts where id=p_attempt_id for update;
  if not found or candidate.generation<>p_generation or candidate.status not in ('uploading','processing')
    or candidate.mux_upload_id is distinct from p_upload_id
    or candidate.mux_environment_id is distinct from p_environment_id
    or candidate.mux_environment_type is distinct from p_environment_type
    or p_asset_id is null or p_asset_id !~ '^[A-Za-z0-9]+$'
    or p_playback_id is null or p_playback_id !~ '^[A-Za-z0-9]+$'
    or p_duration_seconds is null or p_duration_seconds<=0 or p_duration_seconds>180
  then return null; end if;

  select * into target from public.locations where id=candidate.location_id for update;
  if not found or target.owner_id<>candidate.owner_id or target.tour_generation<>candidate.generation then
    update public.location_tour_attempts set status='rejected',terminal_reason='stale-generation',cleanup_after=now()
      where id=candidate.id;
    return null;
  end if;
  if target.active_tour_attempt_id is not null then
    select * into previous from public.location_tour_attempts
      where id=target.active_tour_attempt_id for update;
  end if;

  update public.location_tour_attempts set
    status='ready',mux_asset_id=p_asset_id,mux_playback_id=p_playback_id,
    duration_seconds=p_duration_seconds,aspect_ratio=p_aspect_ratio,has_audio=p_has_audio,
    recorded_at=now(),terminal_reason=null,cleanup_after=null
  where id=candidate.id;
  update public.locations set active_tour_attempt_id=candidate.id where id=target.id;

  if previous.id is not null and previous.id<>candidate.id then
    update public.location_tour_attempts set status='delete_pending',cleanup_after=now()
      where id=previous.id;
  end if;
  return jsonb_build_object(
    'previous_attempt_id',previous.id,
    'previous_asset_id',previous.mux_asset_id
  );
end $$;

revoke all on function public.promote_location_tour(uuid,bigint,text,text,text,text,text,numeric,text,boolean) from public,anon,authenticated;
grant execute on function public.promote_location_tour(uuid,bigint,text,text,text,text,text,numeric,text,boolean) to service_role;

drop function public.list_public_locations(text,text,text,integer,integer);
create function public.list_public_locations(
  p_query text default null,p_city text default null,p_environment text default null,
  p_limit integer default 25,p_offset integer default 0
) returns table (
  id uuid,title text,slug text,summary text,city text,area text,space_type text,
  environment text,price_amount numeric,price_currency text,price_unit text,
  rate_mode text,rate_tiers jsonb,minimum_hours numeric,
  published_at timestamptz,photos jsonb
)
language sql stable security definer set search_path = '' as $$
  select l.id,l.title,l.slug,l.summary,l.city,l.area,l.space_type,l.environment,
    l.price_amount,l.price_currency,l.price_unit,l.rate_mode,l.rate_tiers,l.minimum_hours,l.published_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'image_url',p.image_url,'alt_text',p.alt_text,'managed',p.storage_path is not null) order by p.is_cover desc,p.sort_order,p.id)
      from (select p.* from public.location_photos p where p.location_id=l.id and p.status='published' and p.lifecycle_status='ready' order by p.is_cover desc,p.sort_order,p.id limit 1) p),'[]'::jsonb)
  from public.locations l where l.status='published'
    and (nullif(btrim(p_query),'') is null or l.title ilike '%'||replace(replace(replace(btrim(p_query),'\','\\'),'%','\%'),'_','\_')||'%' escape '\')
    and (nullif(btrim(p_city),'') is null or l.city ilike '%'||replace(replace(replace(btrim(p_city),'\','\\'),'%','\%'),'_','\_')||'%' escape '\')
    and (p_environment is null or p_environment='' or l.environment=p_environment)
  order by l.published_at desc,l.id limit least(greatest(p_limit,1),51) offset greatest(p_offset,0);
$$;

create or replace function public.get_public_location(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',l.id,'title',l.title,'slug',l.slug,'summary',l.summary,'description',l.description,
    'city',l.city,'area',l.area,'space_type',l.space_type,'environment',l.environment,
    'price_amount',l.price_amount,'price_currency',l.price_currency,'price_unit',l.price_unit,
    'rate_mode',l.rate_mode,'rate_tiers',l.rate_tiers,'minimum_hours',l.minimum_hours,
    'restrictions',l.restrictions,'characteristics',l.characteristics,'shooting_conditions',l.shooting_conditions,
    'tour_video_url',l.tour_video_url,'operational_notes',l.operational_notes,'published_at',l.published_at,
    'camera_tour',(select jsonb_build_object('id',t.id,'recorded_at',t.recorded_at)
      from public.location_tour_attempts t where t.id=l.active_tour_attempt_id and t.status='ready'),
    'photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'image_url',p.image_url,'alt_text',p.alt_text,'managed',p.storage_path is not null) order by p.is_cover desc,p.sort_order,p.id)
      from public.location_photos p where p.location_id=l.id and p.status='published' and p.lifecycle_status='ready'),'[]'::jsonb),
    'contact_available',exists(select 1 from private.location_contact_channels c where c.location_id=l.id and c.owner_id=l.owner_id and (c.email is not null or c.phone is not null or c.whatsapp is not null or c.instagram is not null))
  ) from public.locations l where l.slug=p_slug and l.status='published';
$$;

revoke all on function public.list_public_locations(text,text,text,integer,integer) from public;
grant execute on function public.list_public_locations(text,text,text,integer,integer) to anon,authenticated;

comment on table public.location_tour_attempts is 'Camera-only location tour ingestion attempts; provider attestation is required before activation.';
comment on column public.locations.active_tour_attempt_id is 'Single provider-validated camera tour presented instead of any historical external tour URL.';

commit;
