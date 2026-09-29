begin;

create or replace function public.writer_assisted_import_qa_budget_status(
  p_user_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'operation_id',grant_row.operation_id,
    'source_hash',grant_row.source_hash,
    'budget_microusd',grant_row.budget_microusd,
    'status',grant_row.status,
    'expires_at',grant_row.expires_at,
    'consumed_at',grant_row.consumed_at,
    'revoked_at',grant_row.revoked_at
  ) order by grant_row.created_at desc),'[]'::jsonb)
  from private.writer_assisted_import_budget_grants grant_row
  where grant_row.owner_id=p_user_id
$$;

revoke all on function public.writer_assisted_import_qa_budget_status(uuid)
  from public,anon,authenticated;
grant execute on function public.writer_assisted_import_qa_budget_status(uuid)
  to service_role;

commit;
