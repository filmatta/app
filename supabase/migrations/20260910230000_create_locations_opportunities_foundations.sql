begin;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  slug text not null unique,
  summary text,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_id_owner_unique unique (id, owner_id),
  constraint projects_title_check check (
    title = btrim(title)
    and title ~ '[^[:space:]]'
    and char_length(title) between 1 and 160
  ),
  constraint projects_slug_check check (
    char_length(slug) between 1 and 160
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint projects_summary_check check (
    summary is null
    or (
      summary ~ '[^[:space:]]'
      and char_length(summary) <= 500
    )
  ),
  constraint projects_status_check check (
    status in ('draft', 'published', 'archived')
  ),
  constraint projects_published_at_finite_check check (
    published_at is null or isfinite(published_at)
  ),
  constraint projects_published_at_check check (
    status <> 'published' or published_at is not null
  )
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  slug text not null unique,
  summary text,
  description text,
  city text not null,
  area text,
  space_type text not null,
  environment text not null default 'both',
  price_amount numeric(12, 2),
  price_currency text,
  price_unit text,
  restrictions text,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint locations_id_owner_unique unique (id, owner_id),
  constraint locations_title_check check (
    title = btrim(title)
    and title ~ '[^[:space:]]'
    and char_length(title) between 1 and 160
  ),
  constraint locations_slug_check check (
    char_length(slug) between 1 and 160
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint locations_summary_check check (
    summary is null
    or (
      summary ~ '[^[:space:]]'
      and char_length(summary) <= 500
    )
  ),
  constraint locations_description_check check (
    description is null
    or (
      description ~ '[^[:space:]]'
      and char_length(description) <= 20000
    )
  ),
  constraint locations_city_check check (
    city = btrim(city)
    and city ~ '[^[:space:]]'
    and char_length(city) between 1 and 120
  ),
  constraint locations_area_check check (
    area is null
    or (
      area = btrim(area)
      and area ~ '[^[:space:]]'
      and char_length(area) between 1 and 120
    )
  ),
  constraint locations_space_type_check check (
    space_type = btrim(space_type)
    and space_type ~ '[^[:space:]]'
    and char_length(space_type) between 1 and 120
  ),
  constraint locations_environment_check check (
    environment in ('interior', 'exterior', 'both')
  ),
  constraint locations_price_amount_check check (
    price_amount is null
    or (
      price_amount <> 'NaN'::numeric
      and price_amount >= 0
    )
  ),
  constraint locations_price_fields_check check (
    (price_amount is null and price_currency is null and price_unit is null)
    or (
      price_amount is not null
      and price_currency is not null
      and price_currency ~ '^[A-Z]{3}$'
      and price_unit is not null
      and price_unit in ('hour', 'day', 'project')
    )
  ),
  constraint locations_status_check check (
    status in ('draft', 'published', 'archived')
  ),
  constraint locations_restrictions_check check (
    restrictions is null
    or (
      restrictions ~ '[^[:space:]]'
      and char_length(restrictions) <= 10000
    )
  ),
  constraint locations_published_at_finite_check check (
    published_at is null or isfinite(published_at)
  ),
  constraint locations_published_at_check check (
    status <> 'published' or published_at is not null
  )
);

create table public.location_photos (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  owner_id uuid not null,
  image_url text not null,
  storage_path text,
  alt_text text,
  sort_order integer not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint location_photos_location_owner_fk
    foreign key (location_id, owner_id)
    references public.locations (id, owner_id)
    on update restrict
    on delete cascade,
  constraint location_photos_image_url_check check (
    image_url = btrim(image_url)
    and image_url ~ '^https://'
    and char_length(image_url) <= 2048
  ),
  constraint location_photos_storage_path_check check (
    storage_path is null
    or (
      storage_path = btrim(storage_path)
      and storage_path ~ '[^[:space:]]'
      and char_length(storage_path) between 1 and 1024
    )
  ),
  constraint location_photos_alt_text_check check (
    alt_text is null
    or (
      alt_text ~ '[^[:space:]]'
      and char_length(alt_text) <= 300
    )
  ),
  constraint location_photos_sort_order_check check (sort_order >= 0),
  constraint location_photos_status_check check (
    status in ('draft', 'published', 'archived')
  )
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_id uuid not null,
  title text not null,
  slug text not null unique,
  summary text,
  description text,
  category text not null,
  discipline text,
  city text,
  work_mode text not null default 'on_site',
  compensation_type text not null default 'unspecified',
  compensation_min numeric(12, 2),
  compensation_max numeric(12, 2),
  compensation_currency text,
  starts_on date,
  ends_on date,
  application_deadline timestamptz,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint opportunities_project_owner_fk
    foreign key (project_id, owner_id)
    references public.projects (id, owner_id)
    on update restrict
    on delete cascade,
  constraint opportunities_title_check check (
    title = btrim(title)
    and title ~ '[^[:space:]]'
    and char_length(title) between 1 and 160
  ),
  constraint opportunities_slug_check check (
    char_length(slug) between 1 and 160
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint opportunities_summary_check check (
    summary is null
    or (
      summary ~ '[^[:space:]]'
      and char_length(summary) <= 500
    )
  ),
  constraint opportunities_description_check check (
    description is null
    or (
      description ~ '[^[:space:]]'
      and char_length(description) <= 20000
    )
  ),
  constraint opportunities_category_check check (
    category in ('casting', 'crew', 'paid_work', 'collaboration', 'internship')
  ),
  constraint opportunities_discipline_check check (
    discipline is null
    or (
      discipline = btrim(discipline)
      and discipline ~ '[^[:space:]]'
      and char_length(discipline) between 1 and 120
    )
  ),
  constraint opportunities_city_check check (
    city is null
    or (
      city = btrim(city)
      and city ~ '[^[:space:]]'
      and char_length(city) between 1 and 120
    )
  ),
  constraint opportunities_work_mode_check check (
    work_mode in ('on_site', 'remote', 'hybrid')
  ),
  constraint opportunities_compensation_type_check check (
    compensation_type in ('paid', 'expenses', 'unpaid', 'unspecified')
  ),
  constraint opportunities_compensation_range_check check (
    compensation_min is null
    or (
      compensation_type = 'paid'
      and compensation_min <> 'NaN'::numeric
      and compensation_min >= 0
      and compensation_currency is not null
      and compensation_currency ~ '^[A-Z]{3}$'
      and (
        compensation_max is null
        or (
          compensation_max <> 'NaN'::numeric
          and compensation_max >= compensation_min
        )
      )
    )
  ),
  constraint opportunities_compensation_max_check check (
    compensation_max is null or compensation_min is not null
  ),
  constraint opportunities_compensation_currency_check check (
    compensation_currency is null or compensation_min is not null
  ),
  constraint opportunities_dates_check check (
    starts_on is null or ends_on is null or ends_on >= starts_on
  ),
  constraint opportunities_dates_supported_range_check check (
    (
      starts_on is null
      or (
        isfinite(starts_on)
        and starts_on between date '2000-01-01' and date '2200-12-31'
      )
    )
    and (
      ends_on is null
      or (
        isfinite(ends_on)
        and ends_on between date '2000-01-01' and date '2200-12-31'
      )
    )
    and (
      application_deadline is null
      or (
        isfinite(application_deadline)
        and application_deadline >= timestamptz '2000-01-01 00:00:00+00'
        and application_deadline < timestamptz '2201-01-01 00:00:00+00'
      )
    )
  ),
  constraint opportunities_status_check check (
    status in ('draft', 'published', 'closed', 'archived')
  ),
  constraint opportunities_published_at_finite_check check (
    published_at is null or isfinite(published_at)
  ),
  constraint opportunities_published_at_check check (
    status <> 'published' or published_at is not null
  )
);

create index projects_owner_status_idx
  on public.projects (owner_id, status, updated_at desc);

create index locations_public_catalog_idx
  on public.locations (published_at desc, id)
  where status = 'published';

create index locations_owner_status_idx
  on public.locations (owner_id, status, updated_at desc);

create index location_photos_location_status_order_idx
  on public.location_photos (location_id, status, sort_order, id);

create index opportunities_public_catalog_idx
  on public.opportunities (published_at desc, id)
  where status = 'published';

create index opportunities_project_status_idx
  on public.opportunities (project_id, status, updated_at desc);

create index opportunities_owner_status_idx
  on public.opportunities (owner_id, status, updated_at desc);

create function private.set_vertical_foundation_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create function private.set_vertical_publication_timestamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' then
      new.published_at := now();
    else
      new.published_at := null;
    end if;
  elsif new.status = 'published' and old.status is distinct from 'published' then
    new.published_at := coalesce(old.published_at, now());
  else
    new.published_at := old.published_at;
  end if;

  return new;
end;
$$;

revoke all privileges
  on function private.set_vertical_foundation_timestamps()
  from public, anon, authenticated;

revoke all privileges
  on function private.set_vertical_publication_timestamp()
  from public, anon, authenticated;

create trigger projects_set_timestamps
before insert or update on public.projects
for each row
execute function private.set_vertical_foundation_timestamps();

create trigger projects_set_publication_timestamp
before insert or update on public.projects
for each row
execute function private.set_vertical_publication_timestamp();

create trigger locations_set_timestamps
before insert or update on public.locations
for each row
execute function private.set_vertical_foundation_timestamps();

create trigger location_photos_set_timestamps
before insert or update on public.location_photos
for each row
execute function private.set_vertical_foundation_timestamps();

create trigger opportunities_set_timestamps
before insert or update on public.opportunities
for each row
execute function private.set_vertical_foundation_timestamps();

create trigger locations_set_publication_timestamp
before insert or update on public.locations
for each row
execute function private.set_vertical_publication_timestamp();

create trigger opportunities_set_publication_timestamp
before insert or update on public.opportunities
for each row
execute function private.set_vertical_publication_timestamp();

alter table public.projects enable row level security;
alter table public.locations enable row level security;
alter table public.location_photos enable row level security;
alter table public.opportunities enable row level security;

revoke all privileges
  on table
    public.projects,
    public.locations,
    public.location_photos,
    public.opportunities
  from public, anon, authenticated;

grant select
  on table
    public.projects,
    public.locations,
    public.location_photos,
    public.opportunities
  to anon;

grant select, insert, update, delete
  on table
    public.projects,
    public.locations,
    public.location_photos,
    public.opportunities
  to authenticated;

create policy projects_public_read
on public.projects
for select
to anon, authenticated
using (status = 'published');

create policy projects_owner_read
on public.projects
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy projects_owner_insert
on public.projects
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy projects_owner_update
on public.projects
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy projects_owner_delete
on public.projects
for delete
to authenticated
using ((select auth.uid()) = owner_id);

create policy projects_admin_all
on public.projects
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy locations_public_read
on public.locations
for select
to anon, authenticated
using (status = 'published');

create policy locations_owner_read
on public.locations
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy locations_owner_insert
on public.locations
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy locations_owner_update
on public.locations
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy locations_owner_delete
on public.locations
for delete
to authenticated
using ((select auth.uid()) = owner_id);

create policy locations_admin_all
on public.locations
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy location_photos_public_read
on public.location_photos
for select
to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.locations as location
    where location.id = location_photos.location_id
      and location.status = 'published'
  )
);

