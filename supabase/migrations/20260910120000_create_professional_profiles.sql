-- FILMATTA Professional Profiles MVP
-- One professional profile per authenticated account.
-- Public profiles expose only explicitly public professional information.

create schema if not exists private;

begin;

create table public.professional_profiles (
  user_id uuid primary key,
  slug text not null unique,
  display_name text not null,
  disciplines text[] not null default '{}'::text[],
  city text,
  bio text,
  availability text not null default 'not_specified',
  skills text[] not null default '{}'::text[],
  equipment text[] not null default '{}'::text[],
  portfolio_items jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  contact_policy text not null default 'members_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint professional_profiles_user_fk
    foreign key (user_id)
    references auth.users (id)
    on update restrict
    on delete cascade,

  constraint professional_profiles_slug_check
    check (
      char_length(slug) between 3 and 120
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),

  constraint professional_profiles_display_name_check
    check (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 90
    ),

  constraint professional_profiles_disciplines_check
    check (cardinality(disciplines) between 1 and 5),

  constraint professional_profiles_city_check
    check (
      city is null
      or (
        city = btrim(city)
        and char_length(city) between 1 and 80
      )
    ),

  constraint professional_profiles_bio_check
    check (
      bio is null
      or char_length(bio) between 1 and 1200
    ),

  constraint professional_profiles_availability_check
    check (
      availability in (
        'available',
        'limited',
        'unavailable',
        'not_specified'
      )
    ),

  constraint professional_profiles_skills_check
    check (cardinality(skills) <= 12),

  constraint professional_profiles_equipment_check
    check (cardinality(equipment) <= 10),

  constraint professional_profiles_portfolio_array_check
    check (
      jsonb_typeof(portfolio_items) = 'array'
      and jsonb_array_length(portfolio_items) <= 6
    ),

  constraint professional_profiles_contact_policy_check
    check (
      contact_policy in (
        'members_only',
        'closed'
      )
    )
);

comment on table public.professional_profiles is
  'One optional professional identity per FILMATTA account. Private full names and contact details are never stored here.';


create index professional_profiles_public_updated_idx
  on public.professional_profiles (updated_at desc)
  where is_public;


create function private.professional_profile_public_display_name(
  p_full_name text
)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  clean_name text := regexp_replace(
    btrim(p_full_name),
    '\s+',
    ' ',
    'g'
  );
  name_parts text[];
begin
  name_parts := string_to_array(clean_name, ' ');

  if cardinality(name_parts) = 1 then
    return name_parts[1];
  end if;

  return
    name_parts[1]
    || ' '
    || upper(left(name_parts[2], 1))
    || '.';
end;
$$;


