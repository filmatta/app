begin;

create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  title text not null,
  description text,
  sort_order integer not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint course_modules_course_fk
    foreign key (course_id)
    references public.courses (id)
    on update restrict
    on delete cascade,

  constraint course_modules_id_course_unique
    unique (id, course_id),

  constraint course_modules_title_check
    check (
      title = btrim(title)
      and char_length(title) between 1 and 200
    ),

  constraint course_modules_sort_order_check
    check (sort_order >= 0),

  constraint course_modules_status_check
    check (status in ('draft', 'published', 'archived'))
);

create table public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null,
  course_id uuid not null,
  title text not null,
  slug text not null,
  description text,
  duration_minutes integer,
  sort_order integer not null default 0,
  is_preview boolean not null default false,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint course_lessons_module_course_fk
    foreign key (module_id, course_id)
    references public.course_modules (id, course_id)
    on update restrict
    on delete cascade,

  constraint course_lessons_course_slug_unique
    unique (course_id, slug),

  constraint course_lessons_title_check
    check (
      title = btrim(title)
      and char_length(title) between 1 and 200
    ),

  constraint course_lessons_slug_check
    check (
      char_length(slug) between 1 and 160
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),

  constraint course_lessons_duration_check
    check (
      duration_minutes is null
      or duration_minutes >= 0
    ),

  constraint course_lessons_sort_order_check
    check (sort_order >= 0),

  constraint course_lessons_status_check
    check (status in ('draft', 'published', 'archived'))
);

create table public.lesson_videos (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null,
  provider text not null default 'mux',
  mux_asset_id text,
  mux_playback_id text,
  playback_policy text not null,
  status text not null default 'preparing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lesson_videos_lesson_fk
    foreign key (lesson_id)
    references public.course_lessons (id)
    on update restrict
    on delete cascade,

  constraint lesson_videos_lesson_unique
    unique (lesson_id),

  constraint lesson_videos_provider_check
    check (provider = 'mux'),

  constraint lesson_videos_mux_asset_id_check
    check (
      mux_asset_id is null
      or (
        mux_asset_id = btrim(mux_asset_id)
        and char_length(mux_asset_id) > 0
      )
    ),

  constraint lesson_videos_mux_playback_id_check
    check (
      mux_playback_id is null
      or (
        mux_playback_id = btrim(mux_playback_id)
        and char_length(mux_playback_id) > 0
      )
    ),

  constraint lesson_videos_playback_policy_check
    check (playback_policy in ('public', 'signed')),

  constraint lesson_videos_status_check
    check (status in ('preparing', 'ready', 'errored')),

  constraint lesson_videos_ready_ids_check
    check (
      status <> 'ready'
      or (
        mux_asset_id is not null
        and mux_playback_id is not null
      )
    )
);

create index course_modules_course_order_idx
  on public.course_modules (course_id, sort_order, id);

create index course_lessons_module_order_idx
  on public.course_lessons (module_id, sort_order, id);

create function private.set_learn_updated_at()
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

create function private.validate_lesson_video_policy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_lesson_id uuid;
begin
  if tg_table_name = 'lesson_videos' then
    affected_lesson_id := new.lesson_id;
  else
    affected_lesson_id := new.id;
  end if;

  if exists (
    select 1
    from public.course_lessons as lesson
    join public.lesson_videos as video
      on video.lesson_id = lesson.id
    where lesson.id = affected_lesson_id
      and (
        (lesson.is_preview and video.playback_policy <> 'public')
        or
        (not lesson.is_preview and video.playback_policy <> 'signed')
      )
  ) then
    raise exception
      'Video playback_policy must match the lesson preview setting';
  end if;

  return new;
end;
$$;

revoke all privileges
  on function private.set_learn_updated_at()
  from public, anon, authenticated;

revoke all privileges
  on function private.validate_lesson_video_policy()
  from public, anon, authenticated;

create trigger course_modules_set_updated_at
before update on public.course_modules
for each row
execute function private.set_learn_updated_at();

create trigger course_lessons_set_updated_at
before update on public.course_lessons
for each row
execute function private.set_learn_updated_at();

create trigger lesson_videos_set_updated_at
before update on public.lesson_videos
for each row
execute function private.set_learn_updated_at();

create constraint trigger lesson_videos_validate_policy
after insert or update on public.lesson_videos
deferrable initially deferred
for each row
execute function private.validate_lesson_video_policy();

create constraint trigger course_lessons_validate_video_policy
after update on public.course_lessons
deferrable initially deferred
for each row
when (old.is_preview is distinct from new.is_preview)
execute function private.validate_lesson_video_policy();

alter table public.course_modules enable row level security;
alter table public.course_lessons enable row level security;
alter table public.lesson_videos enable row level security;

revoke all privileges
  on table
    public.course_modules,
    public.course_lessons,
    public.lesson_videos
  from public, anon, authenticated;

grant select
  on table public.course_modules, public.course_lessons
  to anon;

grant select, insert, update, delete
  on table
    public.course_modules,
    public.course_lessons,
    public.lesson_videos
  to authenticated;

create policy course_modules_public_read
on public.course_modules
for select
to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.courses as course
    where course.id = course_modules.course_id
      and course.status = 'published'
  )
);

create policy course_modules_admin_all
on public.course_modules
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy course_lessons_public_read
on public.course_lessons
for select
to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.course_modules as module
    join public.courses as course
      on course.id = module.course_id
    where module.id = course_lessons.module_id
      and module.course_id = course_lessons.course_id
      and module.status = 'published'
      and course.status = 'published'
  )
);

create policy course_lessons_admin_all
on public.course_lessons
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy lesson_videos_admin_all
on public.lesson_videos
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

commit;