begin;

-- Script Assistant stores only structured scene metadata and provider accounting.
-- It never stores a second screenplay copy or provider prompt.
create table public.writer_scene_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  scene_id uuid not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  analysis_version text not null,
  model text not null,
  status text not null check (status in ('analyzing','fresh','partial','error','uncertain')),
  auto_objective text,
  auto_obstacle text,
  auto_change text,
  analysis_payload jsonb,
  current_operation_id uuid,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(owner_id,script_id,scene_id,source_hash,analysis_version),
  constraint writer_scene_analysis_payload check (analysis_payload is null or jsonb_typeof(analysis_payload)='object')
);

create index writer_scene_analysis_script_scene_idx
  on public.writer_scene_analyses(owner_id,script_id,scene_id,updated_at desc);

create table public.writer_scene_analysis_operations (
  id uuid primary key,
  analysis_id uuid not null references public.writer_scene_analyses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  scene_id uuid not null,
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
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz
);

create index writer_scene_analysis_operations_owner_created_idx
  on public.writer_scene_analysis_operations(owner_id,created_at desc);

alter table public.writer_scene_analyses
  add constraint writer_scene_analysis_current_operation_fk
  foreign key(current_operation_id) references public.writer_scene_analysis_operations(id) deferrable initially deferred;

create table public.writer_scene_analysis_overrides (
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  scene_id uuid not null,
  objective text,
  obstacle text,
  change text,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,script_id,scene_id),
  constraint writer_scene_override_lengths check (
    char_length(coalesce(objective,'')) <= 500 and char_length(coalesce(obstacle,'')) <= 500 and char_length(coalesce(change,'')) <= 500
  )
);

create table public.writer_scene_observation_dismissals (
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  scene_id uuid not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  analysis_version text not null,
  observation_id text not null check (char_length(observation_id) between 1 and 120),
  created_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,script_id,scene_id,source_hash,analysis_version,observation_id)
);

create table public.writer_script_assistant_settings (
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,script_id)
);

alter table public.writer_scene_analyses enable row level security;
alter table public.writer_scene_analysis_operations enable row level security;
alter table public.writer_scene_analysis_overrides enable row level security;
alter table public.writer_scene_observation_dismissals enable row level security;
alter table public.writer_script_assistant_settings enable row level security;

revoke all on public.writer_scene_analyses, public.writer_scene_analysis_operations,
  public.writer_scene_analysis_overrides, public.writer_scene_observation_dismissals,
  public.writer_script_assistant_settings from public,anon,authenticated;
grant select on public.writer_scene_analyses, public.writer_scene_analysis_overrides,
  public.writer_scene_observation_dismissals, public.writer_script_assistant_settings to authenticated;

create policy writer_scene_analyses_owner_read on public.writer_scene_analyses
  for select to authenticated using(owner_id=(select auth.uid()));
create policy writer_scene_analysis_overrides_owner_read on public.writer_scene_analysis_overrides
  for select to authenticated using(owner_id=(select auth.uid()));
create policy writer_scene_dismissals_owner_read on public.writer_scene_observation_dismissals
  for select to authenticated using(owner_id=(select auth.uid()));
create policy writer_script_assistant_settings_owner_read on public.writer_script_assistant_settings
  for select to authenticated using(owner_id=(select auth.uid()));

