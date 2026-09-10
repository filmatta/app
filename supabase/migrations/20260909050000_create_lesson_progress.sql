begin;

create table public.lesson_progress (
  user_id uuid not null,
  course_id uuid not null,
  lesson_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lesson_progress_pkey
    primary key (user_id, lesson_id),

  constraint lesson_progress_user_fk
    foreign key (user_id)
    references auth.users (id)
    on update restrict
    on delete cascade,

  constraint lesson_progress_lesson_course_fk
    foreign key (lesson_id, course_id)
    references public.course_lessons (id, course_id)
    on update restrict
    on delete cascade,

  constraint lesson_progress_completed_at_check
    check (
      completed_at is null
      or completed_at >= started_at
    )
);

comment on table public.lesson_progress is
  'Current per-user lesson state. It records learning progress only and never grants paid access.';

create index lesson_progress_user_course_activity_idx
  on public.lesson_progress (user_id, course_id, last_activity_at desc);

create trigger lesson_progress_set_updated_at
before update on public.lesson_progress
for each row
execute function private.set_learn_updated_at();


-- These partial unique indexes keep immutable analytics idempotent even when
-- a server action is retried or two browser requests arrive at the same time.
create unique index learning_events_lesson_started_unique_idx
  on public.learning_events (user_id, lesson_id)
  where event_type = 'lesson_started';

create unique index learning_events_lesson_completed_unique_idx
  on public.learning_events (user_id, lesson_id)
  where event_type = 'lesson_completed';

create unique index learning_events_course_completed_unique_idx
  on public.learning_events (user_id, course_id)
  where event_type = 'course_completed';


alter table public.lesson_progress enable row level security;

revoke all privileges
  on table public.lesson_progress
  from public, anon, authenticated;

grant select
  on table public.lesson_progress
  to authenticated;

create policy lesson_progress_own_read
on public.lesson_progress
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy lesson_progress_admin_read
on public.lesson_progress
for select
to authenticated
using (
  (select private.is_admin())
);


create function public.start_preview_lesson(
  p_course_id uuid,
  p_lesson_id uuid
)
returns public.lesson_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  progress_row public.lesson_progress;
begin
  if current_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.course_lessons as lesson
    join public.course_modules as module
      on module.id = lesson.module_id
      and module.course_id = lesson.course_id
    join public.courses as course
      on course.id = lesson.course_id
    where lesson.id = p_lesson_id
      and lesson.course_id = p_course_id
      and lesson.status = 'published'
      and lesson.is_preview
      and module.status = 'published'
      and course.status = 'published'
  ) then
    raise exception 'Lesson is not available for progress'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.course_enrollments as enrollment
    where enrollment.user_id = current_user_id
      and enrollment.course_id = p_course_id
      and enrollment.status in ('active', 'completed')
      and (
        enrollment.access_expires_at is null
        or enrollment.access_expires_at > now()
      )
  ) then
    raise exception 'Active enrollment required'
      using errcode = '42501';
  end if;

  insert into public.lesson_progress (
    user_id,
    course_id,
    lesson_id,
    started_at,
    last_activity_at
  )
  values (
    current_user_id,
    p_course_id,
    p_lesson_id,
    now(),
    now()
  )
  on conflict (user_id, lesson_id)
  do update set
    last_activity_at = excluded.last_activity_at
  returning * into progress_row;

  insert into public.learning_events (
    user_id,
    course_id,
    lesson_id,
    event_type,
    metadata
  )
  values (
    current_user_id,
    p_course_id,
    p_lesson_id,
    'lesson_started',
    '{}'::jsonb
  )
  on conflict do nothing;

  return progress_row;
end;
$$;

comment on function public.start_preview_lesson(uuid, uuid) is
  'Starts an enrolled user in a published preview lesson. Enrollment is participation, not paid access.';

revoke all privileges
  on function public.start_preview_lesson(uuid, uuid)
  from public, anon, authenticated;

grant execute
  on function public.start_preview_lesson(uuid, uuid)
  to authenticated;