create function private.professional_profile_items_are_valid(
  p_items jsonb
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select
    jsonb_typeof(p_items) = 'array'
    and jsonb_array_length(p_items) <= 6
    and not exists (
      select 1
      from jsonb_array_elements(p_items) as item
      where jsonb_typeof(item) <> 'object'
        or item->>'kind' not in (
          'reel',
          'project',
          'link'
        )
        or coalesce(
          char_length(btrim(item->>'title')),
          0
        ) not between 1 and 80
        or coalesce(
          char_length(btrim(item->>'url')),
          0
        ) not between 1 and 500
        or coalesce(
          item->>'url',
          ''
        ) !~ '^https?://'
        or char_length(
          coalesce(item->>'summary', '')
        ) > 180
    );
$$;


alter table public.professional_profiles
  add constraint professional_profiles_portfolio_items_check
  check (
    private.professional_profile_items_are_valid(
      portfolio_items
    )
  );


create function private.set_professional_profiles_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


create trigger professional_profiles_set_updated_at
before update on public.professional_profiles
for each row
execute function private.set_professional_profiles_updated_at();


alter table public.professional_profiles
  enable row level security;


revoke all privileges
  on table public.professional_profiles
  from public, anon, authenticated;


grant select
  on table public.professional_profiles
  to authenticated;


create policy professional_profiles_owner_read
on public.professional_profiles
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


create function public.save_my_professional_profile(
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

  clean_disciplines text[];
  clean_skills text[];
  clean_equipment text[];

  clean_city text := nullif(
    btrim(p_city),
    ''
  );

  clean_bio text := nullif(
    btrim(p_bio),
    ''
  );

  clean_portfolio_items jsonb :=
    coalesce(
      p_portfolio_items,
      '[]'::jsonb
    );

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


  select
    coalesce(
      array_agg(
        clean_value
        order by item_order
      ),
      '{}'::text[]
    )
  into clean_disciplines
  from (
    select
      btrim(value) as clean_value,
      item_order
    from unnest(
      coalesce(
        p_disciplines,
        '{}'::text[]
      )
    )
    with ordinality as item(
      value,
      item_order
    )
    where btrim(value) <> ''
  ) as cleaned;


  select
    coalesce(
      array_agg(
        clean_value
        order by item_order
      ),
      '{}'::text[]
    )
  into clean_skills
  from (
    select
      btrim(value) as clean_value,
      item_order
    from unnest(
      coalesce(
        p_skills,
        '{}'::text[]
      )
    )
    with ordinality as item(
      value,
      item_order
    )
    where btrim(value) <> ''
  ) as cleaned;


  select
    coalesce(
      array_agg(
        clean_value
        order by item_order
      ),
      '{}'::text[]
    )
  into clean_equipment
  from (
    select
      btrim(value) as clean_value,
      item_order
    from unnest(
      coalesce(
        p_equipment,
        '{}'::text[]
      )
    )
    with ordinality as item(
      value,
      item_order
    )
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


  select existing.slug
  into profile_slug
  from public.professional_profiles as existing
  where existing.user_id = current_user_id;


  if profile_slug is null then

    slug_base := trim(
      both '-'
      from regexp_replace(
        lower(public_display_name),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    );

    slug_base := coalesce(
      nullif(
        left(slug_base, 70),
        ''
      ),
      'perfil'
    );

    profile_slug :=
      slug_base
      || '-'
      || replace(
        current_user_id::text,
        '-',
        ''
      );

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


create function public.get_public_professional_profile(
  p_slug text
)
returns table (
  slug text,
  display_name text,
  disciplines text[],
  city text,
  bio text,
  availability text,
  skills text[],
  equipment text[],
  portfolio_items jsonb,
  contact_policy text,
  is_public boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.slug,
    profile.display_name,
    profile.disciplines,
    profile.city,
    profile.bio,
    profile.availability,
    profile.skills,
    profile.equipment,
    profile.portfolio_items,
    profile.contact_policy,
    profile.is_public,
    profile.updated_at
  from public.professional_profiles as profile
  where profile.slug = p_slug
    and profile.is_public
  limit 1;
$$;


create function private.sync_professional_profile_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_full_name text :=
    nullif(
      btrim(
        coalesce(
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'name'
        )
      ),
      ''
    );
begin

  if new_full_name is not null
     and char_length(new_full_name) <= 80
  then
    update public.professional_profiles
    set display_name =
      private.professional_profile_public_display_name(
        new_full_name
      )
    where user_id = new.id;
  end if;

  return new;

end;
$$;


create trigger auth_users_sync_professional_profile_display_name
after update of raw_user_meta_data
on auth.users
for each row
when (
  old.raw_user_meta_data
  is distinct from
  new.raw_user_meta_data
)
execute function private.sync_professional_profile_display_name();


revoke all privileges
  on function
    private.professional_profile_public_display_name(text),
    private.professional_profile_items_are_valid(jsonb),
    private.set_professional_profiles_updated_at(),
    private.sync_professional_profile_display_name()
  from public, anon, authenticated;


revoke all privileges
  on function
    public.save_my_professional_profile(
      text[],
      text,
      text,
      text,
      text[],
      text[],
      jsonb,
      boolean,
      text
    ),
    public.get_public_professional_profile(text)
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


grant execute
  on function public.get_public_professional_profile(text)
  to anon, authenticated;


commit;