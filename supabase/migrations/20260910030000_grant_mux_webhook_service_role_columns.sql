begin;

revoke all privileges
on table public.lesson_videos
from service_role;

revoke all privileges
on table public.course_lessons
from service_role;

grant select (
  id,
  lesson_id,
  mux_asset_id,
  mux_playback_id,
  playback_policy,
  status,
  created_at,
  updated_at
)
on table public.lesson_videos
to service_role;

grant update (
  mux_asset_id,
  mux_playback_id,
  status
)
on table public.lesson_videos
to service_role;

grant select (
  id,
  is_preview
)
on table public.course_lessons
to service_role;

grant update (
  duration_minutes
)
on table public.course_lessons
to service_role;

commit;
