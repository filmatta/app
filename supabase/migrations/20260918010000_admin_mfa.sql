begin;

-- Existing admin policies, RPCs and course-cover policies inherit this gate.
-- Ordinary published/owner policies remain unchanged.
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select auth.jwt()->>'aal') = 'aal2', false)
    and exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated, service_role;

commit;
