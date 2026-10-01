begin;

create table public.writer_setup_payoff_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  analysis_version text not null,
  model text not null,
  status text not null check (status in ('analyzing','fresh','error','uncertain')),
  result_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(result_summary)='object'),
  current_operation_id uuid,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(owner_id,script_id,source_hash,analysis_version)
);

create table public.writer_setup_payoff_operations (
  id uuid primary key,
  analysis_id uuid not null references public.writer_setup_payoff_analyses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  analysis_version text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  model text not null,
  status text not null check (status in ('reserved','processing','completed','failed','uncertain')),
  reserved_cost_microusd bigint not null check (reserved_cost_microusd between 0 and 3000000),
  actual_cost_microusd bigint not null default 0 check (actual_cost_microusd between 0 and 3000000),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz
);

alter table public.writer_setup_payoff_analyses
  add constraint writer_setup_payoff_current_operation_fk
  foreign key(current_operation_id) references public.writer_setup_payoff_operations(id)
  deferrable initially deferred;

create table public.writer_narrative_elements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  scene_id uuid not null,
  block_id uuid,
  element_type text not null check (element_type in ('setup','payoff')),
  category text check (category is null or char_length(category) between 1 and 64),
  label text not null check (char_length(label) between 1 and 160),
  excerpt text not null check (char_length(excerpt) between 1 and 360),
  explanation text check (explanation is null or char_length(explanation) <= 400),
  status text not null check (status in ('suggested','confirmed','dismissed','unresolved','orphan','needs_review')),
  source text not null check (source in ('ai','user')),
  source_hash text check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
  fingerprint text not null check (char_length(fingerprint) between 1 and 160),
  analysis_version text,
  confidence text check (confidence is null or confidence in ('high','medium','low')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(owner_id,script_id,fingerprint)
);

create table public.writer_narrative_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  setup_element_id uuid not null references public.writer_narrative_elements(id) on delete cascade,
  payoff_element_id uuid not null references public.writer_narrative_elements(id) on delete cascade,
  status text not null check (status in ('suggested','confirmed','dismissed','needs_review')),
  source text not null check (source in ('ai','user')),
  fingerprint text not null check (char_length(fingerprint) between 1 and 160),
  explanation text check (explanation is null or char_length(explanation) <= 400),
  confidence text check (confidence is null or confidence in ('high','medium','low')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (setup_element_id <> payoff_element_id),
  unique(owner_id,script_id,fingerprint)
);

create index writer_setup_payoff_analysis_script_idx on public.writer_setup_payoff_analyses(owner_id,script_id,updated_at desc);
create index writer_setup_payoff_operations_owner_idx on public.writer_setup_payoff_operations(owner_id,created_at desc);
create index writer_narrative_elements_script_idx on public.writer_narrative_elements(owner_id,script_id,scene_id,updated_at desc);
create index writer_narrative_links_script_idx on public.writer_narrative_links(owner_id,script_id,updated_at desc);

alter table public.writer_setup_payoff_analyses enable row level security;
alter table public.writer_setup_payoff_operations enable row level security;
alter table public.writer_narrative_elements enable row level security;
alter table public.writer_narrative_links enable row level security;

revoke all on public.writer_setup_payoff_analyses, public.writer_setup_payoff_operations,
  public.writer_narrative_elements, public.writer_narrative_links from public,anon,authenticated;
grant select on public.writer_setup_payoff_analyses, public.writer_narrative_elements,
  public.writer_narrative_links to authenticated;
grant all on public.writer_setup_payoff_analyses, public.writer_setup_payoff_operations,
  public.writer_narrative_elements, public.writer_narrative_links to service_role;

create policy writer_setup_payoff_analysis_owner_read on public.writer_setup_payoff_analyses
  for select to authenticated using(owner_id=(select auth.uid()));
create policy writer_narrative_elements_owner_read on public.writer_narrative_elements
  for select to authenticated using(owner_id=(select auth.uid()));
create policy writer_narrative_links_owner_read on public.writer_narrative_links
  for select to authenticated using(owner_id=(select auth.uid()));

