-- Projects V1.5 owner-scoped mutations. SECURITY INVOKER keeps RLS active.
begin;

-- p_project_title remains only for deployed-client signature compatibility.
create or replace function public.save_my_opportunity(
  p_id uuid,
  p_data jsonb,
  p_project_title text default null,
  p_status text default 'draft'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_id uuid := coalesce(p_id, gen_random_uuid());
  existing_project_id uuid;
  project_id_value uuid;
  project_id_text text;
  suffix text := replace(target_id::text, '-', '');
  clean_title text := btrim(p_data->>'title');
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('draft','published','closed','archived') then raise exception 'Invalid status' using errcode = '22023'; end if;
  if clean_title is null or char_length(clean_title) not between 3 and 160 then raise exception 'Invalid title' using errcode = '22023'; end if;
  if p_status = 'published' and (
    coalesce(char_length(btrim(p_data->>'description')), 0) < 20
    or (coalesce(p_data->>'work_mode','on_site') <> 'remote' and coalesce(char_length(btrim(p_data->>'city')), 0) < 2)
  ) then raise exception 'Complete brief and location before publishing' using errcode = '22023'; end if;

  if p_id is not null then
    select opportunity.project_id into existing_project_id
    from public.opportunities as opportunity
    where opportunity.id = p_id and opportunity.owner_id = actor for update;
    if not found then raise exception 'Not authorized' using errcode = '42501'; end if;
  end if;

  if p_data ? 'project_id' then
    project_id_text := nullif(btrim(p_data->>'project_id'), '');
    if project_id_text is not null and project_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Invalid project' using errcode = '22023';
    end if;
    project_id_value := project_id_text::uuid;
  else
    project_id_value := existing_project_id;
  end if;

  if project_id_value is not null and project_id_value is distinct from existing_project_id and not exists (
    select 1 from public.projects as project
    where project.id = project_id_value and project.owner_id = actor and project.lifecycle_status <> 'archived'
  ) then raise exception 'Project unavailable' using errcode = '42501'; end if;

  insert into public.opportunities (
    id,project_id,owner_id,title,slug,summary,description,category,discipline,city,work_mode,
    compensation_type,compensation_min,compensation_max,compensation_currency,starts_on,ends_on,
    application_deadline,status,opportunity_type,deliverables
  ) values (
    target_id,project_id_value,actor,clean_title,
    trim(both '-' from left(coalesce(nullif(trim(both '-' from regexp_replace(lower(clean_title),'[^a-z0-9]+','-','g')),''),'oportunidad'),140))||'-'||left(suffix,12),
    nullif(btrim(p_data->>'summary'),''),nullif(btrim(p_data->>'description'),''),p_data->>'category',
    nullif(btrim(p_data->>'discipline'),''),nullif(btrim(p_data->>'city'),''),coalesce(p_data->>'work_mode','on_site'),
    coalesce(p_data->>'compensation_type','unspecified'),(p_data->>'compensation_min')::numeric,
    (p_data->>'compensation_max')::numeric,nullif(p_data->>'compensation_currency',''),
    (p_data->>'starts_on')::date,(p_data->>'ends_on')::date,(p_data->>'application_deadline')::timestamptz,
    p_status,coalesce(p_data->>'opportunity_type','opportunity'),nullif(btrim(p_data->>'deliverables'),'')
  ) on conflict (id) do update set
    project_id=excluded.project_id,title=excluded.title,summary=excluded.summary,description=excluded.description,
    category=excluded.category,discipline=excluded.discipline,city=excluded.city,work_mode=excluded.work_mode,
    compensation_type=excluded.compensation_type,compensation_min=excluded.compensation_min,
    compensation_max=excluded.compensation_max,compensation_currency=excluded.compensation_currency,
    starts_on=excluded.starts_on,ends_on=excluded.ends_on,application_deadline=excluded.application_deadline,
    status=excluded.status,opportunity_type=excluded.opportunity_type,deliverables=excluded.deliverables
  where public.opportunities.owner_id=actor;
  return target_id;
end;
$$;

revoke all on function public.save_my_opportunity(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.save_my_opportunity(uuid,jsonb,text,text) to authenticated;

create function public.save_my_project_v15(p_id uuid,p_data jsonb)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor uuid:=auth.uid(); result uuid; current_slug text; slug_base text;
  title_value text:=btrim(p_data->>'title');
  requirements_value jsonb:=coalesce(p_data->'requirements','{"themes":[],"participation":[],"conditions":[]}'::jsonb);
  roles_value text[];
  lifecycle_value text:=coalesce(p_data->>'lifecycle_status','draft');
  visibility_value text:=coalesce(p_data->>'visibility','private');
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or exists(
    select 1 from jsonb_object_keys(p_data) as key where key not in (
      'title','slug','summary','description','project_type','client_name','share_client_name','client_type',
      'city','work_area','shooting_schedule','economic_mode','date_window','starts_on','ends_on',
      'dates_confirmed','roles','requirements','operational_status','lifecycle_status','visibility'
    )
  ) then raise exception 'Invalid project' using errcode='22023'; end if;
  if title_value is null or char_length(title_value) not between 1 and 160 then raise exception 'Invalid project title' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_data->'roles','[]'::jsonb)) is distinct from 'array' or not private.project_requirements_valid(requirements_value) then
    raise exception 'Invalid project needs' using errcode='22023';
  end if;
  if lifecycle_value not in ('draft','active','archived') or visibility_value not in ('private','public')
    or (visibility_value='public' and lifecycle_value<>'active') then raise exception 'Invalid project state' using errcode='22023'; end if;
  if coalesce(p_data->>'operational_status','active') not in ('active','pending_confirmation','inactive') then
    raise exception 'Invalid production status' using errcode='22023';
  end if;

  roles_value:=array(select distinct jsonb_array_elements_text(coalesce(p_data->'roles','[]'::jsonb)));
  if p_data->>'shooting_schedule' in ('night','mixed') and not (requirements_value->'conditions' ? 'night') then
    requirements_value:=jsonb_set(requirements_value,'{conditions}',(requirements_value->'conditions')||'"night"'::jsonb);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));

  if p_id is null then
    if (select count(*) from public.projects where owner_id=actor and lifecycle_status<>'archived')>=50 then raise exception 'Project limit' using errcode='22023'; end if;
    result:=gen_random_uuid();
    slug_base:=left(trim(both '-' from regexp_replace(
      lower(translate(coalesce(nullif(btrim(p_data->>'slug'),''),title_value),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),
      '[^a-z0-9]+','-','g')),140);
    if slug_base='' then slug_base:='proyecto'; end if;
    current_slug:=slug_base||'-'||left(result::text,8);
    insert into public.projects(id,owner_id,title,slug,networking_private) values(result,actor,title_value,current_slug,false);
  else
    select project.id,project.slug into result,current_slug from public.projects as project
    where project.id=p_id and project.owner_id=actor for update;
    if result is null then raise exception 'Project unavailable' using errcode='42501'; end if;
  end if;

  update public.projects set
    title=title_value,summary=nullif(btrim(p_data->>'summary'),''),description=nullif(btrim(p_data->>'description'),''),
    project_type=p_data->>'project_type',client_name=btrim(coalesce(p_data->>'client_name','')),
    share_client_name=coalesce((p_data->>'share_client_name')::boolean,false),client_type=p_data->>'client_type',
    city=btrim(coalesce(p_data->>'city','')),work_area=btrim(coalesce(p_data->>'work_area','')),
    shooting_schedule=p_data->>'shooting_schedule',economic_mode=p_data->>'economic_mode',
    date_window=btrim(coalesce(p_data->>'date_window','')),starts_on=(p_data->>'starts_on')::date,
    ends_on=(p_data->>'ends_on')::date,dates_confirmed=coalesce((p_data->>'dates_confirmed')::boolean,false),
    roles=roles_value,requirements=requirements_value,operational_status=coalesce(p_data->>'operational_status','active'),
    lifecycle_status=lifecycle_value,visibility=visibility_value
  where id=result and owner_id=actor;
  return result;
end;
$$;

revoke all on function public.save_my_project_v15(uuid,jsonb) from public,anon;
grant execute on function public.save_my_project_v15(uuid,jsonb) to authenticated;

create function public.convert_my_opportunity_to_project(p_opportunity_id uuid)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor uuid:=auth.uid(); opportunity public.opportunities; result uuid; slug_base text;
  project_roles text[]:='{}'; date_label text:='';
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select item.* into opportunity from public.opportunities as item
  where item.id=p_opportunity_id and item.owner_id=actor for update;
  if not found then raise exception 'Opportunity unavailable' using errcode='42501'; end if;
  if opportunity.project_id is not null then return opportunity.project_id; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if (select count(*) from public.projects where owner_id=actor and lifecycle_status<>'archived')>=50 then
    raise exception 'Project limit' using errcode='22023';
  end if;

  result:=gen_random_uuid();
  slug_base:=left(trim(both '-' from regexp_replace(lower(translate(opportunity.title,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),'[^a-z0-9]+','-','g')),140);
  if slug_base='' then slug_base:='proyecto'; end if;
  if opportunity.discipline=any(array['Dirección','Producción','Dirección de fotografía','Cámara','Iluminación','Sonido','Dirección de arte','Edición','Color','VFX','Animación','Actuación','Modelaje','Guion','Música','Foto fija']::text[]) then
    project_roles:=array[opportunity.discipline];
  end if;
  if opportunity.starts_on is not null and opportunity.ends_on is not null then date_label:=to_char(opportunity.starts_on,'DD/MM/YYYY')||' – '||to_char(opportunity.ends_on,'DD/MM/YYYY');
  elsif opportunity.starts_on is not null then date_label:='Desde '||to_char(opportunity.starts_on,'DD/MM/YYYY');
  elsif opportunity.ends_on is not null then date_label:='Hasta '||to_char(opportunity.ends_on,'DD/MM/YYYY'); end if;

  insert into public.projects(
    id,owner_id,title,slug,summary,description,project_type,city,work_area,shooting_schedule,
    economic_mode,date_window,starts_on,ends_on,dates_confirmed,roles,requirements,networking_private,
    lifecycle_status,visibility
  ) values(
    result,actor,opportunity.title,slug_base||'-'||left(result::text,8),opportunity.summary,opportunity.description,
    'Otro',coalesce(opportunity.city,''),'','day',case when opportunity.compensation_type='paid' then 'paid'
      when opportunity.compensation_type in ('expenses','unpaid') then 'collaboration' else 'undecided' end,
    date_label,opportunity.starts_on,opportunity.ends_on,false,project_roles,
    '{"themes":[],"participation":[],"conditions":[]}'::jsonb,false,'draft','private'
  );
  update public.opportunities set project_id=result where id=opportunity.id and owner_id=actor;
  return result;
end;
$$;

revoke all on function public.convert_my_opportunity_to_project(uuid) from public,anon;
grant execute on function public.convert_my_opportunity_to_project(uuid) to authenticated;

commit;
