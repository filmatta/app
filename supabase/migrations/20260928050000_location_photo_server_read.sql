begin;

-- Server-only image authorization resolves the photo and its parent location
-- before issuing a short signed URL. No browser key receives these grants.
grant select on public.location_photos to service_role;
grant select on public.locations to service_role;

commit;