create or replace function public.writer_reserve_setup_payoff_analysis(
  p_user_id uuid,p_operation_id uuid,p_script_id uuid,p_source_hash text,
  p_analysis_version text,p_model text,p_request_hash text,p_max_cost_microusd bigint,p_global_budget_microusd bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare cached public.writer_setup_payoff_analyses%rowtype; analysis_id uuid; spent bigint; held bigint;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_SETUP_PAYOFF_FORBIDDEN' using errcode='42501'; end if;
  if p_user_id is null or p_operation_id is null or p_script_id is null
    or p_source_hash !~ '^[0-9a-f]{64}$' or p_request_hash !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(p_analysis_version,'')) not between 1 and 80 or p_model <> 'gpt-5.6-terra'
    or p_max_cost_microusd not between 1 and 3000000
    or p_global_budget_microusd not between p_max_cost_microusd and 20000000 then
    raise exception 'WRITER_SETUP_PAYOFF_INVALID' using errcode='22023';
  end if;
  if not exists(select 1 from public.writer_scripts where id=p_script_id and owner_id=p_user_id) then
    raise exception 'WRITER_SETUP_PAYOFF_NOT_FOUND' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_script_id::text||p_source_hash||p_analysis_version,9271));
  select * into cached from public.writer_setup_payoff_analyses where owner_id=p_user_id and script_id=p_script_id
    and source_hash=p_source_hash and analysis_version=p_analysis_version;
  if found and cached.status='fresh' then return jsonb_build_object('status','fresh','cached',true,'analysis_id',cached.id); end if;
  if found and cached.status in ('analyzing','uncertain') then
    return jsonb_build_object('status',cached.status,'cached',false,'analysis_id',cached.id,'operation_id',cached.current_operation_id);
  end if;
  select coalesce(sum(actual_cost_microusd),0) into spent from (
    select actual_cost_microusd from public.writer_setup_payoff_operations
    union all select actual_cost_microusd from public.writer_scene_analysis_operations
  ) costs;
  select coalesce(sum(reserved_cost_microusd),0) into held from (
    select reserved_cost_microusd from public.writer_setup_payoff_operations where status in ('reserved','processing','uncertain')
    union all select reserved_cost_microusd from public.writer_scene_analysis_operations where status in ('reserved','processing','uncertain')
  ) reservations;
  if spent+held+p_max_cost_microusd > p_global_budget_microusd then raise exception 'WRITER_SETUP_PAYOFF_GLOBAL_BUDGET' using errcode='P0001'; end if;
  if cached.id is not null then
    update public.writer_setup_payoff_analyses set status='analyzing',model=p_model,current_operation_id=p_operation_id,error_code=null,updated_at=clock_timestamp()
      where id=cached.id returning id into analysis_id;
  else
    insert into public.writer_setup_payoff_analyses(owner_id,script_id,source_hash,analysis_version,model,status,current_operation_id)
      values(p_user_id,p_script_id,p_source_hash,p_analysis_version,p_model,'analyzing',p_operation_id) returning id into analysis_id;
  end if;
  insert into public.writer_setup_payoff_operations(id,analysis_id,owner_id,script_id,source_hash,analysis_version,request_hash,model,status,reserved_cost_microusd)
    values(p_operation_id,analysis_id,p_user_id,p_script_id,p_source_hash,p_analysis_version,p_request_hash,p_model,'reserved',p_max_cost_microusd);
  return jsonb_build_object('status','reserved','cached',false,'analysis_id',analysis_id,'operation_id',p_operation_id);
end$$;