create function public.complete_preview_lesson(
  p_course_id uuid,
  p_lesson_id uuid
)
returns public.lesson_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  progress_row public.lesson_progress;
  course_is_fully_accessible boolean := false;
  course_is_complete boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.course_lessons as lesson
    join public.course_modules as module
      on module.id = lesson.module_id
      and module.course_id = lesson.course_id
    join public.courses as course
      on course.id = lesson.course_id
    where lesson.id = p_lesson_id
      and lesson.course_id = p_course_id
      and lesson.status = 'published'
      and lesson.is_preview
      and module.status = 'published'
      and course.status = 'published'
  ) then
    raise exception 'Lesson is not available for completion'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.course_enrollments as enrollment
    where enrollment.user_id = current_user_id
      and enrollment.course_id = p_course_id
      and enrollment.status in ('active', 'completed')
      and (
        enrollment.access_expires_at is null
        or enrollment.access_expires_at > now()
      )
  ) then
    raise exception 'Active enrollment required'
      using errcode = '42501';
  end if;

  insert into public.lesson_progress (
    user_id,
    course_id,
    lesson_id,
    started_at,
    completed_at,
    last_activity_at
  )
  values (
    current_user_id,
    p_course_id,
    p_lesson_id,
    now(),
    now(),
    now()
  )
  on conflict (user_id, lesson_id)
  do update set
    completed_at = coalesce(
      public.lesson_progress.completed_at,
      excluded.completed_at
    ),
    last_activity_at = excluded.last_activity_at
  returning * into progress_row;

  insert into public.learning_events (
    user_id,
    course_id,
    lesson_id,
    event_type,
    metadata
  )
  values (
    current_user_id,
    p_course_id,
    p_lesson_id,
    'lesson_started',
    '{}'::jsonb
  )
  on conflict do nothing;

  insert into public.learning_events (
    user_id,
    course_id,
    lesson_id,
    event_type,
    metadata
  )
  values (
    current_user_id,
    p_course_id,
    p_lesson_id,
    'lesson_completed',
    '{}'::jsonb
  )
  on conflict do nothing;

  -- Until paid entitlements exist, a course is only eligible for automatic
  -- completion when every published lesson is a preview lesson. This prevents
  -- completing a paid course after only its free previews were viewed.
  select
    exists (
      select 1
      from public.course_lessons as lesson
      join public.course_modules as module
        on module.id = lesson.module_id
        and module.course_id = lesson.course_id
      where lesson.course_id = p_course_id
        and lesson.status = 'published'
        and module.status = 'published'
    )
    and not exists (
      select 1
      from public.course_lessons as lesson
      join public.course_modules as module
        on module.id = lesson.module_id
        and module.course_id = lesson.course_id
      where lesson.course_id = p_course_id
        and lesson.status = 'published'
        and module.status = 'published'
        and not lesson.is_preview
    )
  into course_is_fully_accessible;

  if course_is_fully_accessible then
    select not exists (
      select 1
      from public.course_lessons as lesson
      join public.course_modules as module
        on module.id = lesson.module_id
        and module.course_id = lesson.course_id
      left join public.lesson_progress as progress
        on progress.lesson_id = lesson.id
        and progress.course_id = lesson.course_id
        and progress.user_id = current_user_id
      where lesson.course_id = p_course_id
        and lesson.status = 'published'
        and lesson.is_preview
        and module.status = 'published'
        and progress.completed_at is null
    )
    into course_is_complete;
  end if;

  if course_is_complete then
    update public.course_enrollments
    set
      status = 'completed',
      completed_at = coalesce(completed_at, now())
    where user_id = current_user_id
      and course_id = p_course_id
      and status in ('active', 'completed');

    insert into public.learning_events (
      user_id,
      course_id,
      event_type,
      metadata
    )
    values (
      current_user_id,
      p_course_id,
      'course_completed',
      '{}'::jsonb
    )
    on conflict do nothing;
  end if;

  return progress_row;
end;
$$;

comment on function public.complete_preview_lesson(uuid, uuid) is
  'Completes an enrolled user preview lesson and conservatively completes fully free courses.';

revoke all privileges
  on function public.complete_preview_lesson(uuid, uuid)
  from public, anon, authenticated;

grant execute
  on function public.complete_preview_lesson(uuid, uuid)
  to authenticated;

commit;
