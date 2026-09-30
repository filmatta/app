begin;

-- Keep the public table boundary aligned with the catalog predicate. Owners
-- retain access through opportunities_owner_read; this policy is only the
-- anonymous/authenticated public path.
drop policy opportunities_public_read on public.opportunities;
create policy opportunities_public_read on public.opportunities
for select to anon, authenticated
using (
  status = 'published'
  and (application_deadline is null or application_deadline > now())
  and (
    project_id is null
    or exists (
      select 1
      from public.projects as project
      where project.id = opportunities.project_id
        and project.lifecycle_status = 'active'
        and project.visibility = 'public'
    )
  )
);

alter table public.opportunities
  add column search_document tsvector
  generated always as (
    setweight(to_tsvector('spanish'::regconfig, translate(lower(coalesce(title, '')), 'áéíóúüñ', 'aeiouun')), 'A')
    || setweight(to_tsvector('spanish'::regconfig, translate(lower(coalesce(discipline, '')), 'áéíóúüñ', 'aeiouun')), 'B')
    || setweight(to_tsvector('spanish'::regconfig, translate(lower(
      coalesce(category, '') || ' ' || case category
        when 'casting' then 'casting talento actor actriz'
        when 'crew' then 'crew equipo técnico'
        when 'paid_work' then 'trabajo pagado freelance'
        when 'collaboration' then 'colaboración proyecto estudiantil'
        when 'internship' then 'prácticas asistencia'
        else ''
      end
    ), 'áéíóúüñ', 'aeiouun')), 'B')
    || setweight(to_tsvector('spanish'::regconfig, translate(lower(coalesce(city, '')), 'áéíóúüñ', 'aeiouun')), 'B')
    || setweight(to_tsvector('spanish'::regconfig, translate(lower(coalesce(summary, '')), 'áéíóúüñ', 'aeiouun')), 'C')
    || setweight(to_tsvector('spanish'::regconfig, translate(lower(coalesce(description, '')), 'áéíóúüñ', 'aeiouun')), 'D')
  ) stored;

create index opportunities_public_search_document_idx
  on public.opportunities using gin (search_document)
  where status = 'published';

create index opportunities_public_search_facets_idx
  on public.opportunities (
    category,
    work_mode,
    compensation_type,
    published_at desc,
    id
  )
  where status = 'published';

create index opportunities_public_city_idx
  on public.opportunities (
    translate(lower(city), 'áéíóúüñ', 'aeiouun'),
    published_at desc,
    id
  )
  where status = 'published' and city is not null;

