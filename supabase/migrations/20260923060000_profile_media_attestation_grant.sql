-- The infrastructure role updates attested image metadata through PostgREST.
-- This pure validator reads no tables and grants no profile/private-data access.
begin;
grant execute on function private.profile_crop_valid(jsonb) to service_role;
commit;