create or replace function public.writer_reserve_scene_analysis(
  p_user_id uuid,p_operation_id uuid,p_script_id uuid,p_scene_id uuid,p_source_hash text,
  p_analysis_version text,p_model text,p_request_hash text,p_max_cost_microusd bigint,p_global_budget_microusd bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  cached public.writer_scene_analyses%rowtype;
  analysis_id uuid;
  has_cached boolean := false;
  spent bigint;
  held bigint;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_ASSISTANT_FORBIDDEN' using errcode='42501'; end if;
  if p_user_id is null or p_operation_id is null or p_script_id is null or p_scene_id is null
    or p_source_hash !~ '^[0-9a-f]{64}$' or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_analysis_version is null or char_length(p_analysis_version) not between 1 and 80
    or p_model <> 'gpt-5.6-terra' or p_max_cost_microusd not between 1 and 3000000
    or p_global_budget_microusd not between p_max_cost_microusd and 10000000 then
    raise exception 'WRITER_ASSISTANT_INVALID' using errcode='22023';
  end if;
  if not exists(select 1 from public.writer_scripts where id=p_script_id and owner_id=p_user_id) then
    raise exception 'WRITER_ASSISTANT_NOT_FOUND' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_script_id::text||p_scene_id::text||p_source_hash||p_analysis_version,9187));
  select * into cached from public.writer_scene_analyses where owner_id=p_user_id and script_id=p_script_id
    and scene_id=p_scene_id and source_hash=p_source_hash and analysis_version=p_analysis_version;
  has_cached := found;
  if found and cached.status='fresh' then
    return jsonb_build_object('status','fresh','cached',true,'analysis_id',cached.id);
  end if;
  if found and cached.status in ('analyzing','uncertain') then
    return jsonb_build_object('status',cached.status,'cached',false,'analysis_id',cached.id,'operation_id',cached.current_operation_id);
  end if;
  select coalesce(sum(actual_cost_microusd),0) into spent from public.writer_scene_analysis_operations;
  select coalesce(sum(reserved_cost_microusd),0) into held from public.writer_scene_analysis_operations where status in ('reserved','processing','uncertain');
  if spent+held+p_max_cost_microusd > p_global_budget_microusd then raise exception 'WRITER_ASSISTANT_GLOBAL_BUDGET' using errcode='P0001'; end if;
  if has_cached then
    update public.writer_scene_analyses set status='analyzing',model=p_model,current_operation_id=p_operation_id,error_code=null,updated_at=clock_timestamp()
      where id=cached.id returning id into analysis_id;
  else
    insert into public.writer_scene_analyses(owner_id,script_id,scene_id,source_hash,analysis_version,model,status,current_operation_id)
      values(p_user_id,p_script_id,p_scene_id,p_source_hash,p_analysis_version,p_model,'analyzing',p_operation_id)
      returning id into analysis_id;
  end if;
  insert into public.writer_scene_analysis_operations(id,analysis_id,owner_id,script_id,scene_id,source_hash,analysis_version,request_hash,model,status,reserved_cost_microusd)
    values(p_operation_id,analysis_id,p_user_id,p_script_id,p_scene_id,p_source_hash,p_analysis_version,p_request_hash,p_model,'reserved',p_max_cost_microusd);
  return jsonb_build_object('status','reserved','cached',false,'analysis_id',analysis_id,'operation_id',p_operation_id);
end$$;

