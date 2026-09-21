-- The reel remains the playable asset. Its selected image is projected separately
-- for public presentation and catalog cards without exposing private media rows.
begin;

create or replace function private.profile_visible_presentation(
  p public.professional_profiles
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_set(
    case
      when p.media_initialized then jsonb_set(
        p.presentation,
        '{book}',
        coalesce((
          select jsonb_agg(
            jsonb_build_object('url', m.url, 'caption', m.title)
            order by m.featured desc, m.sort_order, m.id
          )
          from public.profile_media m
          where m.owner_id = p.user_id
            and m.category = 'book'
            and m.source = 'external'
            and m.visibility = 'visible'
            and m.status = 'ready'
        ), '[]'::jsonb)
      )
      else p.presentation
    end,
    '{reel_cover_media_id}',
    coalesce((
      select to_jsonb(cover.id)
      from public.profile_media reel
      join public.profile_media cover
        on cover.id = reel.thumbnail_id
       and cover.owner_id = reel.owner_id
      where reel.owner_id = p.user_id
        and reel.category = 'reel'
        and reel.media_type = 'video'
        and reel.status = 'ready'
        and reel.visibility = 'visible'
        and cover.media_type = 'image'
        and cover.status = 'ready'
        and cover.visibility = 'visible'
      order by reel.featured desc, reel.sort_order, reel.id
      limit 1
    ), 'null'::jsonb)
  );
$$;

revoke all on function private.profile_visible_presentation(public.professional_profiles)
  from public, anon, authenticated;

commit;
