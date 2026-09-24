begin;

-- Location photos use a dedicated private bucket and keep quota state on the
-- existing location_photos row. Historical external URLs remain readable but
-- cannot be used for new uploads.
alter table public.location_photos
  alter column image_url drop not null,
  add column lifecycle_status text not null default 'ready',
  add column expected_size_bytes bigint,
  add column mime_type text,
  add column expires_at timestamptz,
  add column is_cover boolean not null default false,
  add constraint location_photos_lifecycle_check check (
    lifecycle_status in ('uploading','ready','deleting','delete_failed')
  ),
  add constraint location_photos_upload_metadata_check check (
    (lifecycle_status = 'uploading'
      and storage_path is not null
      and expected_size_bytes between 1 and 10000000
      and mime_type in ('image/jpeg','image/png','image/webp')
      and expires_at is not null)
    or lifecycle_status <> 'uploading'
  );

alter table public.location_photos drop constraint location_photos_image_url_check;
alter table public.location_photos add constraint location_photos_image_url_check check (
  image_url is null or (
    image_url = btrim(image_url)
    and image_url ~ '^https://'
    and char_length(image_url) <= 2048
  )
);

create unique index location_photos_storage_path_unique
  on public.location_photos(storage_path) where storage_path is not null;
create index location_photos_cleanup_idx
  on public.location_photos(location_id, expires_at)
  where lifecycle_status in ('uploading','delete_failed');

with first_photos as (
  select distinct on (location_id) id
  from public.location_photos
  where status <> 'archived' and lifecycle_status = 'ready'
  order by location_id, sort_order, id
)
update public.location_photos p set is_cover = true
from first_photos f where f.id = p.id;

create unique index location_photos_one_cover
  on public.location_photos(location_id)
  where is_cover and lifecycle_status = 'ready' and status <> 'archived';

