begin;

-- Atomic creation of a minimal project and its opportunity; no new Jobs engine.
-- SECURITY INVOKER deliberately retains the existing table RLS checks.
create function public.save_my_opportunity(p_id uuid, p_data jsonb, p_project_title text default null, p_status text default 'draft')
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_id uuid := coalesce(p_id, gen_random_uuid());
  project_id_value uuid;
  suffix text := replace(target_id::text,'-','');
  clean_title text := btrim(p_data->>'title');
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_status is null or p_status not in ('draft','published','closed','archived') then
    raise exception 'Invalid status' using errcode='22023';
  end if;
  if clean_title is null or char_length(clean_title) not between 3 and 160 then
    raise exception 'Invalid title' using errcode='22023';
  end if;
  if p_status='published' and (
    coalesce(char_length(btrim(p_data->>'description')),0) < 20
    or (coalesce(p_data->>'work_mode','on_site') <> 'remote' and coalesce(char_length(btrim(p_data->>'city')),0) < 2)
  ) then raise exception 'Complete brief and location before publishing' using errcode='22023'; end if;

  if p_id is null then
    if p_status not in ('draft','published') or coalesce(char_length(btrim(p_project_title)),0) not between 3 and 160 then
      raise exception 'Invalid initial project' using errcode='22023';
    end if;
    insert into public.projects(owner_id,title,slug,status)
    values(actor,btrim(p_project_title),'proyecto-'||suffix,case when p_status='published' then 'published' else 'draft' end)
    returning id into project_id_value;
  else
    select o.project_id into project_id_value from public.opportunities o
    where o.id=p_id and o.owner_id=actor for update;
    if project_id_value is null then raise exception 'Not authorized' using errcode='42501'; end if;
  end if;

  -- Publishing explicitly makes the minimal project title public. Never hide
  -- a shared project automatically when one opportunity is closed/archived.
  if p_status='published' then
    update public.projects set status='published' where id=project_id_value and owner_id=actor;
    if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  end if;

  insert into public.opportunities(
    id,project_id,owner_id,title,slug,summary,description,category,discipline,city,work_mode,
    compensation_type,compensation_min,compensation_max,compensation_currency,starts_on,ends_on,application_deadline,status
  ) values (
    target_id,project_id_value,actor,clean_title,
    trim(both '-' from left(coalesce(nullif(trim(both '-' from regexp_replace(lower(clean_title),'[^a-z0-9]+','-','g')),''),'oportunidad'),140))||'-'||left(suffix,12),
    nullif(btrim(p_data->>'summary'),''),nullif(btrim(p_data->>'description'),''),p_data->>'category',
    nullif(btrim(p_data->>'discipline'),''),nullif(btrim(p_data->>'city'),''),coalesce(p_data->>'work_mode','on_site'),
    coalesce(p_data->>'compensation_type','unspecified'),(p_data->>'compensation_min')::numeric,
    (p_data->>'compensation_max')::numeric,nullif(p_data->>'compensation_currency',''),
    (p_data->>'starts_on')::date,(p_data->>'ends_on')::date,(p_data->>'application_deadline')::timestamptz,p_status
  ) on conflict(id) do update set
    title=excluded.title,summary=excluded.summary,description=excluded.description,category=excluded.category,
    discipline=excluded.discipline,city=excluded.city,work_mode=excluded.work_mode,
    compensation_type=excluded.compensation_type,compensation_min=excluded.compensation_min,
    compensation_max=excluded.compensation_max,compensation_currency=excluded.compensation_currency,
    starts_on=excluded.starts_on,ends_on=excluded.ends_on,application_deadline=excluded.application_deadline,status=excluded.status
    where public.opportunities.owner_id=actor;
  return target_id;
end;
$$;
revoke all on function public.save_my_opportunity(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.save_my_opportunity(uuid,jsonb,text,text) to authenticated;
commit;
