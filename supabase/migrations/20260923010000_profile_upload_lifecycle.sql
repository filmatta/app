-- Additive lifecycle attestation; no historical data cleanup or ledger changes.
begin;
alter table public.profile_media
 add column duration_seconds double precision check(duration_seconds>0 and duration_seconds<'Infinity'::double precision),
 add column aspect_ratio text check(length(aspect_ratio)<=32),
 add column terminal_reason text check(terminal_reason in ('cancelled','expired','provider-error')),
 add column review_reason text check(length(review_reason)<=100);
create index profile_media_pending_expiry on public.profile_media(expires_at) where status in ('uploading','processing');
create or replace function public.reserve_my_profile_upload(p_data jsonb,p_size bigint,p_mime text,p_extension text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid:=gen_random_uuid(); src text:=p_data->>'source'; kind text:=p_data->>'media_type'; cat text:=p_data->>'category';
begin
 perform public.initialize_my_profile_media();
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
create or replace function public.manage_my_profile_media(p_id uuid,p_action text,p_target uuid default null) returns void language plpgsql security definer set search_path='' as $$
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
      featured=false,cleanup_after=null where id=p_id;
  elsif p_action='thumbnail' then
    if p_target is not null and not exists(select 1 from public.profile_media where id=p_target and owner_id=auth.uid() and media_type='image' and status='ready' and visibility<>'archived') then raise exception 'Invalid thumbnail' using errcode='42501'; end if;
    update public.profile_media set thumbnail_id=p_target where id=p_id;
  else raise exception 'Invalid action' using errcode='22023'; end if;
end $$;
create or replace function public.get_profile_media(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when p.media_initialized then coalesce((select jsonb_agg(jsonb_build_object(
 'id',m.id,'category',m.category,'title',m.title,'role',m.role,'year',m.year,'description',m.description,
 'media_type',m.media_type,'source',m.source,'url',m.url,'provider',m.provider,'external_video_id',m.external_video_id,
 'thumbnail_id',m.thumbnail_id,'featured',m.featured,'sort_order',m.sort_order,'visibility',m.visibility,'status',m.status,
 'duration_seconds',m.duration_seconds,'aspect_ratio',m.aspect_ratio,'terminal_reason',case when p.user_id=auth.uid() then m.terminal_reason else null end,'created_at',m.created_at,'updated_at',m.updated_at) order by m.sort_order,m.id)
 from public.profile_media m where m.owner_id=p.user_id and (p.user_id=auth.uid() or (m.visibility='visible' and m.status='ready'))),'[]'::jsonb) else null end
 from public.professional_profiles p where p.slug=p_slug and (p.is_public or p.user_id=auth.uid());
$$;
commit;
