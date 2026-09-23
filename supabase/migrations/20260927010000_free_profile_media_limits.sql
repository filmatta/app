-- Free Profile media quotas reuse the existing profile-row lock and upload lifecycle.
-- Historical rows are preserved; only new reservations, additions and restores are gated.
-- Archived media remains restorable without re-uploading, so it keeps its quota slot
-- until the underlying asset is actually deleted and the row becomes non-restorable.
begin;

create or replace function private.profile_media_free_limits_apply()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_my_billing_plan() is null;
$$;

revoke all on function private.profile_media_free_limits_apply()
  from public, anon, authenticated;

create or replace function private.profile_media_quota_reached(
  p_owner uuid,
  p_kind text,
  p_exclude uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'reel' then count(*) >= 1
    when 'video' then count(*) >= 2
    when 'book' then count(*) >= 6
    else true
  end
  from public.profile_media m
  where m.owner_id = p_owner
    and m.id is distinct from p_exclude
    and m.purpose = 'portfolio'
    and m.status in ('uploading', 'processing', 'ready')
    and case p_kind
      when 'reel' then m.category = 'reel' and m.media_type = 'video'
      when 'video' then m.category = 'work' and m.media_type = 'video'
      when 'book' then m.media_type = 'image'
      else false
    end;
$$;

revoke all on function private.profile_media_quota_reached(uuid, text, uuid)
  from public, anon, authenticated;

create or replace function public.reserve_my_profile_upload(
  p_data jsonb,
  p_size bigint,
  p_mime text,
  p_extension text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result uuid := gen_random_uuid();
  src text := p_data->>'source';
  kind text := p_data->>'media_type';
  cat text := p_data->>'category';
  media_purpose text := coalesce(p_data->>'purpose', 'portfolio');
  free_limits boolean;
begin
  perform public.initialize_my_profile_media();
  free_limits := private.profile_media_free_limits_apply();

  if src not in ('mux', 'storage')
    or (src = 'mux' and kind <> 'video')
    or (src = 'storage' and kind <> 'image')
    or cat not in ('work', 'reel', 'book')
    or (cat = 'reel' and kind <> 'video')
    or (cat = 'book' and kind <> 'image')
  then raise exception 'Invalid upload';
  end if;

  if p_size is null or p_size <= 0 then
    raise exception 'File too large or invalid';
  end if;
  if src = 'mux' and p_size > (case when free_limits then 2000000000 else 5000000000 end) then
    raise exception 'FREE_VIDEO_FILE_LIMIT';
  end if;
  if src = 'storage' and p_size > 20000000 then
    raise exception 'File too large or invalid';
  end if;

  if p_mime is null or p_extension is null or not (
    (src = 'mux' and (
      (p_mime = 'video/mp4' and p_extension = 'mp4')
      or (p_mime = 'video/quicktime' and p_extension = 'mov')
    ))
    or (src = 'storage' and (
      (p_mime = 'image/jpeg' and p_extension in ('jpg', 'jpeg'))
      or (p_mime = 'image/png' and p_extension = 'png')
      or (p_mime = 'image/webp' and p_extension = 'webp')
    ))
  ) then raise exception 'Invalid file type';
  end if;

  if free_limits and media_purpose = 'portfolio' then
    if kind = 'image' and private.profile_media_quota_reached(auth.uid(), 'book') then
      raise exception 'FREE_BOOK_LIMIT';
    elsif kind = 'video' and cat = 'reel'
      and private.profile_media_quota_reached(auth.uid(), 'reel') then
      raise exception 'FREE_REEL_LIMIT';
    elsif kind = 'video' and cat = 'work'
      and private.profile_media_quota_reached(auth.uid(), 'video') then
      raise exception 'FREE_VIDEO_LIMIT';
    end if;
  end if;

  if (select count(*) from public.profile_media
      where owner_id = auth.uid() and status in ('uploading', 'processing')) >= 2 then
    raise exception 'Pending upload limit';
  end if;
  if (select count(*) from public.profile_media
      where owner_id = auth.uid() and source = src
        and created_at > now() - interval '1 day') >=
      (case when src = 'mux' then 10 else 30 end) then
    raise exception 'Daily upload limit';
  end if;
  if (select count(*) from public.profile_media
      where owner_id = auth.uid() and source = src
        and created_at > now() - interval '30 days') >=
      (case when src = 'mux' then 30 else 100 end) then
    raise exception 'Monthly upload limit';
  end if;
  if (select count(*) from public.profile_media
      where owner_id = auth.uid() and visibility <> 'archived') >= 100 then
    raise exception 'Portfolio limit';
  end if;
  if cat = 'work' and coalesce(p_data->>'role', '') = '' then
    raise exception 'Role required';
  end if;

  insert into public.profile_media(
    id, owner_id, category, title, role, year, description, media_type,
    source, status, expected_size_bytes, mime_type, storage_path, expires_at,
    sort_order, purpose, image_crop, visibility, review_reason
  ) values (
    result, auth.uid(), cat, p_data->>'title', coalesce(p_data->>'role', ''),
    coalesce(p_data->>'year', ''), coalesce(p_data->>'description', ''), kind,
    src, 'uploading', p_size, p_mime,
    case when src = 'storage'
      then auth.uid()::text || '/' || result::text || '/original.' || p_extension
      else null end,
    now() + interval '2 hours',
    coalesce((select max(sort_order) + 1 from public.profile_media
      where owner_id = auth.uid() and category = cat), 0),
    media_purpose,
    coalesce(p_data->'image_crop', '{"x":50,"y":50,"zoom":1,"frame":"auto"}'::jsonb),
    case when media_purpose = 'portfolio' then 'visible' else 'hidden' end,
    case when free_limits and src = 'mux' then 'free-video-limits' else null end
  );
  return result;
end $$;

create or replace function public.save_my_profile_media(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.profile_media;
  result uuid;
  category_value text;
  video_id text;
  provider_value text;
  target_url text;
begin
  perform public.initialize_my_profile_media();
  if p_id is not null then
    select * into m from public.profile_media
      where id = p_id and owner_id = auth.uid() for update;
    if not found then raise exception 'Not allowed' using errcode = '42501'; end if;
  end if;

  category_value := p_data->>'category';
  target_url := coalesce(p_data->>'url', '');
  if category_value not in ('reel', 'work', 'book')
    or jsonb_typeof(p_data->'featured') is distinct from 'boolean' then
    raise exception 'Invalid metadata' using errcode = '22023';
  end if;

  if p_id is null then
    if p_data->>'source' <> 'external'
      or p_data->>'media_type' <> 'video'
      or category_value = 'book' then
      raise exception 'Reserve upload first' using errcode = '22023';
    end if;
    if private.profile_media_free_limits_apply() then
      if category_value = 'reel'
        and private.profile_media_quota_reached(auth.uid(), 'reel') then
        raise exception 'FREE_REEL_LIMIT';
      elsif category_value = 'work'
        and private.profile_media_quota_reached(auth.uid(), 'video') then
        raise exception 'FREE_VIDEO_LIMIT';
      end if;
    end if;
    if (select count(*) from public.profile_media
        where owner_id = auth.uid() and visibility <> 'archived') >= 100 then
      raise exception 'Portfolio limit reached';
    end if;
  elsif p_data->>'source' is distinct from m.source
    or p_data->>'media_type' is distinct from m.media_type
    or category_value is distinct from m.category then
    raise exception 'Media source is immutable' using errcode = '22023';
  end if;

  if p_id is null or (m.media_type = 'video' and m.source = 'external') then
    if target_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$' then
      provider_value := 'youtube';
      video_id := split_part(target_url, '=', 2);
    elsif target_url ~ '^https://vimeo\.com/[0-9]{1,15}(/[A-Za-z0-9]{1,64})?$' then
      provider_value := 'vimeo';
      video_id := split_part(target_url, '/', 4);
    else raise exception 'Invalid provider' using errcode = '22023';
    end if;
  elsif target_url is distinct from m.url then
    raise exception 'Media URL is immutable' using errcode = '22023';
  end if;

  if coalesce(p_data->>'role', '') = '' and category_value = 'work'
    and (p_id is null or m.source <> 'external') then
    raise exception 'Role required';
  end if;
  if (p_data->>'featured')::boolean then
    update public.profile_media set featured = false
      where owner_id = auth.uid() and category = category_value and featured;
  end if;

  if p_id is null then
    insert into public.profile_media(
      owner_id, category, title, role, year, description, media_type, source,
      url, provider, external_video_id, featured, sort_order
    ) values (
      auth.uid(), category_value, p_data->>'title', coalesce(p_data->>'role', ''),
      coalesce(p_data->>'year', ''), coalesce(p_data->>'description', ''),
      'video', 'external', target_url, provider_value, video_id,
      (p_data->>'featured')::boolean,
      coalesce((select max(sort_order) + 1 from public.profile_media
        where owner_id = auth.uid() and category = category_value), 0)
    ) returning id into result;
  else
    update public.profile_media set
      title = p_data->>'title',
      role = coalesce(p_data->>'role', ''),
      year = coalesce(p_data->>'year', ''),
      description = coalesce(p_data->>'description', ''),
      url = target_url,
      provider = coalesce(provider_value, provider),
      external_video_id = coalesce(video_id, external_video_id),
      featured = (p_data->>'featured')::boolean
    where id = p_id returning id into result;
  end if;
  if p_data ? 'image_crop' then
    update public.profile_media set image_crop = p_data->'image_crop' where id = result;
  end if;
  return result;
end $$;

create or replace function public.manage_my_profile_media(
  p_id uuid,
  p_action text,
  p_target uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.profile_media;
  neighbor public.profile_media;
begin
  perform public.initialize_my_profile_media();
  select * into m from public.profile_media
    where id = p_id and owner_id = auth.uid() for update;
  if not found or m.status = 'deleted' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if p_action = 'reel' then
    if m.media_type <> 'video' or m.status <> 'ready' or m.terminal_reason is not null
      or not (
        m.source = 'external'
        or (m.source = 'mux' and m.duration_seconds is not null
          and m.duration_seconds <= 300)
      ) then
      raise exception 'FREE_VIDEO_DURATION_LIMIT' using errcode = '22023';
    end if;
    update public.profile_media set category = 'work', featured = false
      where owner_id = auth.uid() and category = 'reel' and id <> p_id;
    update public.profile_media set category = 'reel', featured = true,
      visibility = 'visible' where id = p_id;
  elsif p_action = 'other-video' then
    if m.media_type = 'image' then raise exception 'Video required'; end if;
    if m.category = 'reel' and private.profile_media_free_limits_apply()
      and private.profile_media_quota_reached(auth.uid(), 'video', m.id) then
      raise exception 'FREE_VIDEO_LIMIT';
    end if;
    update public.profile_media set category = 'work', featured = false where id = p_id;
  elsif p_action in ('up', 'down') then
    with positions as (
      select id, row_number() over(order by sort_order, id) - 1 n
      from public.profile_media
      where owner_id = auth.uid() and category = m.category and visibility <> 'archived'
    )
    update public.profile_media t set sort_order = positions.n
      from positions where t.id = positions.id;
    select * into m from public.profile_media where id = p_id;
    select * into neighbor from public.profile_media
      where owner_id = auth.uid() and category = m.category
        and visibility <> 'archived'
        and sort_order = m.sort_order + case when p_action = 'up' then -1 else 1 end;
    if found then
      update public.profile_media
        set sort_order = case when id = m.id then neighbor.sort_order else m.sort_order end
        where id in (m.id, neighbor.id);
    end if;
  elsif p_action = 'feature' then
    update public.profile_media set featured = false
      where owner_id = auth.uid() and category = m.category and featured;
    update public.profile_media set featured = not m.featured, visibility = 'visible'
      where id = p_id;
  elsif p_action in ('hide', 'show', 'archive', 'restore') then
    if p_action = 'restore' and private.profile_media_free_limits_apply() then
      if m.media_type = 'image'
        and private.profile_media_quota_reached(auth.uid(), 'book', m.id) then
        raise exception 'FREE_BOOK_LIMIT';
      elsif m.category = 'reel' and m.media_type = 'video'
        and private.profile_media_quota_reached(auth.uid(), 'reel', m.id) then
        raise exception 'FREE_REEL_LIMIT';
      elsif m.category = 'work' and m.media_type = 'video'
        and private.profile_media_quota_reached(auth.uid(), 'video', m.id) then
        raise exception 'FREE_VIDEO_LIMIT';
      end if;
    end if;
    update public.profile_media set
      visibility = case p_action
        when 'show' then 'visible'
        when 'restore' then 'hidden'
        when 'hide' then 'hidden'
        else 'archived'
      end,
      featured = false,
      cleanup_after = null
    where id = p_id;
  elsif p_action = 'thumbnail' then
    if p_target is not null and not exists (
      select 1 from public.profile_media
      where id = p_target and owner_id = auth.uid() and media_type = 'image'
        and status = 'ready' and visibility <> 'archived'
    ) then raise exception 'Invalid thumbnail' using errcode = '42501';
    end if;
    update public.profile_media set thumbnail_id = p_target where id = p_id;
  else raise exception 'Invalid action' using errcode = '22023';
  end if;
end $$;

commit;