-- Direct table writes would bypass reservation and lifecycle rules.
revoke insert, update, delete on public.location_photos from authenticated;
drop policy location_photos_owner_insert on public.location_photos;
drop policy location_photos_owner_update on public.location_photos;
drop policy location_photos_owner_delete on public.location_photos;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('location-photos','location-photos',false,10000000,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.reserve_my_location_photo(
  p_location_id uuid,
  p_size bigint,
  p_mime text,
  p_extension text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.locations;
  existing public.location_photos;
  photo_count integer;
  object_path text;
  next_order integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
  if p_size is null or p_size not between 1 and 10000000 then
    raise exception 'Invalid file size' using errcode='22023';
  end if;
  if not (
    (p_mime='image/jpeg' and lower(p_extension) in ('jpg','jpeg')) or
    (p_mime='image/png' and lower(p_extension)='png') or
    (p_mime='image/webp' and lower(p_extension)='webp')
  ) then raise exception 'Invalid file type' using errcode='22023'; end if;

  select * into target from public.locations
    where id=p_location_id and owner_id=actor for update;
  if not found then raise exception 'Location unavailable' using errcode='42501'; end if;

  select * into existing from public.location_photos where id=p_idempotency_key;
  if found then
    if existing.owner_id<>actor or existing.location_id<>p_location_id
      or existing.expected_size_bytes<>p_size or existing.mime_type<>p_mime then
      raise exception 'Idempotency key conflict' using errcode='22023';
    end if;
    return jsonb_build_object('id',existing.id,'path',existing.storage_path,'expires_at',existing.expires_at);
  end if;

  select count(*)::int into photo_count from public.location_photos
    where location_id=p_location_id
      and lifecycle_status in ('uploading','ready','deleting','delete_failed');
  if photo_count>=20 then raise exception 'LOCATION_PHOTO_LIMIT' using errcode='LPH01'; end if;

  object_path := actor::text||'/'||p_location_id::text||'/'||p_idempotency_key::text||'/original.'||lower(p_extension);
  select coalesce(max(sort_order)+1,0) into next_order from public.location_photos
    where location_id=p_location_id;
  insert into public.location_photos(
    id,location_id,owner_id,image_url,storage_path,sort_order,status,
    lifecycle_status,expected_size_bytes,mime_type,expires_at,is_cover
  ) values (
    p_idempotency_key,p_location_id,actor,null,object_path,next_order,'draft',
    'uploading',p_size,p_mime,clock_timestamp()+interval '1 hour',false
  );
  return jsonb_build_object('id',p_idempotency_key,'path',object_path,
    'expires_at',clock_timestamp()+interval '1 hour');
end $$;

revoke all on function public.reserve_my_location_photo(uuid,bigint,text,text,uuid) from public,anon;
grant execute on function public.reserve_my_location_photo(uuid,bigint,text,text,uuid) to authenticated;

create policy location_photos_reserved_insert on storage.objects
for insert to authenticated with check (
  bucket_id='location-photos' and exists(
    select 1 from public.location_photos p
    where p.owner_id=auth.uid() and p.storage_path=name
      and p.lifecycle_status='uploading' and p.expires_at>clock_timestamp()
  )
);

create function public.claim_my_location_photo_cleanup(p_location_id uuid)
returns table(id uuid, storage_path text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from public.locations where locations.id=p_location_id
    and owner_id=auth.uid() for update;
  if not found then raise exception 'Location unavailable' using errcode='42501'; end if;
  return query
    update public.location_photos p set lifecycle_status='deleting',status='archived',
      is_cover=false,expires_at=null
    where p.location_id=p_location_id and p.owner_id=auth.uid()
      and ((p.lifecycle_status='uploading' and p.expires_at<=clock_timestamp())
        or p.lifecycle_status='delete_failed')
    returning p.id,p.storage_path;
end $$;
revoke all on function public.claim_my_location_photo_cleanup(uuid) from public,anon;
grant execute on function public.claim_my_location_photo_cleanup(uuid) to authenticated;

create function public.begin_my_location_photo_delete(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); photo public.location_photos; next_cover uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into photo from public.location_photos where id=p_id and owner_id=actor;
  if not found then raise exception 'Photo unavailable' using errcode='42501'; end if;
  perform 1 from public.locations where id=photo.location_id and owner_id=actor for update;
  select * into photo from public.location_photos where id=p_id and owner_id=actor for update;
  if photo.lifecycle_status not in ('uploading','ready','deleting','delete_failed') then
    raise exception 'Photo unavailable' using errcode='42501';
  end if;
  update public.location_photos set lifecycle_status='deleting',status='archived',
    is_cover=false,expires_at=null where id=p_id;
  if photo.is_cover then
    select id into next_cover from public.location_photos
      where location_id=photo.location_id and id<>p_id and lifecycle_status='ready'
        and status<>'archived' order by sort_order,id limit 1;
    if next_cover is not null then
      update public.location_photos set is_cover=true where id=next_cover;
    end if;
  end if;
  return jsonb_build_object('id',photo.id,'location_id',photo.location_id,'path',photo.storage_path);
end $$;
revoke all on function public.begin_my_location_photo_delete(uuid) from public,anon;
grant execute on function public.begin_my_location_photo_delete(uuid) to authenticated;

-- Server attestation only. The browser cannot mark an unverified object ready or
-- claim that bytes were removed.
create function public.attest_location_photo(
  p_id uuid,p_owner uuid,p_valid boolean,p_actual_size bigint,p_actual_mime text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare photo public.location_photos; location_state text; choose_cover boolean;
begin
  select * into photo from public.location_photos where id=p_id and owner_id=p_owner for update;
  if not found or photo.lifecycle_status<>'uploading' then return false; end if;
  if photo.expires_at<=clock_timestamp() then
    update public.location_photos set lifecycle_status='deleting',status='archived',
      expires_at=null,is_cover=false where id=p_id;
    return false;
  end if;
  if not p_valid or p_actual_size is distinct from photo.expected_size_bytes
    or p_actual_mime is distinct from photo.mime_type then
    update public.location_photos set lifecycle_status='deleting',status='archived',
      expires_at=null,is_cover=false where id=p_id;
    return false;
  end if;
  select status into location_state from public.locations where id=photo.location_id and owner_id=p_owner;
  if location_state is null then return false; end if;
  choose_cover := not exists(select 1 from public.location_photos
    where location_id=photo.location_id and id<>p_id and lifecycle_status='ready'
      and status<>'archived' and is_cover);
  update public.location_photos set lifecycle_status='ready',expires_at=null,
    status=case when location_state='published' then 'published' else 'draft' end,
    is_cover=choose_cover where id=p_id;
  return true;
end $$;
revoke all on function public.attest_location_photo(uuid,uuid,boolean,bigint,text) from public,anon,authenticated;
grant execute on function public.attest_location_photo(uuid,uuid,boolean,bigint,text) to service_role;

create function public.attest_location_photo_deletion(p_id uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_success then
    delete from public.location_photos where id=p_id and lifecycle_status='deleting';
    return found;
  end if;
  update public.location_photos set lifecycle_status='delete_failed'
    where id=p_id and lifecycle_status='deleting';
  return false;
end $$;
revoke all on function public.attest_location_photo_deletion(uuid,boolean) from public,anon,authenticated;
grant execute on function public.attest_location_photo_deletion(uuid,boolean) to service_role;

create function public.manage_my_location_photo(p_id uuid,p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); photo public.location_photos; neighbor public.location_photos;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into photo from public.location_photos where id=p_id and owner_id=actor;
  if not found then raise exception 'Photo unavailable' using errcode='42501'; end if;
  perform 1 from public.locations where id=photo.location_id and owner_id=actor for update;
  select * into photo from public.location_photos where id=p_id and owner_id=actor for update;
  if photo.lifecycle_status<>'ready' or photo.status='archived' then
    raise exception 'Photo unavailable' using errcode='42501';
  end if;
  if p_action='cover' then
    update public.location_photos set is_cover=false
      where location_id=photo.location_id and is_cover;
    update public.location_photos set is_cover=true where id=p_id;
  elsif p_action in ('up','down') then
    with positions as (
      select id,row_number() over(order by sort_order,id)-1 n
      from public.location_photos where location_id=photo.location_id
        and lifecycle_status='ready' and status<>'archived'
    ) update public.location_photos p set sort_order=positions.n
      from positions where p.id=positions.id;
    select * into photo from public.location_photos where id=p_id;
    select * into neighbor from public.location_photos
      where location_id=photo.location_id and lifecycle_status='ready' and status<>'archived'
        and sort_order=photo.sort_order+case when p_action='up' then -1 else 1 end;
    if found then
      update public.location_photos set sort_order=case when id=photo.id then neighbor.sort_order else photo.sort_order end
        where id in (photo.id,neighbor.id);
    end if;
  else raise exception 'Invalid action' using errcode='22023'; end if;
end $$;
revoke all on function public.manage_my_location_photo(uuid,text) from public,anon;
grant execute on function public.manage_my_location_photo(uuid,text) to authenticated;

create function private.sync_location_photo_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    update public.location_photos set status=case when new.status='published' then 'published' else 'draft' end
      where location_id=new.id and lifecycle_status='ready' and status<>'archived';
  end if;
  return new;
end $$;
revoke all on function private.sync_location_photo_publication() from public,anon,authenticated;
create trigger locations_sync_photo_publication after update of status on public.locations
for each row execute function private.sync_location_photo_publication();

create or replace function public.list_public_locations(
  p_query text default null,p_city text default null,p_environment text default null,
  p_limit integer default 25,p_offset integer default 0
) returns table (
  id uuid,title text,slug text,summary text,city text,area text,space_type text,
  environment text,price_amount numeric,price_currency text,price_unit text,
  published_at timestamptz,photos jsonb
) language sql stable security definer set search_path = '' as $$
  select l.id,l.title,l.slug,l.summary,l.city,l.area,l.space_type,l.environment,
    l.price_amount,l.price_currency,l.price_unit,l.published_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'image_url',p.image_url,
      'managed',p.storage_path is not null,'alt_text',p.alt_text) order by p.is_cover desc,p.sort_order,p.id)
      from (select p.* from public.location_photos p where p.location_id=l.id
        and p.status='published' and p.lifecycle_status='ready'
        order by p.is_cover desc,p.sort_order,p.id limit 1) p),'[]'::jsonb)
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
    'restrictions',l.restrictions,'characteristics',l.characteristics,
    'shooting_conditions',l.shooting_conditions,'tour_video_url',l.tour_video_url,
    'operational_notes',l.operational_notes,'published_at',l.published_at,
    'photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'image_url',p.image_url,
      'managed',p.storage_path is not null,'alt_text',p.alt_text) order by p.is_cover desc,p.sort_order,p.id)
      from public.location_photos p where p.location_id=l.id and p.status='published'
        and p.lifecycle_status='ready'),'[]'::jsonb),
    'contact',(select case when c.is_public then jsonb_build_object('email',c.email,'phone',c.phone,
      'whatsapp',c.whatsapp,'website',c.website) else null end
      from public.location_public_contacts c where c.location_id=l.id)
  ) from public.locations l where l.slug=p_slug and l.status='published';
$$;

revoke all on function public.list_public_locations(text,text,text,integer,integer), public.get_public_location(text) from public;
grant execute on function public.list_public_locations(text,text,text,integer,integer), public.get_public_location(text) to anon,authenticated;

comment on column public.location_photos.expires_at is 'Upload authorization expiry. Expired rows remain counted until bounded cleanup removes any object.';
comment on column public.location_photos.image_url is 'Legacy external URL only. New managed photos use storage_path in the private location-photos bucket.';

commit;
