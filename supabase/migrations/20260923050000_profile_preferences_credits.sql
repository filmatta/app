-- Reuse existing credits and owner-only private settings. No public preferences projection.
begin;
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
  if jsonb_array_length(p->'book') > 6 or jsonb_array_length(p->'credits') > 30 then return false; end if;
  for item in select value from jsonb_array_elements(p->'book') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(item) key where key not in ('url','caption')) then return false; end if;
    if jsonb_typeof(item->'url') is distinct from 'string' or jsonb_typeof(item->'caption') is distinct from 'string' then return false; end if;
    if length(item->>'url') > 500 or item->>'url' !~ '^https://[^/@[:space:]]+([/?#]|$)' or length(item->>'caption') > 120 then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(p->'credits') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(item) key where key not in ('title','role','year','company','production_type','start','end','ongoing','description','url')) then return false; end if;
    if jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'role') is distinct from 'string' or jsonb_typeof(item->'year') is distinct from 'string' then return false; end if;
    if length(btrim(item->>'title')) not between 1 and 100 or length(btrim(item->>'role')) not between 1 and 80 or item->>'year' !~ '^(|19[0-9]{2}|20[0-9]{2})$' then return false; end if;
    foreach k in array array['company','production_type','start','end','description','url'] loop
      if item ? k and jsonb_typeof(item->k)<>'string' then return false; end if;
    end loop;
    if length(coalesce(item->>'company',''))>100 or length(coalesce(item->>'description',''))>400 or length(coalesce(item->>'url',''))>500 then return false; end if;
    if coalesce(item->>'production_type','') not in ('','Cortometraje','Largometraje','Serie','Documental','Publicidad','Videoclip','Fotografía','Digital','Otro') then return false; end if;
    if coalesce(item->>'start','') !~ '^(|(19|20)[0-9]{2}(-(0[1-9]|1[0-2]))?)$' or coalesce(item->>'end','') !~ '^(|(19|20)[0-9]{2}(-(0[1-9]|1[0-2]))?)$' then return false; end if;
    if item ? 'ongoing' and jsonb_typeof(item->'ongoing')<>'boolean' then return false; end if;
    if item->>'ongoing'='true' and coalesce(item->>'end','')<>'' then return false; end if;
    if coalesce(item->>'start','')<>'' and coalesce(item->>'end','')<>'' and item->>'end'<item->>'start' then return false; end if;
    if coalesce(item->>'url','')<>'' and item->>'url' !~ '^https://[^/@[:space:]]+([/?#]|$)' then return false; end if;
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
create function private.project_preferences_valid(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare group_key text; field_key text; choice text; allowed text[];
begin
 if jsonb_typeof(p) is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(p) k where k not in ('formats','open_formats','themes','participation','conditions')) then return false; end if;
 if jsonb_typeof(p->'formats') is distinct from 'array' or jsonb_typeof(p->'open_formats') is distinct from 'boolean' then return false; end if;
 if jsonb_array_length(p->'formats')>9 or exists(select 1 from jsonb_array_elements(p->'formats') f where jsonb_typeof(f)<>'string' or f#>>'{}' not in ('Cortometraje','Largometraje','Series','Documental','Publicidad','Videoclip','Contenido digital','Eventos','Fotografía')) then return false; end if;
 if (select count(distinct value) from jsonb_array_elements(p->'formats'))<>jsonb_array_length(p->'formats') then return false; end if;
 foreach group_key in array array['themes','participation','conditions'] loop
  if jsonb_typeof(p->group_key) is distinct from 'object' then return false; end if;
  allowed:=case group_key when 'themes' then array['romance','comedy','drama','horror','violence','gore'] when 'participation' then array['kissing','contact','intimacy_without_contact','intimacy_with_contact','partial_nudity','nudity'] else array['action','prop_weapons','water_heights','animals','night','travel'] end;
  for field_key,choice in select key,value from jsonb_each_text(p->group_key) loop
   if not field_key=any(allowed) or choice is null or choice not in ('unspecified','accept','consult','decline') then return false; end if;
  end loop;
 end loop;
 return true;
end $$;
revoke all on function private.project_preferences_valid(jsonb) from public,anon,authenticated;
alter table public.profile_private_settings add column project_preferences jsonb not null default '{"formats":[],"open_formats":false,"themes":{},"participation":{},"conditions":{}}' check(private.project_preferences_valid(project_preferences));
create function public.save_my_project_preferences(p_preferences jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not private.project_preferences_valid(p_preferences) then raise exception 'Invalid preferences' using errcode='22023'; end if;
 insert into public.profile_private_settings(owner_id,project_preferences) values(auth.uid(),p_preferences)
 on conflict(owner_id) do update set project_preferences=excluded.project_preferences,updated_at=now();
end $$;
revoke all on function public.save_my_project_preferences(jsonb) from public,anon;
grant execute on function public.save_my_project_preferences(jsonb) to authenticated;
commit;
