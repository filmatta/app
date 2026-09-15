-- REVIEW ONLY. Apply manually to the dedicated FILMATTA Production Supabase project.
-- This creates only the core objects that the versioned Learn migrations assume.
-- It contains no users, courses, QA fixtures, Stripe IDs, or Billing activation.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on update restrict on delete cascade,
  role text not null default 'user' check (role in ('user', 'instructor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  short_description text,
  description text,
  cover_image_url text,
  cover_image_path text,
  category text,
  level text,
  duration_minutes integer,
  instructor text,
  hotmart_url text,
  status text not null default 'draft',
  featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint courses_title_check
    check (title = btrim(title) and char_length(title) between 1 and 200),
  constraint courses_slug_check
    check (
      char_length(slug) between 1 and 160
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  constraint courses_duration_check
    check (duration_minutes is null or duration_minutes >= 0),
  constraint courses_sort_order_check
    check (sort_order >= 0),
  constraint courses_status_check
    check (status in ('draft', 'published', 'archived'))
);

create index courses_status_sort_order_idx
  on public.courses(status, sort_order, id);

create function private.set_core_updated_at()
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

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select profile.role = 'admin'
      from public.profiles as profile
      where profile.id = (select auth.uid())
    ),
    false
  );
$$;

create function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.set_core_updated_at() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
revoke all on function private.create_profile_for_new_user() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated, service_role;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_core_updated_at();

create trigger courses_set_updated_at
before update on public.courses
for each row execute function private.set_core_updated_at();

create trigger auth_users_create_profile
after insert on auth.users
for each row execute function private.create_profile_for_new_user();

-- Safe for a new project and also covers users created before this bootstrap.
insert into public.profiles(id)
select id from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;

revoke all on public.profiles, public.courses from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.courses to anon, authenticated;
grant insert, update, delete on public.courses to authenticated;
grant all on public.profiles, public.courses to service_role;

create policy profiles_own_read
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy courses_public_read
on public.courses
for select
to anon, authenticated
using (status = 'published');

create policy courses_admin_all
on public.courses
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- Course cover storage is application infrastructure, not a content fixture.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'course-covers',
  'course-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy course_covers_public_read
on storage.objects
for select
to public
using (bucket_id = 'course-covers');

create policy course_covers_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'course-covers'
  and (select private.is_admin())
);

create policy course_covers_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'course-covers'
  and (select private.is_admin())
)
with check (
  bucket_id = 'course-covers'
  and (select private.is_admin())
);

create policy course_covers_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'course-covers'
  and (select private.is_admin())
);

commit;
