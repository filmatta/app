begin;

-- PostgreSQL checks EXECUTE while evaluating a user-written CHECK constraint.
-- This function is immutable and only validates the JSON values supplied by
-- the caller; it reads no tables and returns no private data.
grant execute on function private.location_attendee_pricing_valid(jsonb,text,jsonb)
  to authenticated, service_role;

commit;
