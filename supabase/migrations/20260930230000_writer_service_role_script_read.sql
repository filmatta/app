begin;

-- Writer's server-side analysis services validate ownership and the saved
-- canonical document before writing analysis state with the service client.
-- Keep this capability read-only: all script mutations remain behind the
-- existing Writer RPC boundary.
grant select on public.writer_scripts to service_role;

commit;
