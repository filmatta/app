-- Profiles Search V1: indexed public search, server-side filters and public facets.
-- The owner table keeps its RLS posture; anonymous callers only receive this RPC projection.
begin;

create function private.professional_profile_search_document(
  p_display_name text,
  p_presentation jsonb,
  p_disciplines text[],
  p_city text,
  p_skills text[]
)
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.to_tsvector(
    'pg_catalog.spanish'::pg_catalog.regconfig,
    pg_catalog.concat_ws(
      ' ',
      coalesce(p_display_name, ''),
      coalesce(p_presentation->>'stage_name', ''),
      coalesce(pg_catalog.array_to_string(p_disciplines, ' '), ''),
      case
        when 'Dirección de fotografía' = any(coalesce(p_disciplines, '{}'::text[]))
          then 'director directora cinematografo cinematografa fotografia'
        else ''
      end,
      case
        when 'Foto fija' = any(coalesce(p_disciplines, '{}'::text[]))
          then 'fotografo fotografa fotografia'
        else ''
      end,
      case
        when 'Actuación' = any(coalesce(p_disciplines, '{}'::text[]))
          then 'actor actriz interprete'
        else ''
      end,
      case
        when 'Sonido' = any(coalesce(p_disciplines, '{}'::text[]))
          then 'sonidista audio'
        else ''
      end,
      coalesce(p_city, ''),
      coalesce(pg_catalog.array_to_string(p_skills, ' '), '')
    )
  );
$$;

revoke all on function private.professional_profile_search_document(text,jsonb,text[],text,text[])
  from public, anon, authenticated;

alter table public.professional_profiles
  add column search_document tsvector
  generated always as (
    private.professional_profile_search_document(
      display_name,
      presentation,
      disciplines,
      city,
      skills
    )
  ) stored;

create index professional_profiles_public_search_idx
  on public.professional_profiles using gin (search_document)
  where is_public;

create index professional_profiles_public_city_idx
  on public.professional_profiles (lower(city), updated_at desc, slug asc)
  where is_public and city is not null;

create index professional_profiles_public_availability_idx
  on public.professional_profiles (availability, updated_at desc, slug asc)
  where is_public;

create index professional_profiles_public_skills_idx
  on public.professional_profiles using gin (skills)
  where is_public;

create function private.public_profile_catalog_visual(
  p_user_id uuid,
  p_presentation jsonb,
  p_media_initialized boolean
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'media_id', candidate.media_id,
    'url', candidate.url
  )
  from (
    select
      1 as priority,
      true as featured,
      0 as sort_order,
      nullif(p_presentation->>'cover_media_id', '') as media_id,
      null::text as url
    where nullif(p_presentation->>'cover_media_id', '') is not null

    union all

    select
      2,
      media.featured,
      media.sort_order,
      case when media.source = 'storage' then media.id::text else null end,
      case when media.source = 'external' then media.url else null end
    from public.profile_media media
    where media.owner_id = p_user_id
      and media.purpose = 'portfolio'
      and media.category = 'book'
      and media.media_type = 'image'
      and media.visibility = 'visible'
      and media.status = 'ready'

    union all

    select
      3,
      false,
      (legacy.ordinality - 1)::integer,
      null::text,
      legacy.item->>'url'
    from pg_catalog.jsonb_array_elements(p_presentation->'book')
      with ordinality as legacy(item, ordinality)
    where not p_media_initialized
      and coalesce(legacy.item->>'url', '') ~ '^https://'

    union all

    select
      4,
      reel.featured,
      reel.sort_order,
      coalesce(
        reel.custom_reel_cover_id,
        reel.thumbnail_id,
        reel.id
      )::text,
      null::text
    from public.profile_media reel
    where reel.owner_id = p_user_id
      and reel.purpose = 'portfolio'
      and reel.category = 'reel'
      and reel.media_type = 'video'
      and reel.visibility = 'visible'
      and reel.status = 'ready'
  ) candidate
  where candidate.media_id is not null or candidate.url is not null
  order by
    candidate.priority,
    candidate.featured desc,
    candidate.sort_order,
    candidate.media_id,
    candidate.url
  limit 1;
$$;

revoke all on function private.public_profile_catalog_visual(uuid,jsonb,boolean)
  from public, anon, authenticated;

create function public.search_public_professional_profiles(
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
          input.query_text
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

create function public.get_public_profile_search_facets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with cities as (
    select distinct pg_catalog.btrim(profile.city) as value
    from public.professional_profiles profile
    where profile.is_public
      and nullif(pg_catalog.btrim(profile.city), '') is not null
    order by value
    limit 200
  ), skills as (
    select distinct pg_catalog.btrim(skill.value) as value
    from public.professional_profiles profile
    cross join lateral pg_catalog.unnest(profile.skills) as skill(value)
    where profile.is_public
      and nullif(pg_catalog.btrim(skill.value), '') is not null
    order by value
    limit 200
  )
  select pg_catalog.jsonb_build_object(
    'cities', coalesce(
      (select pg_catalog.jsonb_agg(cities.value order by cities.value) from cities),
      '[]'::jsonb
    ),
    'skills', coalesce(
      (select pg_catalog.jsonb_agg(skills.value order by skills.value) from skills),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_public_profile_search_facets()
  from public, anon, authenticated;
grant execute on function public.get_public_profile_search_facets()
  to anon, authenticated;

comment on function public.search_public_professional_profiles(text,integer,text,text,text,text) is
  'Public-only deterministic Profiles Search V1 projection. Never returns account or contact data.';

commit;
