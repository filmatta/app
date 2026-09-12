-- REVIEW ONLY. Apply after billing foundation, only after manual review.
begin;

create function private.has_regular_course_access(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.get_my_billing_plan() is not null and exists (
    select 1 from public.courses where id=p_course and billing_access='regular'
  );
$$;
revoke all on function private.has_regular_course_access(uuid) from public,anon,authenticated;

create function public.start_entitled_lesson(
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
  has_regular_access boolean := private.has_regular_course_access(p_course_id);
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
      and (lesson.is_preview or has_regular_access)
      and module.status = 'published'
      and course.status = 'published'
      and course.content_type = 'course'
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

comment on function public.start_entitled_lesson(uuid, uuid) is
  'Starts an enrolled user in an authorized lesson; validates paid access in the database.';

revoke all privileges
  on function public.start_entitled_lesson(uuid, uuid)
  from public, anon, authenticated;

grant execute
  on function public.start_entitled_lesson(uuid, uuid)
  to authenticated;


create function public.complete_entitled_lesson(
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
  has_regular_access boolean := private.has_regular_course_access(p_course_id);
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
      and (lesson.is_preview or has_regular_access)
      and module.status = 'published'
      and course.status = 'published'
      and course.content_type = 'course'
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

  -- Completion requires access to every published lesson, then completion of all.
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
        and not (lesson.is_preview or has_regular_access)
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
        and (lesson.is_preview or has_regular_access)
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

comment on function public.complete_entitled_lesson(uuid, uuid) is
  'Completes an authorized lesson; all published lessons are required for course completion.';

revoke all privileges
  on function public.complete_entitled_lesson(uuid, uuid)
  from public, anon, authenticated;

grant execute
  on function public.complete_entitled_lesson(uuid, uuid)
  to authenticated;


-- Compatibility aliases for clients deployed before the entitled RPCs. Both
-- preview and premium progress now use the same database authorization path.
create or replace function public.start_preview_lesson(
  p_course_id uuid,
  p_lesson_id uuid
)
returns public.lesson_progress
language sql
security invoker
set search_path = ''
as $$
  select public.start_entitled_lesson(p_course_id, p_lesson_id);
$$;

comment on function public.start_preview_lesson(uuid, uuid) is
  'Compatibility alias for start_entitled_lesson; database authorization remains authoritative.';

revoke all privileges
  on function public.start_preview_lesson(uuid, uuid)
  from public, anon, authenticated;

grant execute
  on function public.start_preview_lesson(uuid, uuid)
  to authenticated;


create or replace function public.complete_preview_lesson(
  p_course_id uuid,
  p_lesson_id uuid
)
returns public.lesson_progress
language sql
security invoker
set search_path = ''
as $$
  select public.complete_entitled_lesson(p_course_id, p_lesson_id);
$$;

comment on function public.complete_preview_lesson(uuid, uuid) is
  'Compatibility alias for complete_entitled_lesson; database authorization remains authoritative.';

revoke all privileges
  on function public.complete_preview_lesson(uuid, uuid)
  from public, anon, authenticated;

grant execute
  on function public.complete_preview_lesson(uuid, uuid)
  to authenticated;

commit;
