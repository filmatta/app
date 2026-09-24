begin;

create or replace function public.reserve_my_location_photo(
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
  if p_size is null or p_size not between 1 and 10000000 then raise exception 'Invalid file size' using errcode='22023'; end if;
  if not (
    (p_mime='image/jpeg' and lower(p_extension) in ('jpg','jpeg')) or
    (p_mime='image/png' and lower(p_extension)='png') or
    (p_mime='image/webp' and lower(p_extension)='webp')
  ) then raise exception 'Invalid file type' using errcode='22023'; end if;

  select * into target from public.locations where id=p_location_id and owner_id=actor for update;
  if not found then raise exception 'Location unavailable' using errcode='42501'; end if;
  select * into existing from public.location_photos where id=p_idempotency_key;
  if found then
    if existing.owner_id<>actor or existing.location_id<>p_location_id
      or existing.expected_size_bytes<>p_size or existing.mime_type<>p_mime then
      raise exception 'Idempotency key conflict' using errcode='22023';
    end if;
    if existing.lifecycle_status='uploading' and existing.expires_at>clock_timestamp() then
      return jsonb_build_object('id',existing.id,'path',existing.storage_path,'expires_at',existing.expires_at);
    end if;
    raise exception 'Previous upload cleanup pending' using errcode='LPH02';
  end if;

  select count(*)::int into photo_count from public.location_photos
    where location_id=p_location_id and lifecycle_status in ('uploading','ready','deleting','delete_failed');
  if photo_count>=20 then raise exception 'LOCATION_PHOTO_LIMIT' using errcode='LPH01'; end if;
  object_path:=actor::text||'/'||p_location_id::text||'/'||p_idempotency_key::text||'/original.'||lower(p_extension);
  select coalesce(max(sort_order)+1,0) into next_order from public.location_photos where location_id=p_location_id;
  insert into public.location_photos(
    id,location_id,owner_id,image_url,storage_path,sort_order,status,
    lifecycle_status,expected_size_bytes,mime_type,expires_at,is_cover
  ) values(
    p_idempotency_key,p_location_id,actor,null,object_path,next_order,'draft',
    'uploading',p_size,p_mime,clock_timestamp()+interval '1 hour',false
  );
  return jsonb_build_object('id',p_idempotency_key,'path',object_path,'expires_at',clock_timestamp()+interval '1 hour');
end $$;

revoke all on function public.reserve_my_location_photo(uuid,bigint,text,text,uuid) from public,anon;
grant execute on function public.reserve_my_location_photo(uuid,bigint,text,text,uuid) to authenticated;

commit;
