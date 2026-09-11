begin;

-- Generates a clean base slug from the public display name.
create or replace function private.professional_profile_slug_base(
  p_display_name text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(
        both '-'
        from regexp_replace(
          lower(btrim(p_display_name)),
          '[^a-z0-9]+',
          '-',
          'g'
        )
      ),
      ''
    ),
    'perfil'
  );
$$;


-- Update the save RPC so new profiles use a short, readable slug.
create or replace function public.save_my_professional_profile(
  p_disciplines text[],
  p_city text,
  p_bio text,
  p_availability text,
  p_skills text[],
  p_equipment text[],
  p_portfolio_items jsonb,
  p_is_public boolean,
  p_contact_policy text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  private_full_name text;
  public_display_name text;
  profile_slug text;
  slug_base text;
  slug_candidate text;
  slug_suffix integer := 1;

  clean_disciplines text[];
  clean_skills text[];
  clean_equipment text[];

  clean_city text := nullif(btrim(p_city), '');
  clean_bio text := nullif(btrim(p_bio), '');
  clean_portfolio_items jsonb :=
    coalesce(p_portfolio_items, '[]'::jsonb);

begin

  if current_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  select
    nullif(
      btrim(
        coalesce(
          app_user.raw_user_meta_data->>'full_name',
          app_user.raw_user_meta_data->>'name'
        )
      ),
      ''
    )
  into private_full_name
  from auth.users as app_user
  where app_user.id = current_user_id;


  if private_full_name is null
     or char_length(private_full_name) > 80
  then
    raise exception 'A valid private full name is required'
      using errcode = '22023';
  end if;


  public_display_name :=
    private.professional_profile_public_display_name(
      private_full_name
    );


  select coalesce(
    array_agg(clean_value order by item_order),
    '{}'::text[]
  )
  into clean_disciplines
  from (
    select
      btrim(value) as clean_value,
      item_order
    from unnest(
      coalesce(p_disciplines, '{}'::text[])
    )
    with ordinality as item(value, item_order)
    where btrim(value) <> ''
  ) as cleaned;


  select coalesce(
    array_agg(clean_value order by item_order),
    '{}'::text[]
  )
  into clean_skills
  from (
    select
      btrim(value) as clean_value,
      item_order
    from unnest(
      coalesce(p_skills, '{}'::text[])
    )
    with ordinality as item(value, item_order)
    where btrim(value) <> ''
  ) as cleaned;


  select coalesce(
    array_agg(clean_value order by item_order),
    '{}'::text[]
  )
  into clean_equipment
  from (
    select
      btrim(value) as clean_value,
      item_order
    from unnest(
      coalesce(p_equipment, '{}'::text[])
    )
    with ordinality as item(value, item_order)
    where btrim(value) <> ''
  ) as cleaned;


  if cardinality(clean_disciplines) not between 1 and 5
     or exists (
       select 1
       from unnest(clean_disciplines) as value
       where char_length(value) > 80
     )
  then
    raise exception 'Use between 1 and 5 valid disciplines'
      using errcode = '22023';
  end if;


  if clean_city is not null
     and char_length(clean_city) > 80
  then
    raise exception 'City is too long'
      using errcode = '22023';
  end if;


  if clean_bio is not null
     and char_length(clean_bio) > 1200
  then
    raise exception 'Bio is too long'
      using errcode = '22023';
  end if;


  if p_availability is null
     or p_availability not in (
       'available',
       'limited',
       'unavailable',
       'not_specified'
     )
  then
    raise exception 'Invalid availability'
      using errcode = '22023';
  end if;


  if cardinality(clean_skills) > 12
     or exists (
       select 1
       from unnest(clean_skills) as value
       where char_length(value) > 80
     )
  then
    raise exception 'Invalid skills'
      using errcode = '22023';
  end if;


  if cardinality(clean_equipment) > 10
     or exists (
       select 1
       from unnest(clean_equipment) as value
       where char_length(value) > 100
     )
  then
    raise exception 'Invalid equipment'
      using errcode = '22023';
  end if;


  if not private.professional_profile_items_are_valid(
    clean_portfolio_items
  )
  then
    raise exception 'Invalid portfolio items'
      using errcode = '22023';
  end if;


  if p_is_public is null then
    raise exception 'Profile visibility is required'
      using errcode = '22023';
  end if;


  if p_contact_policy is null
     or p_contact_policy not in (
       'members_only',
       'closed'
     )
  then
    raise exception 'Invalid contact policy'
      using errcode = '22023';
  end if;


  -- Keep an existing nice slug.
  select existing.slug
  into profile_slug
  from public.professional_profiles as existing
  where existing.user_id = current_user_id;


  -- Replace the old UUID-style slug or create a new one.
  if profile_slug is null
     or profile_slug ~ '-[0-9a-f]{32}$'
  then

    slug_base :=
      private.professional_profile_slug_base(
        public_display_name
      );

    slug_candidate := slug_base;
    slug_suffix := 1;

    while exists (
      select 1
      from public.professional_profiles as existing
      where existing.slug = slug_candidate
        and existing.user_id <> current_user_id
    )
    loop
      slug_suffix := slug_suffix + 1;
      slug_candidate :=
        slug_base || '-' || slug_suffix::text;
    end loop;

    profile_slug := slug_candidate;

  end if;


  insert into public.professional_profiles (
    user_id,
    slug,
    display_name,
    disciplines,
    city,
    bio,
    availability,
    skills,
    equipment,
    portfolio_items,
    is_public,
    contact_policy
  )
  values (
    current_user_id,
    profile_slug,
    public_display_name,
    clean_disciplines,
    clean_city,
    clean_bio,
    p_availability,
    clean_skills,
    clean_equipment,
    clean_portfolio_items,
    p_is_public,
    p_contact_policy
  )
  on conflict (user_id)
  do update set
    slug = excluded.slug,
    display_name = excluded.display_name,
    disciplines = excluded.disciplines,
    city = excluded.city,
    bio = excluded.bio,
    availability = excluded.availability,
    skills = excluded.skills,
    equipment = excluded.equipment,
    portfolio_items = excluded.portfolio_items,
    is_public = excluded.is_public,
    contact_policy = excluded.contact_policy;


  return profile_slug;

end;
$$;


revoke all privileges
  on function private.professional_profile_slug_base(text)
  from public, anon, authenticated;


revoke all privileges
  on function public.save_my_professional_profile(
    text[],
    text,
    text,
    text,
    text[],
    text[],
    jsonb,
    boolean,
    text
  )
  from public, anon, authenticated;


grant execute
  on function public.save_my_professional_profile(
    text[],
    text,
    text,
    text,
    text[],
    text[],
    jsonb,
    boolean,
    text
  )
  to authenticated;


commit;