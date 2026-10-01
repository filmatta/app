begin;

create table public.writer_narrative_pulse_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  analysis_version text not null,
  model text not null,
  status text not null check (status in ('analyzing','fresh','error','uncertain')),
  current_operation_id uuid,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(owner_id,script_id,source_hash,analysis_version)
);

create table public.writer_narrative_pulse_operations (
  id uuid primary key,
  analysis_id uuid not null references public.writer_narrative_pulse_analyses(id) on delete cascade,
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

alter table public.writer_narrative_pulse_analyses add constraint writer_pulse_current_operation_fk
  foreign key(current_operation_id) references public.writer_narrative_pulse_operations(id) deferrable initially deferred;

create table public.writer_narrative_pulse_points (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.writer_narrative_pulse_analyses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  scene_id uuid not null,
  intensity smallint not null check (intensity between 0 and 100),
  signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals)='array'),
  note text not null check (char_length(note) between 1 and 360),
  unique(analysis_id,scene_id)
);

create table public.writer_narrative_pulse_zones (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.writer_narrative_pulse_analyses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  start_scene_id uuid not null,
  end_scene_id uuid not null,
  zone_type text not null check (zone_type in ('stable','build','release','peak')),
  note text not null check (char_length(note) between 1 and 360)
);

create table public.writer_narrative_pulse_milestones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  scene_id uuid not null,
  milestone_type text not null check (milestone_type in ('inciting_incident','first_turning_point','midpoint','crisis','climax','resolution','custom')),
  label text not null check (char_length(label) between 1 and 100),
  explanation text check (explanation is null or char_length(explanation) <= 360),
  status text not null check (status in ('suggested','confirmed','manual','dismissed','needs_review')),
  source text not null check (source in ('ai','user')),
  source_hash text check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
  fingerprint text not null check (char_length(fingerprint) between 1 and 180),
  moved_by_user boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(owner_id,script_id,fingerprint)
);

create index writer_pulse_analysis_script_idx on public.writer_narrative_pulse_analyses(owner_id,script_id,updated_at desc);
create index writer_pulse_operation_owner_idx on public.writer_narrative_pulse_operations(owner_id,created_at desc);
create index writer_pulse_points_scene_idx on public.writer_narrative_pulse_points(owner_id,script_id,scene_id);
create index writer_pulse_milestones_scene_idx on public.writer_narrative_pulse_milestones(owner_id,script_id,scene_id,updated_at desc);

alter table public.writer_narrative_pulse_analyses enable row level security;
alter table public.writer_narrative_pulse_operations enable row level security;
alter table public.writer_narrative_pulse_points enable row level security;
alter table public.writer_narrative_pulse_zones enable row level security;
alter table public.writer_narrative_pulse_milestones enable row level security;

revoke all on public.writer_narrative_pulse_analyses, public.writer_narrative_pulse_operations,
  public.writer_narrative_pulse_points, public.writer_narrative_pulse_zones, public.writer_narrative_pulse_milestones
  from public,anon,authenticated;
grant select on public.writer_narrative_pulse_analyses, public.writer_narrative_pulse_points,
  public.writer_narrative_pulse_zones, public.writer_narrative_pulse_milestones to authenticated;
grant all on public.writer_narrative_pulse_analyses, public.writer_narrative_pulse_operations,
  public.writer_narrative_pulse_points, public.writer_narrative_pulse_zones, public.writer_narrative_pulse_milestones to service_role;

create policy writer_pulse_analysis_owner_read on public.writer_narrative_pulse_analyses for select to authenticated using(owner_id=(select auth.uid()));
create policy writer_pulse_points_owner_read on public.writer_narrative_pulse_points for select to authenticated using(owner_id=(select auth.uid()));
create policy writer_pulse_zones_owner_read on public.writer_narrative_pulse_zones for select to authenticated using(owner_id=(select auth.uid()));
create policy writer_pulse_milestones_owner_read on public.writer_narrative_pulse_milestones for select to authenticated using(owner_id=(select auth.uid()));

