begin;

create or replace function public.set_lesson_video_access(
  p_lesson_id uuid,
  p_is_preview boolean,
  p_playback_policy text,
  p_mux_playback_id text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_playback_policy <> case when p_is_preview then 'public' else 'signed' end then
    raise exception 'Playback policy does not match preview setting';
  end if;

  if p_mux_playback_id is null or btrim(p_mux_playback_id) = '' then
    raise exception 'Mux playback ID is required';
  end if;

  update public.lesson_videos
  set playback_policy = p_playback_policy,
      mux_playback_id = p_mux_playback_id
  where lesson_id = p_lesson_id
    and status = 'ready'
    and mux_asset_id is not null;

  if not found then
    raise exception 'Ready lesson video not found';
  end if;

  update public.course_lessons
  set is_preview = p_is_preview
  where id = p_lesson_id;

  if not found then
    raise exception 'Lesson not found';
  end if;
end;
$$;

revoke all privileges
on function public.set_lesson_video_access(uuid, boolean, text, text)
from public, anon, authenticated;

grant execute
on function public.set_lesson_video_access(uuid, boolean, text, text)
to authenticated;

commit;
