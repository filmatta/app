begin;

alter table public.courses
  add column is_listed boolean not null default true;

comment on column public.courses.is_listed is
  'Published content appears in public discovery only when listed. Direct URLs remain available.';

create index courses_public_catalog_order_idx
  on public.courses (sort_order, id)
  where status = 'published' and is_listed;

alter table public.lesson_videos
  add column mux_environment_id text,
  add column mux_environment_type text;

comment on column public.lesson_videos.mux_environment_id is
  'Mux environment verified server-side before this video association was persisted.';

comment on column public.lesson_videos.mux_environment_type is
  'Mux environment type verified server-side: development or production.';

-- NOT VALID preserves legacy Test/Preview rows until each asset is verified
-- against Mux and safely reconciled. PostgreSQL still enforces both checks for
-- every new or updated row, while Production (currently empty) can validate
-- them immediately below.
alter table public.lesson_videos
  add constraint lesson_videos_mux_environment_pair_check
  check (
    (
      mux_environment_id is null
      and mux_environment_type is null
    )
    or (
      mux_environment_id is not null
      and mux_environment_type is not null
      and
      mux_environment_id = btrim(mux_environment_id)
      and char_length(mux_environment_id) between 1 and 200
      and mux_environment_type in ('development', 'production')
    )
  ) not valid,
  add constraint lesson_videos_mux_references_require_environment_check
  check (
    (
      mux_asset_id is null
      and mux_playback_id is null
    )
    or (
      mux_environment_id is not null
      and mux_environment_type is not null
    )
  ) not valid;

do $$
begin
  if not exists (
    select 1
    from public.lesson_videos
    where not (
      (
        mux_environment_id is null
        and mux_environment_type is null
      )
      or (
        mux_environment_id is not null
        and mux_environment_type is not null
        and
        mux_environment_id = btrim(mux_environment_id)
        and char_length(mux_environment_id) between 1 and 200
        and mux_environment_type in ('development', 'production')
      )
    )
  ) then
    alter table public.lesson_videos
      validate constraint lesson_videos_mux_environment_pair_check;
  end if;

  if not exists (
    select 1
    from public.lesson_videos
    where (mux_asset_id is not null or mux_playback_id is not null)
      and (
        mux_environment_id is null
        or mux_environment_type is null
      )
  ) then
    alter table public.lesson_videos
      validate constraint lesson_videos_mux_references_require_environment_check;
  end if;
end;
$$;

grant select (
  mux_environment_id,
  mux_environment_type
)
on table public.lesson_videos
to service_role;

grant update (
  mux_environment_id,
  mux_environment_type
)
on table public.lesson_videos
to service_role;

commit;