-- Public search uses a closed projection: ownership and contact data never
-- leave this function. SECURITY INVOKER preserves the existing table RLS.
create function public.list_public_opportunities(
  p_q text default null,
  p_category text default null,
  p_city text default null,
  p_compensation text default null,
  p_work_mode text default null,
  p_offset integer default 0,
  p_limit integer default 25,
  p_jobs_only boolean default false,
  p_currency text default null,
  p_budget_min numeric default null,
  p_deadline_from date default null
)
returns table (
  id uuid,
  opportunity_type text,
  project_title text,
  project_slug text,
  title text,
  slug text,
  summary text,
  description_excerpt text,
  category text,
  discipline text,
  city text,
  work_mode text,
  compensation_type text,
  compensation_min numeric,
  compensation_max numeric,
  compensation_currency text,
  application_deadline timestamptz,
  published_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with search_input as (
    select
      to_tsquery(
        'spanish'::regconfig,
        regexp_replace(
          plainto_tsquery(
            'spanish'::regconfig,
            translate(
              lower(left(coalesce(nullif(btrim(p_q), ''), ''), 80)),
              'áéíóúüñ',
              'aeiouun'
            )
          )::text,
          '''([^'']+)''',
          '''\1'':*',
          'g'
        )
      ) as query,
      nullif(btrim(p_category), '') as category,
      nullif(btrim(p_city), '') as city,
      nullif(btrim(p_compensation), '') as compensation,
      nullif(btrim(p_work_mode), '') as work_mode
  ), matches as (
    select
      opportunity.id,
      opportunity.opportunity_type,
      project.title as project_title,
      project.slug as project_slug,
      opportunity.title,
      opportunity.slug,
      opportunity.summary,
      left(opportunity.description, 420) as description_excerpt,
      opportunity.category,
      opportunity.discipline,
      opportunity.city,
      opportunity.work_mode,
      opportunity.compensation_type,
      opportunity.compensation_min,
      opportunity.compensation_max,
      opportunity.compensation_currency,
      opportunity.application_deadline,
      opportunity.published_at,
      case
        when numnode(search_input.query) = 0 then 0::real
        else ts_rank_cd(opportunity.search_document, search_input.query)
      end as relevance
    from public.opportunities as opportunity
    left join public.projects as project
      on project.id = opportunity.project_id
      and project.lifecycle_status = 'active'
      and project.visibility = 'public'
    cross join search_input
    where opportunity.status = 'published'
      and (opportunity.project_id is null or project.id is not null)
      and (
        opportunity.application_deadline is null
        or opportunity.application_deadline > now()
      )
      and (
        numnode(search_input.query) = 0
        or opportunity.search_document @@ search_input.query
      )
      and (
        search_input.category is null
        or opportunity.category = search_input.category
      )
      and (
        search_input.city is null
        or translate(lower(opportunity.city), 'áéíóúüñ', 'aeiouun')
          = translate(lower(search_input.city), 'áéíóúüñ', 'aeiouun')
      )
      and (
        search_input.work_mode is null
        or opportunity.work_mode = search_input.work_mode
      )
      and (
        search_input.compensation is null
        or (
          search_input.compensation = 'paid'
          and opportunity.compensation_type = 'paid'
        )
        or (
          search_input.compensation = 'collaboration'
          and opportunity.compensation_type in ('expenses', 'unpaid')
        )
        or (
          search_input.compensation = 'unspecified'
          and opportunity.compensation_type = 'unspecified'
        )
      )
      and (not p_jobs_only or opportunity.opportunity_type = 'job')
      and (not p_jobs_only or opportunity.compensation_type = 'paid')
      and (
        p_currency is null
        or opportunity.compensation_currency = p_currency
      )
      and (
        p_budget_min is null
        or opportunity.compensation_min >= p_budget_min
      )
      and (
        p_deadline_from is null
        or opportunity.application_deadline >= p_deadline_from::timestamptz
      )
  )
  select
    matches.id,
    matches.opportunity_type,
    matches.project_title,
    matches.project_slug,
    matches.title,
    matches.slug,
    matches.summary,
    matches.description_excerpt,
    matches.category,
    matches.discipline,
    matches.city,
    matches.work_mode,
    matches.compensation_type,
    matches.compensation_min,
    matches.compensation_max,
    matches.compensation_currency,
    matches.application_deadline,
    matches.published_at
  from matches
  order by matches.relevance desc, matches.published_at desc, matches.id
  offset least(greatest(coalesce(p_offset, 0), 0), 24000)
  limit least(greatest(coalesce(p_limit, 25), 1), 25);
$$;

revoke all
  on function public.list_public_opportunities(
    text, text, text, text, text, integer, integer, boolean, text, numeric, date
  )
  from public, anon, authenticated;

grant execute
  on function public.list_public_opportunities(
    text, text, text, text, text, integer, integer, boolean, text, numeric, date
  )
  to anon, authenticated;

comment on function public.list_public_opportunities(
  text, text, text, text, text, integer, integer, boolean, text, numeric, date
) is 'RLS-preserving public Opportunities Search V1 projection and ranking.';

-- Historical Job inbox entries must not require a Project for their public
-- target. Linked Opportunities still inherit the Project public boundary.
create or replace function public.list_my_catalog_inquiries(p_page integer default 1)
returns table(
  id uuid,
  message text,
  status text,
  created_at timestamptz,
  is_recipient boolean,
  target_title text,
  target_href text,
  profile_name text,
  profile_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    inquiry.id,
    inquiry.message,
    inquiry.status,
    inquiry.created_at,
    inquiry.recipient_id = auth.uid(),
    case
      when inquiry.recipient_id = auth.uid()
        or service.status = 'published'
        or (
          opportunity.status = 'published'
          and (
            opportunity.project_id is null
            or (
              project.lifecycle_status = 'active'
              and project.visibility = 'public'
            )
          )
        )
      then coalesce(service.title, opportunity.title)
      else 'Publicación no disponible'
    end,
    case
      when service.status = 'published' then '/marketplace/' || service.slug
      when opportunity.status = 'published'
        and (
          opportunity.project_id is null
          or (
            project.lifecycle_status = 'active'
            and project.visibility = 'public'
          )
        )
      then '/oportunidades/' || opportunity.slug
      else null
    end,
    profile.display_name,
    profile.slug
  from public.catalog_inquiries as inquiry
  left join public.service_listings as service on service.id = inquiry.service_id
  left join public.opportunities as opportunity on opportunity.id = inquiry.opportunity_id
  left join public.projects as project on project.id = opportunity.project_id
  left join public.professional_profiles as profile
    on profile.user_id = case
      when inquiry.sender_id = auth.uid() then inquiry.recipient_id
      else inquiry.sender_id
    end
    and profile.is_public
  where auth.uid() in (inquiry.sender_id, inquiry.recipient_id)
  order by inquiry.created_at desc, inquiry.id
  limit 25
  offset ((greatest(1, least(coalesce(p_page, 1), 1000)) - 1) * 24);
$$;

revoke all on function public.list_my_catalog_inquiries(integer)
  from public, anon, authenticated;
grant execute on function public.list_my_catalog_inquiries(integer)
  to authenticated;

-- Keep direct inquiry creation consistent with the same public predicate.
create or replace function public.send_job_inquiry(p_slug text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  listing public.opportunities;
  target uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.professional_profiles
    where user_id = actor and is_public
  ) then raise exception 'Public professional profile required' using errcode = '42501'; end if;

  select opportunity.* into listing
  from public.opportunities as opportunity
  left join public.projects as project on project.id = opportunity.project_id
  where opportunity.slug = p_slug
    and opportunity.status = 'published'
    and opportunity.opportunity_type = 'job'
    and opportunity.application_deadline > now()
    and (
      opportunity.project_id is null
      or (
        project.lifecycle_status = 'active'
        and project.visibility = 'public'
      )
    )
  for share of opportunity;

  if not found or listing.owner_id = actor then
    raise exception 'Job unavailable for inquiry' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  if (
    select count(*) from public.catalog_inquiries
    where sender_id = actor and created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'Daily inquiry limit reached' using errcode = '22023';
  end if;
  insert into public.catalog_inquiries(opportunity_id, sender_id, recipient_id, message)
  values (listing.id, actor, listing.owner_id, btrim(p_message))
  returning id into target;
  return target;
end;
$$;

revoke all on function public.send_job_inquiry(text, text)
  from public, anon, authenticated;
grant execute on function public.send_job_inquiry(text, text)
  to authenticated;

commit;
