begin;

-- Supabase default privileges may add table capabilities that these Writer
-- surfaces do not need. Keep the service boundary explicit and minimal.
revoke all on public.writer_checkpoints from service_role;
revoke all on public.writer_smart_tool_operations from service_role;

grant select, insert, update on public.writer_smart_tool_operations to service_role;

commit;