create policy location_photos_owner_read
on public.location_photos
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy location_photos_owner_insert
on public.location_photos
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.locations as location
    where location.id = location_photos.location_id
      and location.owner_id = (select auth.uid())
  )
);

create policy location_photos_owner_update
on public.location_photos
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.locations as location
    where location.id = location_photos.location_id
      and location.owner_id = (select auth.uid())
  )
);

create policy location_photos_owner_delete
on public.location_photos
for delete
to authenticated
using ((select auth.uid()) = owner_id);

create policy location_photos_admin_all
on public.location_photos
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy opportunities_public_read
on public.opportunities
for select
to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.projects as project
    where project.id = opportunities.project_id
      and project.status = 'published'
  )
);

create policy opportunities_owner_read
on public.opportunities
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy opportunities_owner_insert
on public.opportunities
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.projects as project
    where project.id = opportunities.project_id
      and project.owner_id = (select auth.uid())
  )
);

create policy opportunities_owner_update
on public.opportunities
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.projects as project
    where project.id = opportunities.project_id
      and project.owner_id = (select auth.uid())
  )
);

create policy opportunities_owner_delete
on public.opportunities
for delete
to authenticated
using ((select auth.uid()) = owner_id);

create policy opportunities_admin_all
on public.opportunities
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

commit;
