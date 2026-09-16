begin;

alter table public.opportunities add column opportunity_type text not null default 'opportunity' check(opportunity_type in ('opportunity','job')), add column deliverables text check(char_length(deliverables)<=4000);
alter table public.opportunities add constraint job_publication_check check (opportunity_type<>'job' or (category='paid_work' and compensation_type='paid' and (status<>'published' or (compensation_min is not null and compensation_min>0 and compensation_currency is not null and coalesce(char_length(btrim(deliverables)),0)>=20 and coalesce(char_length(btrim(discipline)),0)>=2 and application_deadline is not null and coalesce(char_length(btrim(description)),0)>=40 and (work_mode='remote' or coalesce(char_length(btrim(city)),0)>=2)))));
create index opportunities_jobs_catalog_idx on public.opportunities(compensation_currency,compensation_min,published_at desc,id) where status='published' and opportunity_type='job';


-- Atomic creation of a minimal project and its opportunity; no new Jobs engine.
-- SECURITY INVOKER deliberately retains the existing table RLS checks.
create or replace function public.save_my_opportunity(p_id uuid, p_data jsonb, p_project_title text default null, p_status text default 'draft')
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
    compensation_type,compensation_min,compensation_max,compensation_currency,starts_on,ends_on,application_deadline,status,opportunity_type,deliverables
  ) values (
    target_id,project_id_value,actor,clean_title,
    trim(both '-' from left(coalesce(nullif(trim(both '-' from regexp_replace(lower(clean_title),'[^a-z0-9]+','-','g')),''),'oportunidad'),140))||'-'||left(suffix,12),
    nullif(btrim(p_data->>'summary'),''),nullif(btrim(p_data->>'description'),''),p_data->>'category',
    nullif(btrim(p_data->>'discipline'),''),nullif(btrim(p_data->>'city'),''),coalesce(p_data->>'work_mode','on_site'),
    coalesce(p_data->>'compensation_type','unspecified'),(p_data->>'compensation_min')::numeric,
    (p_data->>'compensation_max')::numeric,nullif(p_data->>'compensation_currency',''),
    (p_data->>'starts_on')::date,(p_data->>'ends_on')::date,(p_data->>'application_deadline')::timestamptz,p_status,coalesce(p_data->>'opportunity_type','opportunity'),nullif(btrim(p_data->>'deliverables'),'')
  ) on conflict(id) do update set
    title=excluded.title,summary=excluded.summary,description=excluded.description,category=excluded.category,
    discipline=excluded.discipline,city=excluded.city,work_mode=excluded.work_mode,
    compensation_type=excluded.compensation_type,compensation_min=excluded.compensation_min,
    compensation_max=excluded.compensation_max,compensation_currency=excluded.compensation_currency,
    starts_on=excluded.starts_on,ends_on=excluded.ends_on,application_deadline=excluded.application_deadline,status=excluded.status,opportunity_type=excluded.opportunity_type,deliverables=excluded.deliverables
    where public.opportunities.owner_id=actor;
  return target_id;
end;
$$;
revoke all on function public.save_my_opportunity(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.save_my_opportunity(uuid,jsonb,text,text) to authenticated;
-- Extend the same protected inbox with a constrained, exclusive opportunity target.
alter table public.opportunities add constraint opportunities_inquiry_target unique(id,owner_id);
alter table public.catalog_inquiries alter column service_id drop not null, add column opportunity_id uuid,
 add constraint inquiry_opportunity_owner foreign key(opportunity_id,recipient_id) references public.opportunities(id,owner_id) on delete cascade,
 add constraint inquiry_one_target check(num_nonnulls(service_id,opportunity_id)=1),
 add constraint inquiry_once_per_opportunity unique(opportunity_id,sender_id);
create function public.send_job_inquiry(p_slug text,p_message text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); listing public.opportunities; target uuid;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.professional_profiles where user_id=actor and is_public) then raise exception 'Public professional profile required' using errcode='42501'; end if;
 select o.* into listing from public.opportunities o join public.projects p on p.id=o.project_id
 where o.slug=p_slug and o.status='published' and o.opportunity_type='job' and p.status='published'
 and o.application_deadline>now() for share of o,p;
 if not found or listing.owner_id=actor then raise exception 'Job unavailable for inquiry' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if (select count(*) from public.catalog_inquiries where sender_id=actor and created_at>now()-interval '24 hours')>=10 then raise exception 'Daily inquiry limit reached' using errcode='22023'; end if;
 insert into public.catalog_inquiries(opportunity_id,sender_id,recipient_id,message) values(listing.id,actor,listing.owner_id,btrim(p_message)) returning id into target;
 return target;
end; $$;
revoke all on function public.send_job_inquiry(text,text) from public,anon,authenticated;
grant execute on function public.send_job_inquiry(text,text) to authenticated;
create or replace function public.list_my_catalog_inquiries(p_page integer default 1)
returns table(id uuid,message text,status text,created_at timestamptz,is_recipient boolean,target_title text,target_href text,profile_name text,profile_slug text)
language sql stable security definer set search_path='' as $$
 select i.id,i.message,i.status,i.created_at,i.recipient_id=auth.uid(),
 case when i.recipient_id=auth.uid() or s.status='published' or (o.status='published' and pr.status='published') then coalesce(s.title,o.title) else 'Publicación no disponible' end,
 case when s.status='published' then '/marketplace/'||s.slug when o.status='published' and pr.status='published' then '/oportunidades/'||o.slug else null end,
 p.display_name,p.slug
 from public.catalog_inquiries i
 left join public.service_listings s on s.id=i.service_id
 left join public.opportunities o on o.id=i.opportunity_id
 left join public.projects pr on pr.id=o.project_id
 left join public.professional_profiles p on p.user_id=case when i.sender_id=auth.uid() then i.recipient_id else i.sender_id end and p.is_public
 where auth.uid() in(i.sender_id,i.recipient_id)
 order by i.created_at desc,i.id limit 25 offset ((greatest(1,least(coalesce(p_page,1),1000))-1)*24);
$$;
commit;