create or replace function public.writer_settle_scene_analysis(
  p_user_id uuid,p_operation_id uuid,p_status text,p_payload jsonb,p_error_code text,
  p_input_tokens bigint,p_cached_input_tokens bigint,p_output_tokens bigint,p_reasoning_tokens bigint,p_actual_cost_microusd bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.writer_scene_analysis_operations%rowtype; next_status text;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_ASSISTANT_FORBIDDEN' using errcode='42501'; end if;
  select * into op from public.writer_scene_analysis_operations where id=p_operation_id and owner_id=p_user_id for update;
  if not found then raise exception 'WRITER_ASSISTANT_OPERATION_NOT_FOUND' using errcode='P0001'; end if;
  if op.status in ('completed','failed','uncertain') then return jsonb_build_object('status',op.status,'reused',true); end if;
  if p_status not in ('completed','partial','failed','uncertain') or p_actual_cost_microusd < 0 or p_actual_cost_microusd > op.reserved_cost_microusd then
    raise exception 'WRITER_ASSISTANT_INVALID' using errcode='22023';
  end if;
  next_status:=case p_status when 'completed' then 'fresh' when 'partial' then 'partial' when 'uncertain' then 'uncertain' else 'error' end;
  update public.writer_scene_analysis_operations set status=case p_status when 'completed' then 'completed' when 'partial' then 'completed' else p_status end,
    actual_cost_microusd=p_actual_cost_microusd,input_tokens=greatest(0,p_input_tokens),cached_input_tokens=greatest(0,p_cached_input_tokens),
    output_tokens=greatest(0,p_output_tokens),reasoning_tokens=greatest(0,p_reasoning_tokens),error_code=left(p_error_code,80),updated_at=clock_timestamp(),settled_at=clock_timestamp()
    where id=p_operation_id;
  update public.writer_scene_analyses set status=next_status,analysis_payload=case when p_status in ('completed','partial') then p_payload else analysis_payload end,
    auto_objective=case when p_status in ('completed','partial') then p_payload#>>'{objective,value}' else auto_objective end,
    auto_obstacle=case when p_status in ('completed','partial') then p_payload#>>'{obstacle,value}' else auto_obstacle end,
    auto_change=case when p_status in ('completed','partial') then p_payload#>>'{change,value}' else auto_change end,
    error_code=case when p_status in ('completed','partial') then null else left(p_error_code,80) end,updated_at=clock_timestamp()
    where id=op.analysis_id and current_operation_id=p_operation_id;
  return jsonb_build_object('status',next_status,'reused',false);
end$$;

create or replace function public.writer_save_scene_analysis_override(
  p_user_id uuid,p_script_id uuid,p_scene_id uuid,p_field text,p_value text
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_ASSISTANT_FORBIDDEN' using errcode='42501'; end if;
  if p_field not in ('objective','obstacle','change') or char_length(coalesce(p_value,''))>500
    or not exists(select 1 from public.writer_scripts where id=p_script_id and owner_id=p_user_id) then
    raise exception 'WRITER_ASSISTANT_INVALID' using errcode='22023';
  end if;
  insert into public.writer_scene_analysis_overrides(owner_id,script_id,scene_id,objective,obstacle,change)
    values(p_user_id,p_script_id,p_scene_id,case when p_field='objective' then nullif(btrim(p_value),'') end,
      case when p_field='obstacle' then nullif(btrim(p_value),'') end,case when p_field='change' then nullif(btrim(p_value),'') end)
    on conflict(owner_id,script_id,scene_id) do update set
      objective=case when p_field='objective' then nullif(btrim(p_value),'') else writer_scene_analysis_overrides.objective end,
      obstacle=case when p_field='obstacle' then nullif(btrim(p_value),'') else writer_scene_analysis_overrides.obstacle end,
      change=case when p_field='change' then nullif(btrim(p_value),'') else writer_scene_analysis_overrides.change end,updated_at=clock_timestamp();
  return true;
end$$;

create or replace function public.writer_set_scene_observation_dismissed(
  p_user_id uuid,p_script_id uuid,p_scene_id uuid,p_source_hash text,p_analysis_version text,p_observation_id text,p_dismissed boolean
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_ASSISTANT_FORBIDDEN' using errcode='42501'; end if;
  if p_source_hash !~ '^[0-9a-f]{64}$' or char_length(p_observation_id) not between 1 and 120
    or not exists(select 1 from public.writer_scripts where id=p_script_id and owner_id=p_user_id) then
    raise exception 'WRITER_ASSISTANT_INVALID' using errcode='22023';
  end if;
  if p_dismissed then
    insert into public.writer_scene_observation_dismissals(owner_id,script_id,scene_id,source_hash,analysis_version,observation_id)
      values(p_user_id,p_script_id,p_scene_id,p_source_hash,p_analysis_version,p_observation_id) on conflict do nothing;
  else
    delete from public.writer_scene_observation_dismissals where owner_id=p_user_id and script_id=p_script_id and scene_id=p_scene_id
      and source_hash=p_source_hash and analysis_version=p_analysis_version and observation_id=p_observation_id;
  end if;
  return true;
end$$;

create or replace function public.writer_set_script_assistant_enabled(p_user_id uuid,p_script_id uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_ASSISTANT_FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from public.writer_scripts where id=p_script_id and owner_id=p_user_id) then raise exception 'WRITER_ASSISTANT_NOT_FOUND'; end if;
  insert into public.writer_script_assistant_settings(owner_id,script_id,enabled) values(p_user_id,p_script_id,p_enabled)
    on conflict(owner_id,script_id) do update set enabled=excluded.enabled,updated_at=clock_timestamp();
  return true;
end$$;

revoke all on function public.writer_reserve_scene_analysis(uuid,uuid,uuid,uuid,text,text,text,text,bigint,bigint),
  public.writer_settle_scene_analysis(uuid,uuid,text,jsonb,text,bigint,bigint,bigint,bigint,bigint),
  public.writer_save_scene_analysis_override(uuid,uuid,uuid,text,text),
  public.writer_set_scene_observation_dismissed(uuid,uuid,uuid,text,text,text,boolean),
  public.writer_set_script_assistant_enabled(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.writer_reserve_scene_analysis(uuid,uuid,uuid,uuid,text,text,text,text,bigint,bigint),
  public.writer_settle_scene_analysis(uuid,uuid,text,jsonb,text,bigint,bigint,bigint,bigint,bigint),
  public.writer_save_scene_analysis_override(uuid,uuid,uuid,text,text),
  public.writer_set_scene_observation_dismissed(uuid,uuid,uuid,text,text,text,boolean),
  public.writer_set_script_assistant_enabled(uuid,uuid,boolean) to service_role;

commit;
