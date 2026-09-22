-- Configured preferences are professional public information on published profiles.
-- Keep historical consent data and owner-only writes; drafts remain private.
begin;
create or replace function public.get_public_project_preferences(p_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select s.project_preferences from public.profile_private_settings s
  join public.professional_profiles p on p.user_id=s.owner_id
  where p.slug=p_slug and p.is_public;
$$;
revoke all on function public.get_public_project_preferences(text) from public;
grant execute on function public.get_public_project_preferences(text) to anon,authenticated;
commit;
