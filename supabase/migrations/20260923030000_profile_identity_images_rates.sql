-- Identity reuses profile_media. Public resources use sanitized derivatives.
begin;
alter table public.profile_media
 add column purpose text not null default 'portfolio' check(purpose in ('portfolio','portrait','cover')),
 add column derivative_path text unique,
 add column image_width integer check(image_width between 1 and 20000),
 add column image_height integer check(image_height between 1 and 20000),
 add column image_crop jsonb not null default '{"x":50,"y":50,"zoom":1,"frame":"auto"}',
 add constraint identity_image_source check(purpose='portfolio' or (source='storage' and media_type='image'));
create function private.profile_crop_valid(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p)<>'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(p) k where k not in ('x','y','zoom','frame')) then return false; end if;
 if jsonb_typeof(p->'x') is distinct from 'number' or jsonb_typeof(p->'y') is distinct from 'number' or jsonb_typeof(p->'zoom') is distinct from 'number' then return false; end if;
 return (p->>'x')::numeric between 0 and 100 and (p->>'y')::numeric between 0 and 100 and (p->>'zoom')::numeric between 1 and 3 and coalesce(p->>'frame','') in ('auto','portrait','square','landscape');
end $$;
revoke all on function private.profile_crop_valid(jsonb) from public,anon,authenticated;
alter table public.profile_media add constraint profile_media_crop_check check(private.profile_crop_valid(image_crop));
create or replace function private.profile_presentation_is_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; k text; r jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(p) key where key not in ('portrait_url','stage_name','work_area','rate_range','book','credits','portrait_media_id','cover_media_id','rate','portfolio_mode')) then return false; end if;
  foreach k in array array['portrait_url','stage_name','work_area','rate_range'] loop
    if jsonb_typeof(p->k) is distinct from 'string' then return false; end if;
  end loop;
  if length(p->>'portrait_url') > 500 or length(p->>'stage_name') > 80
     or length(p->>'work_area') > 80 or length(p->>'rate_range') > 100 then return false; end if;
  if p->>'portrait_url' <> '' and p->>'portrait_url' !~ '^https://[^/@[:space:]]+([/?#]|$)' then return false; end if;
  if jsonb_typeof(p->'book') is distinct from 'array' or jsonb_typeof(p->'credits') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p->'book') > 6 or jsonb_array_length(p->'credits') > 12 then return false; end if;
  for item in select value from jsonb_array_elements(p->'book') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(item) key where key not in ('url','caption')) then return false; end if;
    if jsonb_typeof(item->'url') is distinct from 'string' or jsonb_typeof(item->'caption') is distinct from 'string' then return false; end if;
    if length(item->>'url') > 500 or item->>'url' !~ '^https://[^/@[:space:]]+([/?#]|$)' or length(item->>'caption') > 120 then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(p->'credits') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(item) key where key not in ('title','role','year')) then return false; end if;
    if jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'role') is distinct from 'string' or jsonb_typeof(item->'year') is distinct from 'string' then return false; end if;
    if length(btrim(item->>'title')) not between 1 and 100 or length(btrim(item->>'role')) not between 1 and 80 or item->>'year' !~ '^(|19[0-9]{2}|20[0-9]{2})$' then return false; end if;
  end loop;
  foreach k in array array['portrait_media_id','cover_media_id'] loop
    if p ? k and p->k <> 'null'::jsonb and (jsonb_typeof(p->k)<>'string' or p->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return false; end if;
  end loop;
  if p ? 'portfolio_mode' and (jsonb_typeof(p->'portfolio_mode')<>'string' or p->>'portfolio_mode' not in ('unspecified','audiovisual','photographic')) then return false; end if;
  r:=p->'rate';
  if r is not null and r <> 'null'::jsonb then
    if jsonb_typeof(r)<>'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(r) rate_key where rate_key not in ('amount','currency','unit')) then return false; end if;
    if jsonb_typeof(r->'amount') is distinct from 'string' or coalesce(r->>'amount','') !~ '^(0|[1-9][0-9]{0,7})([.][0-9]{1,2})?$' then return false; end if;
    if (r->>'amount')::numeric<=0 or (r->>'amount')::numeric>10000000 or coalesce(r->>'currency','') not in ('MXN','USD','EUR','CAD','GBP','COP','ARS','CLP','PEN','BRL') or coalesce(r->>'unit','') not in ('hour','day') then return false; end if;
    if r->>'currency'='CLP' and (r->>'amount')::numeric<>trunc((r->>'amount')::numeric) then return false; end if;
  end if;
  return true;
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
 update public.profile_media set purpose=coalesce(p_data->>'purpose','portfolio'),
   image_crop=coalesce(p_data->'image_crop','{"x":50,"y":50,"zoom":1,"frame":"auto"}'::jsonb),
   visibility=case when coalesce(p_data->>'purpose','portfolio')='portfolio' then 'visible' else 'hidden' end where id=result;
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
  if p_data ? 'image_crop' then update public.profile_media set image_crop=p_data->'image_crop' where id=result; end if;
  return result;
end $$;
create or replace function public.get_profile_media(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when p.media_initialized then coalesce((select jsonb_agg(jsonb_build_object(
 'id',m.id,'category',m.category,'title',m.title,'role',m.role,'year',m.year,'description',m.description,
 'media_type',m.media_type,'source',m.source,'url',m.url,'provider',m.provider,'external_video_id',m.external_video_id,
 'thumbnail_id',m.thumbnail_id,'featured',m.featured,'sort_order',m.sort_order,'visibility',m.visibility,'status',m.status,
 'image_crop',m.image_crop,'image_width',m.image_width,'image_height',m.image_height,'duration_seconds',m.duration_seconds,'aspect_ratio',m.aspect_ratio,'terminal_reason',case when p.user_id=auth.uid() then m.terminal_reason else null end,'created_at',m.created_at,'updated_at',m.updated_at) order by m.sort_order,m.id)
 from public.profile_media m where m.owner_id=p.user_id and m.purpose='portfolio' and (p.user_id=auth.uid() or (m.visibility='visible' and m.status='ready'))),'[]'::jsonb) else null end
 from public.professional_profiles p where p.slug=p_slug and (p.is_public or p.user_id=auth.uid());
$$;
create or replace function public.get_profile_media_resource(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('storage_path',coalesce(m.derivative_path,m.storage_path),'source',m.source,'url',m.url,'mux_playback_id',m.mux_playback_id,'mux_environment_id',m.mux_environment_id,'mux_environment_type',m.mux_environment_type)
 from public.profile_media m join public.professional_profiles p on p.user_id=m.owner_id
 where m.id=p_id and m.status='ready' and m.visibility<>'archived' and (p.user_id=auth.uid() or (p.is_public and (
 (m.purpose='portfolio' and m.visibility='visible') or (m.purpose in ('portrait','cover') and p.presentation->>(m.purpose||'_media_id')=m.id::text))));
$$;
create or replace function public.can_read_profile_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profile_media m join public.professional_profiles p on p.user_id=m.owner_id
 where (m.storage_path=p_path or m.derivative_path=p_path) and (m.owner_id=auth.uid() or
 (coalesce(m.derivative_path,m.storage_path)=p_path and p.is_public and m.status='ready' and m.visibility<>'archived' and
 ((m.purpose='portfolio' and m.visibility='visible') or (m.purpose in ('portrait','cover') and p.presentation->>(m.purpose||'_media_id')=m.id::text)))));
$$;

create function private.check_profile_identity_reference() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; id_text text;
begin
 foreach kind in array array['portrait','cover'] loop
  id_text:=new.presentation->>(kind||'_media_id');
  if id_text is not null and (tg_op='INSERT' or id_text is distinct from old.presentation->>(kind||'_media_id')) then
   if not exists(select 1 from public.profile_media m where m.id::text=id_text and m.owner_id=new.user_id and m.purpose=kind and m.status='ready' and m.visibility<>'archived' and m.derivative_path is not null) then raise exception 'Invalid identity image' using errcode='42501'; end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.check_profile_identity_reference() from public,anon,authenticated;
create trigger profile_identity_reference before insert or update of presentation on public.professional_profiles for each row execute function private.check_profile_identity_reference();
create function public.set_my_profile_identity_image(p_kind text,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_kind not in ('portrait','cover') then raise exception 'Not allowed' using errcode='42501'; end if;
 perform 1 from public.professional_profiles where user_id=auth.uid() for update;
 if not found then raise exception 'Save profile first'; end if;
 update public.professional_profiles set presentation=jsonb_set(presentation,array[p_kind||'_media_id'],coalesce(to_jsonb(p_id::text),'null'::jsonb)) where user_id=auth.uid();
 if p_kind='portrait' and p_id is null then update public.professional_profiles set presentation=jsonb_set(presentation,'{portrait_url}','""'::jsonb) where user_id=auth.uid(); end if;
end $$;
revoke all on function public.set_my_profile_identity_image(text,uuid) from public,anon;
grant execute on function public.set_my_profile_identity_image(text,uuid) to authenticated;
commit;
