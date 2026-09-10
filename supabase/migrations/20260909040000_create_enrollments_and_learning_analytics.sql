begin;

create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  course_id uuid not null,
  status text not null default 'active',
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint course_enrollments_user_fk
    foreign key (user_id)
    references auth.users (id)
    on update restrict
    on delete cascade,

  constraint course_enrollments_course_fk
    foreign key (course_id)
    references public.courses (id)
    on update restrict
    on delete cascade,

  constraint course_enrollments_user_course_unique
    unique (user_id, course_id),

  constraint course_enrollments_status_check
    check (status in ('active', 'completed', 'cancelled', 'expired')),

  constraint course_enrollments_completed_at_check
    check (
      completed_at is null
      or completed_at >= enrolled_at
    ),

  constraint course_enrollments_access_expires_at_check
    check (
      access_expires_at is null
      or access_expires_at >= enrolled_at
    )
);

comment on table public.course_enrollments is
  'Course participation records. An enrollment is not a paid entitlement.';

create index course_enrollments_course_status_idx
  on public.course_enrollments (course_id, status);

create index course_enrollments_user_status_idx
  on public.course_enrollments (user_id, status);

create trigger course_enrollments_set_updated_at
before update on public.course_enrollments
for each row
execute function private.set_learn_updated_at();


-- Allows learning_events to guarantee that a lesson belongs
-- to the same course declared by the event.
alter table public.course_lessons
  add constraint course_lessons_id_course_unique
  unique (id, course_id);


create table public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  course_id uuid not null,
  lesson_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint learning_events_user_fk
    foreign key (user_id)
    references auth.users (id)
    on update restrict
    on delete cascade,

  constraint learning_events_course_fk
    foreign key (course_id)
    references public.courses (id)
    on update restrict
    on delete cascade,

  constraint learning_events_lesson_course_fk
    foreign key (lesson_id, course_id)
    references public.course_lessons (id, course_id)
    on update restrict
    on delete cascade,

  constraint learning_events_type_check
    check (
      event_type in (
        'course_enrolled',
        'lesson_started',
        'lesson_completed',
        'course_completed'
      )
    ),

  constraint learning_events_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.learning_events is
  'Append-only learning telemetry written by trusted database functions.';

create index learning_events_user_created_idx
  on public.learning_events (user_id, created_at desc);

create index learning_events_course_created_idx
  on public.learning_events (course_id, created_at desc);

create index learning_events_lesson_created_idx
  on public.learning_events (lesson_id, created_at desc)
  where lesson_id is not null;

create unique index learning_events_course_enrolled_unique_idx
  on public.learning_events (user_id, course_id)
  where event_type = 'course_enrolled';


alter table public.course_enrollments enable row level security;
alter table public.learning_events enable row level security;


revoke all privileges
  on table
    public.course_enrollments,
    public.learning_events
  from public, anon, authenticated;


grant select, insert, update, delete
  on table public.course_enrollments
  to authenticated;

grant select
  on table public.learning_events
  to authenticated;


create policy course_enrollments_own_read
on public.course_enrollments
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy course_enrollments_admin_all
on public.course_enrollments
for all
to authenticated
using (
  (select private.is_admin())
)
with check (
  (select private.is_admin())
);


create policy learning_events_own_read
on public.learning_events
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy learning_events_admin_read
on public.learning_events
for select
to authenticated
using (
  (select private.is_admin())
);


create function public.enroll_in_published_course(
  p_course_id uuid
)
returns public.course_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  enrollment public.course_enrollments;
begin
  if current_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.courses as course
    where course.id = p_course_id
      and course.status = 'published'
  ) then
    raise exception 'Course is not available for enrollment'
      using errcode = 'P0002';
  end if;

  insert into public.course_enrollments (
    user_id,
    course_id,
    status,
    enrolled_at,
    completed_at,
    access_expires_at
  )
  values (
    current_user_id,
    p_course_id,
    'active',
    now(),
    null,
    null
  )
  on conflict (user_id, course_id)
  do nothing
  returning * into enrollment;

  if enrollment.id is null then
    select existing_enrollment.*
    into enrollment
    from public.course_enrollments as existing_enrollment
    where existing_enrollment.user_id = current_user_id
      and existing_enrollment.course_id = p_course_id;
  end if;

  if enrollment.id is null then
    raise exception 'Enrollment could not be created'
      using errcode = 'P0001';
  end if;

  if enrollment.status not in ('active', 'completed') then
    raise exception 'Enrollment cannot be reactivated by the user'
      using errcode = '42501';
  end if;

  insert into public.learning_events (
    user_id,
    course_id,
    event_type,
    metadata
  )
  values (
    current_user_id,
    p_course_id,
    'course_enrolled',
    '{}'::jsonb
  )
  on conflict do nothing;

  return enrollment;
end;
$$;

comment on function public.enroll_in_published_course(uuid) is
  'Enrolls auth.uid() in a published course without granting paid access.';

revoke all privileges
  on function public.enroll_in_published_course(uuid)
  from public, anon, authenticated;

grant execute
  on function public.enroll_in_published_course(uuid)
  to authenticated;


create function public.get_admin_learn_stats()
returns table (
  users_total bigint,
  courses_total bigint,
  published_courses bigint,
  enrollments_total bigint,
  enrolled_students bigint,
  active_enrollments bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  return query
  select
    (
      select count(*)
      from auth.users
    ),
    (
      select count(*)
      from public.courses
    ),
    (
      select count(*)
      from public.courses
      where status = 'published'
    ),
    (
      select count(*)
      from public.course_enrollments
    ),
    (
      select count(distinct user_id)
      from public.course_enrollments
    ),
    (
      select count(*)
      from public.course_enrollments
      where status = 'active'
    );
end;
$$;

revoke all privileges
  on function public.get_admin_learn_stats()
  from public, anon, authenticated;

grant execute
  on function public.get_admin_learn_stats()
  to authenticated;

commit;