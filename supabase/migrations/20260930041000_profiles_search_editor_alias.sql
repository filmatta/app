-- Staging QA follow-up: map the common profession terms editor/editora
-- to the existing canonical discipline Edición without changing stored data.
begin;

create or replace function public.search_public_professional_profiles(
  p_query text default '',
  p_page integer default 1,
  p_discipline text default '',
  p_city text default '',
  p_availability text default '',
  p_skill text default ''
)
returns table (
  slug text,
  display_name text,
  disciplines text[],
  city text,
  bio text,
  availability text,
  skills text[],
  updated_at timestamptz,
  portfolio_items jsonb,
  presentation jsonb,
  visual_media_id text,
  visual_url text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select
      nullif(pg_catalog.btrim(pg_catalog.left(coalesce(p_query, ''), 80)), '') as query_text,
      pg_catalog.btrim(pg_catalog.left(coalesce(p_discipline, ''), 80)) as discipline,
      pg_catalog.btrim(pg_catalog.left(coalesce(p_city, ''), 80)) as city,
      case
        when p_availability in ('available', 'limited', 'unavailable', 'not_specified')
          then p_availability
        else ''
      end as availability,
      pg_catalog.btrim(pg_catalog.left(coalesce(p_skill, ''), 80)) as skill,
      greatest(1, least(coalesce(p_page, 1), 1000)) as page
  ), prepared as (
    select
      input.*,
      case
        when input.query_text is null then null::tsquery
        else pg_catalog.websearch_to_tsquery(
          'pg_catalog.spanish'::pg_catalog.regconfig,
          pg_catalog.regexp_replace(
            input.query_text,
            '\m(editor|editora)\M',
            'edición',
            'gi'
          )
        )
      end as query
    from input
  ), matched as (
    select
      profile.*,
      case
        when prepared.query is null then 0::real
        else pg_catalog.ts_rank_cd(profile.search_document, prepared.query)
      end as match_rank
    from public.professional_profiles profile
    cross join prepared
    where profile.is_public
      and (prepared.query is null or profile.search_document @@ prepared.query)
      and (prepared.discipline = '' or prepared.discipline = any(profile.disciplines))
      and (prepared.city = '' or lower(profile.city) = lower(prepared.city))
      and (prepared.availability = '' or profile.availability = prepared.availability)
      and (prepared.skill = '' or prepared.skill = any(profile.skills))
  ), ranked as (
    select
      matched.*,
      pg_catalog.count(*) over () as matched_count,
      pg_catalog.row_number() over (
        order by matched.match_rank desc, matched.updated_at desc, matched.slug asc
      ) as result_position
    from matched
  ), paged as materialized (
    select ranked.*
    from ranked
    cross join input
    where ranked.result_position > ((input.page - 1) * 24)
      and ranked.result_position <= (((input.page - 1) * 24) + 25)
  )
  select
    paged.slug,
    paged.display_name,
    paged.disciplines,
    paged.city,
    paged.bio,
    paged.availability,
    paged.skills,
    paged.updated_at,
    '[]'::jsonb as portfolio_items,
    pg_catalog.jsonb_build_object(
      'portrait_url', coalesce(paged.presentation->>'portrait_url', ''),
      'stage_name', coalesce(paged.presentation->>'stage_name', ''),
      'work_area', coalesce(paged.presentation->>'work_area', ''),
      'rate_range', '',
      'book', '[]'::jsonb,
      'credits', '[]'::jsonb
    ) as presentation,
    visual.data->>'media_id' as visual_media_id,
    visual.data->>'url' as visual_url,
    paged.matched_count as total_count
  from paged
  left join lateral (
    select private.public_profile_catalog_visual(
      paged.user_id,
      paged.presentation,
      paged.media_initialized
    ) as data
  ) visual on true
  order by paged.match_rank desc, paged.updated_at desc, paged.slug asc;
$$;

revoke all on function public.search_public_professional_profiles(text,integer,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.search_public_professional_profiles(text,integer,text,text,text,text)
  to anon, authenticated;

commit;