create or replace function public.writer_reserve_narrative_pulse(
  p_user_id uuid,p_operation_id uuid,p_script_id uuid,p_source_hash text,p_analysis_version text,p_model text,
  p_request_hash text,p_max_cost_microusd bigint,p_global_budget_microusd bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare cached public.writer_narrative_pulse_analyses%rowtype; analysis_value uuid; spent bigint; held bigint;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_PULSE_FORBIDDEN' using errcode='42501'; end if;
  if exists(select 1 from public.writer_narrative_pulse_operations where id=p_operation_id and owner_id=p_user_id) then
    return jsonb_build_object('status',(select status from public.writer_narrative_pulse_operations where id=p_operation_id),'operationId',p_operation_id);
  end if;
  select * into cached from public.writer_narrative_pulse_analyses where owner_id=p_user_id and script_id=p_script_id and source_hash=p_source_hash and analysis_version=p_analysis_version limit 1;
  if cached.status='fresh' then return jsonb_build_object('status','fresh','analysisId',cached.id); end if;
  if cached.status='analyzing' and cached.updated_at > clock_timestamp()-interval '3 minutes' then return jsonb_build_object('status','analyzing','analysisId',cached.id); end if;
  select coalesce(sum(actual_cost_microusd),0) into spent from public.writer_narrative_pulse_operations;
  select coalesce(sum(reserved_cost_microusd),0) into held from public.writer_narrative_pulse_operations where status in ('reserved','processing','uncertain');
  if spent+held+p_max_cost_microusd > p_global_budget_microusd then raise exception 'WRITER_PULSE_BUDGET' using errcode='P0001'; end if;
  if cached.id is null then
    insert into public.writer_narrative_pulse_analyses(owner_id,script_id,source_hash,analysis_version,model,status)
      values(p_user_id,p_script_id,p_source_hash,p_analysis_version,p_model,'analyzing') returning id into analysis_value;
  else analysis_value:=cached.id; update public.writer_narrative_pulse_analyses set status='analyzing',model=p_model,error_code=null,updated_at=clock_timestamp() where id=analysis_value; end if;
  insert into public.writer_narrative_pulse_operations(id,analysis_id,owner_id,script_id,source_hash,analysis_version,request_hash,model,status,reserved_cost_microusd)
    values(p_operation_id,analysis_value,p_user_id,p_script_id,p_source_hash,p_analysis_version,p_request_hash,p_model,'reserved',p_max_cost_microusd);
  update public.writer_narrative_pulse_analyses set current_operation_id=p_operation_id where id=analysis_value;
  return jsonb_build_object('status','reserved','analysisId',analysis_value,'operationId',p_operation_id);
end; $$;

create or replace function public.writer_settle_narrative_pulse(
  p_user_id uuid,p_operation_id uuid,p_status text,p_error_code text,p_input_tokens bigint,p_cached_input_tokens bigint,
  p_output_tokens bigint,p_reasoning_tokens bigint,p_actual_cost_microusd bigint,p_latency_ms integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.writer_narrative_pulse_operations%rowtype;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_PULSE_FORBIDDEN' using errcode='42501'; end if;
  if p_status not in ('completed','failed','uncertain') then raise exception 'WRITER_PULSE_STATUS'; end if;
  select * into op from public.writer_narrative_pulse_operations where id=p_operation_id and owner_id=p_user_id for update;
  if op.id is null then raise exception 'WRITER_PULSE_OPERATION'; end if;
  if op.status in ('completed','failed') then return jsonb_build_object('status',op.status); end if;
  update public.writer_narrative_pulse_operations set status=p_status,actual_cost_microusd=p_actual_cost_microusd,input_tokens=p_input_tokens,
    cached_input_tokens=p_cached_input_tokens,output_tokens=p_output_tokens,reasoning_tokens=p_reasoning_tokens,latency_ms=p_latency_ms,error_code=p_error_code,
    settled_at=clock_timestamp(),updated_at=clock_timestamp() where id=op.id;
  update public.writer_narrative_pulse_analyses set status=case p_status when 'completed' then 'fresh' when 'uncertain' then 'uncertain' else 'error' end,
    error_code=p_error_code,updated_at=clock_timestamp() where id=op.analysis_id;
  return jsonb_build_object('status',p_status,'analysisId',op.analysis_id);
end; $$;

revoke all on function public.writer_reserve_narrative_pulse(uuid,uuid,uuid,text,text,text,text,bigint,bigint),
  public.writer_settle_narrative_pulse(uuid,uuid,text,text,bigint,bigint,bigint,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.writer_reserve_narrative_pulse(uuid,uuid,uuid,text,text,text,text,bigint,bigint),
  public.writer_settle_narrative_pulse(uuid,uuid,text,text,bigint,bigint,bigint,bigint,bigint,integer) to service_role;

insert into public.plan_entitlements(plan_code,entitlement_key,access_value,allowance_value,allowance_unit,unlimited,fair_use)
values('free','writer.narrative_pulse',true,null,null,false,false) on conflict(plan_code,entitlement_key) do nothing;

commit;
