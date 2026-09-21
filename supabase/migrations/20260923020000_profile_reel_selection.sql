-- New selections require attested metadata; historical selections remain untouched.
begin;
create or replace function public.manage_my_profile_media(p_id uuid,p_action text,p_target uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare m public.profile_media; neighbor public.profile_media;
begin
  perform public.initialize_my_profile_media();
  select * into m from public.profile_media where id=p_id and owner_id=auth.uid() for update;
  if not found or m.status='deleted' then raise exception 'Not allowed' using errcode='42501'; end if;
  if p_action='reel' then
    if m.media_type<>'video' or m.source<>'mux' or m.status<>'ready' or m.duration_seconds is null or m.duration_seconds>180 or m.terminal_reason is not null then
      raise exception 'Reel requires verified video duration up to 180 seconds' using errcode='22023';
    end if;
    -- Parent lock from initialize serializes two tabs and preserves the old reel until selection.
    update public.profile_media set category='work',featured=false where owner_id=auth.uid() and category='reel';
    update public.profile_media set category='reel',featured=true,visibility='visible' where id=p_id;
  elsif p_action='other-video' then
    if m.media_type='image' then raise exception 'Video required'; end if;
    update public.profile_media set category='work',featured=false where id=p_id;
  elsif p_action in ('up','down') then
    -- Normalize under the parent lock so legacy/import ties cannot lose order.
    with positions as(select id,row_number() over(order by sort_order,id)-1 n from public.profile_media where owner_id=auth.uid() and category=m.category and visibility<>'archived')
    update public.profile_media t set sort_order=positions.n from positions where t.id=positions.id;
    select * into m from public.profile_media where id=p_id;
    select * into neighbor from public.profile_media where owner_id=auth.uid() and category=m.category and visibility<>'archived' and sort_order=m.sort_order+case when p_action='up' then -1 else 1 end;
    if found then update public.profile_media set sort_order=case when id=m.id then neighbor.sort_order else m.sort_order end where id in(m.id,neighbor.id); end if;
  elsif p_action='feature' then
    if m.category='reel' and not m.featured and (m.source<>'mux' or m.media_type<>'video' or m.status<>'ready' or m.duration_seconds is null or m.duration_seconds>180) then raise exception 'Reel duration not verified'; end if;
    update public.profile_media set featured=false where owner_id=auth.uid() and category=m.category and featured;
    update public.profile_media set featured=not m.featured,visibility='visible' where id=p_id;
  elsif p_action in ('hide','show','archive','restore') then
    update public.profile_media set visibility=case p_action when 'show' then 'visible' when 'restore' then 'hidden' when 'hide' then 'hidden' else 'archived' end,
      featured=false,cleanup_after=null where id=p_id;
  elsif p_action='thumbnail' then
    if p_target is not null and not exists(select 1 from public.profile_media where id=p_target and owner_id=auth.uid() and media_type='image' and status='ready' and visibility<>'archived') then raise exception 'Invalid thumbnail' using errcode='42501'; end if;
    update public.profile_media set thumbnail_id=p_target where id=p_id;
  else raise exception 'Invalid action' using errcode='22023'; end if;
end $$;
create or replace function public.reserve_my_profile_upload(p_data jsonb,p_size bigint,p_mime text,p_extension text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid:=gen_random_uuid(); src text:=p_data->>'source'; kind text:=p_data->>'media_type'; cat text:=p_data->>'category';
begin
 perform public.initialize_my_profile_media();
 if cat='reel' then raise exception 'Upload as work before selecting verified reel'; end if;
 if src not in ('mux','storage') or (src='mux' and kind<>'video') or (src='storage' and kind<>'image') or cat not in ('work','reel','book') or (cat='reel' and kind<>'video') or (cat='book' and kind<>'image') then raise exception 'Invalid upload'; end if;
 if p_size is null or p_size<=0 or p_size>(case when src='mux' then 5000000000 else 20000000 end) then raise exception 'File too large or invalid'; end if;
 if p_mime is null or p_extension is null or not ((src='mux' and ((p_mime='video/mp4' and p_extension='mp4') or (p_mime='video/quicktime' and p_extension='mov'))) or
 (src='storage' and ((p_mime='image/jpeg' and p_extension in('jpg','jpeg')) or (p_mime='image/png' and p_extension='png') or (p_mime='image/webp' and p_extension='webp')))) then raise exception 'Invalid file type'; end if;
 -- Expiration requires provider reconciliation; never expire processing by wall-clock alone.
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
create or replace function public.save_my_profile_media(p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
    if category_value='reel' then raise exception 'External duration not verified; save as other video'; end if;
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
  if category_value='reel' and (p_data->>'featured')::boolean and not coalesce(m.featured,false) and (m.source<>'mux' or m.media_type<>'video' or m.status<>'ready' or m.duration_seconds is null or m.duration_seconds>180) then raise exception 'Reel duration not verified'; end if;
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
commit;
