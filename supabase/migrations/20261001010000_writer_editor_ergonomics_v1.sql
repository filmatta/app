begin;

create table public.writer_checkpoints (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  kind text not null check (kind in ('manual','before_auto_format','before_replace_all','before_restore')),
  label text not null check (char_length(label) between 1 and 120),
  title text not null check (char_length(title) between 1 and 160),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  schema_version integer not null check (schema_version > 0),
  source_revision bigint not null check (source_revision > 0),
  created_at timestamptz not null default now()
);

create index writer_checkpoints_script_created_idx
  on public.writer_checkpoints(owner_id, script_id, created_at desc);

alter table public.writer_checkpoints enable row level security;
revoke all on public.writer_checkpoints from public, anon, authenticated;
grant select, insert, delete on public.writer_checkpoints to authenticated;

create policy writer_checkpoints_owner_read
  on public.writer_checkpoints for select to authenticated
  using (owner_id = (select auth.uid()));

create policy writer_checkpoints_owner_insert
  on public.writer_checkpoints for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.writer_scripts script
      where script.id = script_id and script.owner_id = (select auth.uid())
    )
  );

create policy writer_checkpoints_owner_delete
  on public.writer_checkpoints for delete to authenticated
  using (owner_id = (select auth.uid()));

create table public.writer_smart_tool_operations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  tool text not null check (tool in ('smart_search','ideas')),
  scope text not null check (scope in ('scene','document')),
  model text not null,
  status text not null check (status in ('processing','completed','failed','uncertain')),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  chunks integer not null default 0 check (chunks between 0 and 64),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  actual_cost_microusd bigint not null default 0 check (actual_cost_microusd >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index writer_smart_tool_operations_owner_created_idx
  on public.writer_smart_tool_operations(owner_id, created_at desc);

alter table public.writer_smart_tool_operations enable row level security;
revoke all on public.writer_smart_tool_operations from public, anon, authenticated;
grant select on public.writer_smart_tool_operations to authenticated;
grant select, insert, update on public.writer_smart_tool_operations to service_role;

create policy writer_smart_tool_operations_owner_read
  on public.writer_smart_tool_operations for select to authenticated
  using (owner_id = (select auth.uid()));

insert into public.plan_entitlements(
  plan_code, entitlement_key, access_value, allowance_value, allowance_unit, unlimited, fair_use
) values ('free','writer.ideas',true,null,null,false,false)
on conflict(plan_code,entitlement_key) do nothing;

commit;