create or replace function public.writer_settle_setup_payoff_analysis(
  p_user_id uuid,p_operation_id uuid,p_status text,p_summary jsonb,p_error_code text,
  p_input_tokens bigint,p_cached_input_tokens bigint,p_output_tokens bigint,p_reasoning_tokens bigint,
  p_actual_cost_microusd bigint,p_latency_ms integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.writer_setup_payoff_operations%rowtype; next_status text;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_SETUP_PAYOFF_FORBIDDEN' using errcode='42501'; end if;
  select * into op from public.writer_setup_payoff_operations where id=p_operation_id and owner_id=p_user_id for update;
  if not found then raise exception 'WRITER_SETUP_PAYOFF_OPERATION_NOT_FOUND' using errcode='P0001'; end if;
  if op.status in ('completed','failed','uncertain') then return jsonb_build_object('status',op.status,'reused',true); end if;
  if p_status not in ('completed','failed','uncertain') or p_actual_cost_microusd < 0 or p_actual_cost_microusd > op.reserved_cost_microusd
    or p_summary is null or jsonb_typeof(p_summary)<>'object' then raise exception 'WRITER_SETUP_PAYOFF_INVALID' using errcode='22023'; end if;
  next_status:=case p_status when 'completed' then 'fresh' when 'uncertain' then 'uncertain' else 'error' end;
  update public.writer_setup_payoff_operations set status=case when p_status='completed' then 'completed' else p_status end,
    actual_cost_microusd=p_actual_cost_microusd,input_tokens=greatest(0,p_input_tokens),cached_input_tokens=greatest(0,p_cached_input_tokens),
    output_tokens=greatest(0,p_output_tokens),reasoning_tokens=greatest(0,p_reasoning_tokens),latency_ms=greatest(0,p_latency_ms),
    error_code=left(p_error_code,80),updated_at=clock_timestamp(),settled_at=clock_timestamp() where id=p_operation_id;
  update public.writer_setup_payoff_analyses set status=next_status,
    result_summary=case when p_status='completed' then p_summary else result_summary end,
    error_code=case when p_status='completed' then null else left(p_error_code,80) end,updated_at=clock_timestamp()
    where id=op.analysis_id and current_operation_id=p_operation_id;
  return jsonb_build_object('status',next_status,'reused',false);
end$$;

create or replace function public.writer_set_narrative_element_status(
  p_user_id uuid,p_script_id uuid,p_element_id uuid,p_status text
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_SETUP_PAYOFF_FORBIDDEN' using errcode='42501'; end if;
  if p_status not in ('confirmed','dismissed','needs_review') or not exists(
    select 1 from public.writer_scripts where id=p_script_id and owner_id=p_user_id
  ) then raise exception 'WRITER_SETUP_PAYOFF_INVALID' using errcode='22023'; end if;
  update public.writer_narrative_elements set status=p_status,updated_at=clock_timestamp()
    where id=p_element_id and owner_id=p_user_id and script_id=p_script_id;
  if not found then raise exception 'WRITER_SETUP_PAYOFF_NOT_FOUND' using errcode='P0001'; end if;
  return true;
end$$;

create or replace function public.writer_set_narrative_link_status(
  p_user_id uuid,p_script_id uuid,p_link_id uuid,p_status text
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_SETUP_PAYOFF_FORBIDDEN' using errcode='42501'; end if;
  if p_status not in ('confirmed','dismissed','needs_review') then raise exception 'WRITER_SETUP_PAYOFF_INVALID' using errcode='22023'; end if;
  update public.writer_narrative_links set status=p_status,updated_at=clock_timestamp()
    where id=p_link_id and owner_id=p_user_id and script_id=p_script_id;
  if not found then raise exception 'WRITER_SETUP_PAYOFF_NOT_FOUND' using errcode='P0001'; end if;
  if p_status='confirmed' then
    update public.writer_narrative_elements set status='confirmed',updated_at=clock_timestamp()
      where owner_id=p_user_id and script_id=p_script_id and id in (
        select setup_element_id from public.writer_narrative_links where id=p_link_id
        union select payoff_element_id from public.writer_narrative_links where id=p_link_id
      ) and status<>'dismissed';
  end if;
  return true;
end$$;

create or replace function public.writer_create_narrative_element(
  p_user_id uuid,p_script_id uuid,p_scene_id uuid,p_block_id uuid,p_element_type text,p_label text,p_excerpt text
) returns uuid language plpgsql security definer set search_path='' as $$
declare created_id uuid; fingerprint_value text;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_SETUP_PAYOFF_FORBIDDEN' using errcode='42501'; end if;
  if p_element_type not in ('setup','payoff') or char_length(btrim(coalesce(p_label,''))) not between 1 and 160
    or char_length(btrim(coalesce(p_excerpt,''))) not between 1 and 360
    or not exists(select 1 from public.writer_scripts where id=p_script_id and owner_id=p_user_id) then
    raise exception 'WRITER_SETUP_PAYOFF_INVALID' using errcode='22023';
  end if;
  fingerprint_value:='user:'||gen_random_uuid()::text;
  insert into public.writer_narrative_elements(owner_id,script_id,scene_id,block_id,element_type,label,excerpt,status,source,fingerprint)
    values(p_user_id,p_script_id,p_scene_id,p_block_id,p_element_type,btrim(p_label),btrim(p_excerpt),'confirmed','user',fingerprint_value)
    returning id into created_id;
  return created_id;
end$$;

create or replace function public.writer_create_narrative_link(
  p_user_id uuid,p_script_id uuid,p_setup_element_id uuid,p_payoff_element_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare created_id uuid; fingerprint_value text;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_SETUP_PAYOFF_FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from public.writer_scripts where id=p_script_id and owner_id=p_user_id)
    or not exists(select 1 from public.writer_narrative_elements where id=p_setup_element_id and owner_id=p_user_id and script_id=p_script_id and element_type='setup' and status<>'dismissed')
    or not exists(select 1 from public.writer_narrative_elements where id=p_payoff_element_id and owner_id=p_user_id and script_id=p_script_id and element_type='payoff' and status<>'dismissed') then
    raise exception 'WRITER_SETUP_PAYOFF_INVALID' using errcode='22023';
  end if;
  fingerprint_value:='user:'||p_setup_element_id::text||':'||p_payoff_element_id::text;
  insert into public.writer_narrative_links(owner_id,script_id,setup_element_id,payoff_element_id,status,source,fingerprint)
    values(p_user_id,p_script_id,p_setup_element_id,p_payoff_element_id,'confirmed','user',fingerprint_value)
    on conflict(owner_id,script_id,fingerprint) do update set status='confirmed',updated_at=clock_timestamp()
    returning id into created_id;
  update public.writer_narrative_elements set status='confirmed',updated_at=clock_timestamp()
    where id in (p_setup_element_id,p_payoff_element_id) and status<>'dismissed';
  return created_id;
end$$;

revoke all on function public.writer_reserve_setup_payoff_analysis(uuid,uuid,uuid,text,text,text,text,bigint,bigint),
  public.writer_settle_setup_payoff_analysis(uuid,uuid,text,jsonb,text,bigint,bigint,bigint,bigint,bigint,integer),
  public.writer_set_narrative_element_status(uuid,uuid,uuid,text),
  public.writer_set_narrative_link_status(uuid,uuid,uuid,text),
  public.writer_create_narrative_element(uuid,uuid,uuid,uuid,text,text,text),
  public.writer_create_narrative_link(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.writer_reserve_setup_payoff_analysis(uuid,uuid,uuid,text,text,text,text,bigint,bigint),
  public.writer_settle_setup_payoff_analysis(uuid,uuid,text,jsonb,text,bigint,bigint,bigint,bigint,bigint,integer),
  public.writer_set_narrative_element_status(uuid,uuid,uuid,text),
  public.writer_set_narrative_link_status(uuid,uuid,uuid,text),
  public.writer_create_narrative_element(uuid,uuid,uuid,uuid,text,text,text),
  public.writer_create_narrative_link(uuid,uuid,uuid,uuid) to service_role;

insert into public.plan_entitlements(plan_code,entitlement_key,access_value,allowance_value,allowance_unit,unlimited,fair_use)
values('free','writer.setup_payoff',true,null,null,false,false)
on conflict(plan_code,entitlement_key) do nothing;

commit;
