-- FILMATTA Sandbox: Project-owned conversations, decisions, quota and guide history.
begin;

create table public.sandbox_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  mode text not null default 'divergence' check (mode in ('divergence', 'convergence')),
  memory_summary text not null default '' check (char_length(memory_summary) <= 2400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id, project_id),
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade
);
create unique index sandbox_one_active_session_per_project on public.sandbox_sessions(owner_id, project_id) where status = 'active';
create index sandbox_sessions_owner_recent on public.sandbox_sessions(owner_id, updated_at desc);

-- An explicitly requested, bounded narrative summary of one Writer revision.
-- No screenplay text or provider prompt is stored in this table.
create table public.sandbox_writer_contexts (
  project_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  writer_id uuid not null,
  writer_revision bigint not null check (writer_revision > 0),
  summary jsonb not null check (jsonb_typeof(summary) = 'object' and octet_length(summary::text) <= 4000),
  source_kind text not null default 'writer_opt_in' check (source_kind = 'writer_opt_in'),
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12,6),
  provider_request_id text,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade,
  foreign key (writer_id, owner_id, project_id) references public.writer_scripts(id, owner_id, project_id) on delete cascade
);

create table public.sandbox_entitlements (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  sandbox_plan text not null default 'free' check (sandbox_plan in ('free', 'unlocked')),
  paid_monthly_limit integer check (paid_monthly_limit between 1 and 100000),
  usage_reset_at timestamptz,
  updated_at timestamptz not null default now()
);
create table private.sandbox_limits (
  id boolean primary key default true check (id),
  free_response_limit integer not null default 3 check (free_response_limit between 0 and 1000),
  paid_monthly_limit integer not null default 100 check (paid_monthly_limit between 1 and 100000)
);
insert into private.sandbox_limits(id, free_response_limit, paid_monthly_limit) values (true, 3, 100);
revoke all on private.sandbox_limits from public, anon, authenticated;

create table public.sandbox_turns (
  id uuid primary key,
  session_id uuid not null,
  project_id uuid not null,
  owner_id uuid not null,
  mode text not null check (mode in ('divergence', 'convergence')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  response jsonb,
  error_code text,
  provider_request_id text,
  retry_count integer not null default 0 check (retry_count >= 0),
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  estimated_cost_usd numeric(12,6),
  quota_consumed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, session_id, owner_id),
  unique (id, owner_id, project_id),
  foreign key (session_id, owner_id, project_id) references public.sandbox_sessions(id, owner_id, project_id) on delete cascade,
  check (response is null or jsonb_typeof(response) = 'object')
);
create index sandbox_turns_owner_quota on public.sandbox_turns(owner_id, status, created_at);
create index sandbox_turns_session_order on public.sandbox_turns(session_id, created_at, id);

create table public.sandbox_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  turn_id uuid not null,
  owner_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(btrim(content)) between 1 and 5000),
  created_at timestamptz not null default now(),
  unique (turn_id, role),
  foreign key (turn_id, session_id, owner_id) references public.sandbox_turns(id, session_id, owner_id) on delete cascade
);
create index sandbox_messages_session_order on public.sandbox_messages(session_id, created_at, id);

alter table public.create_ideation_possibilities drop constraint create_ideation_possibilities_state_check;
alter table public.create_ideation_possibilities add constraint create_ideation_possibilities_state_check
  check (state in ('proposed', 'maybe', 'canon', 'discarded'));
alter table public.create_ideation_possibilities
  add column title text check (title is null or char_length(title) <= 160),
  add column source_turn_id uuid,
  add column source_ordinal smallint check (source_ordinal between 1 and 5),
  add column conflicts_with_id uuid,
  add constraint create_ideation_possibilities_id_owner_project_unique unique(id, owner_id, project_id),
  add constraint create_ideation_possibilities_turn_fk foreign key (source_turn_id, owner_id, project_id)
    references public.sandbox_turns(id, owner_id, project_id) on delete set null (source_turn_id),
  add constraint create_ideation_possibilities_conflict_fk foreign key (conflicts_with_id, owner_id, project_id)
    references public.create_ideation_possibilities(id, owner_id, project_id) on delete set null (conflicts_with_id);
create unique index sandbox_possibility_source_once on public.create_ideation_possibilities(source_turn_id, source_ordinal)
  where source_turn_id is not null;
-- State transitions go through the owner-bound RPC so conflicts and decision events cannot be skipped.
revoke insert, update on public.create_ideation_possibilities from authenticated;

create table public.sandbox_decision_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  possibility_id uuid not null,
  prior_state text,
  next_state text not null,
  resolution text,
  created_at timestamptz not null default now(),
  foreign key (possibility_id, owner_id, project_id)
    references public.create_ideation_possibilities(id, owner_id, project_id) on delete cascade
);
create index sandbox_decisions_project_recent on public.sandbox_decision_events(project_id, created_at desc);

create table public.sandbox_guide_versions (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  guide_id uuid not null references public.create_ideation_guides(id) on delete cascade,
  writer_id uuid references public.writer_scripts(id) on delete set null,
  prior_context jsonb,
  prior_synthesis jsonb,
  applied_context jsonb not null,
  applied_synthesis jsonb not null,
  selected_possibility_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade
);
create index sandbox_guide_versions_project_recent on public.sandbox_guide_versions(project_id, created_at desc);

alter table public.sandbox_sessions enable row level security;
alter table public.sandbox_writer_contexts enable row level security;
alter table public.sandbox_entitlements enable row level security;
alter table public.sandbox_turns enable row level security;
alter table public.sandbox_messages enable row level security;
alter table public.sandbox_decision_events enable row level security;
alter table public.sandbox_guide_versions enable row level security;
revoke all on public.sandbox_sessions, public.sandbox_writer_contexts, public.sandbox_entitlements, public.sandbox_turns,
  public.sandbox_messages, public.sandbox_decision_events, public.sandbox_guide_versions
  from public, anon, authenticated;
grant select on public.sandbox_sessions, public.sandbox_writer_contexts, public.sandbox_entitlements, public.sandbox_turns,
  public.sandbox_messages, public.sandbox_decision_events, public.sandbox_guide_versions to authenticated;
create policy sandbox_sessions_owner_read on public.sandbox_sessions for select to authenticated using (owner_id = (select auth.uid()));
create policy sandbox_writer_contexts_owner_read on public.sandbox_writer_contexts for select to authenticated using (owner_id = (select auth.uid()));
create policy sandbox_entitlements_owner_read on public.sandbox_entitlements for select to authenticated using (owner_id = (select auth.uid()));
create policy sandbox_turns_owner_read on public.sandbox_turns for select to authenticated using (owner_id = (select auth.uid()));
create policy sandbox_messages_owner_read on public.sandbox_messages for select to authenticated using (owner_id = (select auth.uid()));
create policy sandbox_decisions_owner_read on public.sandbox_decision_events for select to authenticated using (owner_id = (select auth.uid()));
create policy sandbox_guide_versions_owner_read on public.sandbox_guide_versions for select to authenticated using (owner_id = (select auth.uid()));

create function public.sandbox_accept_writer_context_v1(
  p_project_id uuid,p_writer_id uuid,p_writer_revision bigint,p_summary jsonb,
  p_model text,p_input_tokens integer,p_cached_input_tokens integer,
  p_output_tokens integer,p_estimated_cost_usd numeric,p_provider_request_id text,p_latency_ms integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null then raise exception using errcode='42501',message='SANDBOX_UNAUTHENTICATED'; end if;
  if p_project_id is null or p_writer_id is null or p_writer_revision is null or p_writer_revision<1
    or jsonb_typeof(p_summary)<>'object' or octet_length(p_summary::text)>4000
    or p_model is null or char_length(p_model) not between 1 and 100
    or p_input_tokens<0 or p_cached_input_tokens<0 or p_output_tokens<0 or p_latency_ms<0 then
    raise exception using errcode='22023',message='SANDBOX_WRITER_CONTEXT_INVALID';
  end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=actor and create_enabled=true)
    or not exists(select 1 from public.writer_scripts where id=p_writer_id and owner_id=actor
      and project_id=p_project_id and revision=p_writer_revision)
    or exists(select 1 from public.create_ideation_guides where owner_id=actor and project_id=p_project_id) then
    raise exception using errcode='42501',message='SANDBOX_WRITER_CONTEXT_UNAVAILABLE';
  end if;
  insert into public.sandbox_writer_contexts
    (project_id,owner_id,writer_id,writer_revision,summary,model,input_tokens,cached_input_tokens,
     output_tokens,estimated_cost_usd,provider_request_id,latency_ms)
  values (p_project_id,actor,p_writer_id,p_writer_revision,p_summary,p_model,p_input_tokens,
    p_cached_input_tokens,p_output_tokens,p_estimated_cost_usd,p_provider_request_id,p_latency_ms)
  on conflict(project_id) do update set
    writer_id=excluded.writer_id,writer_revision=excluded.writer_revision,summary=excluded.summary,
    model=excluded.model,input_tokens=excluded.input_tokens,cached_input_tokens=excluded.cached_input_tokens,
    output_tokens=excluded.output_tokens,estimated_cost_usd=excluded.estimated_cost_usd,
    provider_request_id=excluded.provider_request_id,latency_ms=excluded.latency_ms,
    accepted_at=now(),updated_at=now()
  where public.sandbox_writer_contexts.owner_id=actor;
  return true;
end;
$$;
revoke all on function public.sandbox_accept_writer_context_v1(uuid,uuid,bigint,jsonb,text,integer,integer,integer,numeric,text,integer) from public,anon;
grant execute on function public.sandbox_accept_writer_context_v1(uuid,uuid,bigint,jsonb,text,integer,integer,integer,numeric,text,integer) to authenticated;

create function public.sandbox_reserve_turn_v1(
  p_project_id uuid, p_session_id uuid, p_turn_id uuid, p_content text, p_mode text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  chosen_session uuid;
  prior public.sandbox_turns%rowtype;
  plan_name text;
  response_limit integer;
  used_count integer;
  reserved_count integer;
  period_start timestamptz;
  reset_at timestamptz;
begin
  if actor is null then raise exception using errcode='42501', message='SANDBOX_UNAUTHENTICATED'; end if;
  if p_project_id is null or p_turn_id is null or p_mode not in ('divergence','convergence')
    or p_content is null or char_length(btrim(p_content)) not between 1 and 4000 then
    raise exception using errcode='22023', message='SANDBOX_INVALID_INPUT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=actor) then
    raise exception using errcode='42501', message='SANDBOX_PROJECT_UNAVAILABLE';
  end if;
  select * into prior from public.sandbox_turns where id=p_turn_id;
  if found and (prior.owner_id<>actor or prior.project_id<>p_project_id or prior.mode<>p_mode) then
    raise exception using errcode='22023', message='SANDBOX_OPERATION_REUSED';
  end if;
  if prior.id is not null and not exists (
    select 1 from public.sandbox_messages
    where turn_id=p_turn_id and owner_id=actor and role='user' and content=btrim(p_content)
  ) then
    raise exception using errcode='22023', message='SANDBOX_OPERATION_REUSED';
  end if;
  if p_session_id is not null then
    select id into chosen_session from public.sandbox_sessions
      where id=p_session_id and owner_id=actor and project_id=p_project_id and status='active';
    if chosen_session is null then raise exception using errcode='42501', message='SANDBOX_SESSION_UNAVAILABLE'; end if;
  elsif found then
    chosen_session := prior.session_id;
  else
    select id into chosen_session from public.sandbox_sessions
      where owner_id=actor and project_id=p_project_id and status='active' limit 1;
    if chosen_session is null then
      insert into public.sandbox_sessions(owner_id,project_id,mode)
      values(actor,p_project_id,p_mode) returning id into chosen_session;
    end if;
  end if;
  if prior.id is not null and prior.session_id<>chosen_session then
    raise exception using errcode='22023', message='SANDBOX_OPERATION_REUSED';
  end if;
  update public.sandbox_turns set status='failed', error_code='timeout', updated_at=now()
    where owner_id=actor and status='pending' and updated_at < now()-interval '3 minutes';
  select coalesce(e.sandbox_plan,'free'), coalesce(e.paid_monthly_limit,l.paid_monthly_limit),
    l.free_response_limit, e.usage_reset_at into plan_name, response_limit, used_count, reset_at
    from private.sandbox_limits l left join public.sandbox_entitlements e on e.owner_id=actor where l.id=true;
  if plan_name='free' then response_limit := used_count; period_start := coalesce(reset_at,'-infinity'::timestamptz);
  else period_start := greatest(coalesce(reset_at,'-infinity'::timestamptz),date_trunc('month', now())); end if;
  select count(*) filter (where status='completed'), count(*) filter (where status='pending')
    into used_count,reserved_count from public.sandbox_turns
    where owner_id=actor and created_at>=period_start;
  if prior.id is not null and prior.status='completed' then
    return jsonb_build_object('status','completed','sessionId',chosen_session,'turnId',p_turn_id,
      'plan',plan_name,'limit',response_limit,'used',used_count);
  end if;
  if prior.id is not null and prior.status='pending' and prior.updated_at >= now()-interval '3 minutes' then
    return jsonb_build_object('status','pending','sessionId',chosen_session,'turnId',p_turn_id,
      'plan',plan_name,'limit',response_limit,'used',used_count);
  end if;
  if used_count+reserved_count>=response_limit then
    return jsonb_build_object('status','limit','sessionId',chosen_session,'turnId',p_turn_id,
      'plan',plan_name,'limit',response_limit,'used',used_count);
  end if;
  if prior.id is null then
    insert into public.sandbox_turns(id,session_id,project_id,owner_id,mode)
      values(p_turn_id,chosen_session,p_project_id,actor,p_mode);
    insert into public.sandbox_messages(session_id,turn_id,owner_id,role,content)
      values(chosen_session,p_turn_id,actor,'user',btrim(p_content));
  else
    update public.sandbox_turns set status='pending',error_code=null,retry_count=retry_count+1,updated_at=now()
      where id=p_turn_id and owner_id=actor;
  end if;
  update public.sandbox_sessions set mode=p_mode,updated_at=now() where id=chosen_session and owner_id=actor;
  return jsonb_build_object('status','reserved','sessionId',chosen_session,'turnId',p_turn_id,
    'plan',plan_name,'limit',response_limit,'used',used_count);
end;
$$;
revoke all on function public.sandbox_reserve_turn_v1(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.sandbox_reserve_turn_v1(uuid,uuid,uuid,text,text) to authenticated;

create function public.sandbox_complete_turn_v1(p_turn_id uuid,p_response jsonb,p_usage jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  current_turn public.sandbox_turns%rowtype;
  item record;
  conflict_id uuid;
  summary_text text;
begin
  if actor is null then raise exception using errcode='42501',message='SANDBOX_UNAUTHENTICATED'; end if;
  select * into current_turn from public.sandbox_turns where id=p_turn_id and owner_id=actor for update;
  if not found then raise exception using errcode='42501',message='SANDBOX_TURN_UNAVAILABLE'; end if;
  if current_turn.status='completed' then return true; end if;
  if current_turn.status<>'pending' or jsonb_typeof(p_response)<>'object'
    or char_length(btrim(coalesce(p_response->>'assistant_message',''))) not between 1 and 4000
    or jsonb_typeof(p_response->'possibilities')<>'array'
    or jsonb_array_length(p_response->'possibilities')>5 then
    raise exception using errcode='22023',message='SANDBOX_INVALID_RESPONSE';
  end if;
  summary_text := coalesce(p_response->>'session_summary','');
  if char_length(summary_text)>2400 then raise exception using errcode='22023',message='SANDBOX_SUMMARY_TOO_LONG'; end if;
  insert into public.sandbox_messages(session_id,turn_id,owner_id,role,content)
    values(current_turn.session_id,p_turn_id,actor,'assistant',p_response->>'assistant_message')
    on conflict(turn_id,role) do nothing;
  for item in select value,ordinality from jsonb_array_elements(p_response->'possibilities')
      with ordinality as x(value,ordinality) loop
    if char_length(btrim(coalesce(item.value->>'content',''))) not between 1 and 2000 then
      raise exception using errcode='22023',message='SANDBOX_INVALID_POSSIBILITY';
    end if;
    conflict_id := nullif(item.value->>'conflicts_with_canon_id','')::uuid;
    if conflict_id is not null and not exists (
      select 1 from public.create_ideation_possibilities
      where id=conflict_id and owner_id=actor and project_id=current_turn.project_id and state='canon'
    ) then conflict_id := null; end if;
    insert into public.create_ideation_possibilities
      (owner_id,project_id,content,title,state,source_turn_id,source_ordinal,conflicts_with_id)
    values(actor,current_turn.project_id,btrim(item.value->>'content'),
      nullif(left(btrim(coalesce(item.value->>'title','')),160),''),
      'proposed',p_turn_id,item.ordinality,conflict_id)
    on conflict do nothing;
  end loop;
  update public.sandbox_turns set status='completed',response=p_response,error_code=null,
    provider_request_id=left(coalesce(p_usage->>'requestId',''),120),
    model=left(coalesce(p_usage->>'model',''),100),
    input_tokens=greatest(0,coalesce((p_usage->>'inputTokens')::integer,0)),
    cached_input_tokens=greatest(0,coalesce((p_usage->>'cachedInputTokens')::integer,0)),
    output_tokens=greatest(0,coalesce((p_usage->>'outputTokens')::integer,0)),
    reasoning_tokens=greatest(0,coalesce((p_usage->>'reasoningTokens')::integer,0)),
    latency_ms=greatest(0,coalesce((p_usage->>'latencyMs')::integer,0)),
    estimated_cost_usd=nullif(p_usage->>'estimatedCostUsd','')::numeric,
    quota_consumed=true,updated_at=now()
    where id=p_turn_id and owner_id=actor;
  update public.sandbox_sessions set memory_summary=summary_text,updated_at=now()
    where id=current_turn.session_id and owner_id=actor;
  return true;
end;
$$;
revoke all on function public.sandbox_complete_turn_v1(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.sandbox_complete_turn_v1(uuid,jsonb,jsonb) to authenticated;

create function public.sandbox_fail_turn_v1(p_turn_id uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null then raise exception using errcode='42501',message='SANDBOX_UNAUTHENTICATED'; end if;
  update public.sandbox_turns set status='failed',error_code=left(coalesce(p_error_code,'provider'),48),updated_at=now()
    where id=p_turn_id and owner_id=actor and status='pending';
  return found;
end;
$$;
revoke all on function public.sandbox_fail_turn_v1(uuid,text) from public,anon;
grant execute on function public.sandbox_fail_turn_v1(uuid,text) to authenticated;

create function public.sandbox_set_possibility_state_v1(
  p_project_id uuid,p_possibility_id uuid,p_state text,p_resolution text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); item public.create_ideation_possibilities%rowtype;
  prior_conflict public.create_ideation_possibilities%rowtype;
begin
  if actor is null then raise exception using errcode='42501',message='SANDBOX_UNAUTHENTICATED'; end if;
  if p_state not in ('proposed','maybe','canon','discarded')
    or p_resolution is not null and p_resolution not in ('replace','coexist','maybe','cancel') then
    raise exception using errcode='22023',message='SANDBOX_INVALID_STATE';
  end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=actor) then
    raise exception using errcode='42501',message='SANDBOX_PROJECT_UNAVAILABLE'; end if;
  select * into item from public.create_ideation_possibilities
    where id=p_possibility_id and owner_id=actor and project_id=p_project_id for update;
  if not found then raise exception using errcode='42501',message='SANDBOX_POSSIBILITY_UNAVAILABLE'; end if;
  if p_state='canon' and item.conflicts_with_id is not null then
    select * into prior_conflict from public.create_ideation_possibilities
      where id=item.conflicts_with_id and owner_id=actor and project_id=p_project_id and state='canon' for update;
    if found and p_resolution is null then
      return jsonb_build_object('status','conflict','canonId',prior_conflict.id,'canonContent',prior_conflict.content);
    end if;
    if found and p_resolution='cancel' then return jsonb_build_object('status','cancelled'); end if;
    if found and p_resolution='maybe' then p_state:='maybe'; end if;
    if found and p_resolution='replace' then
      update public.create_ideation_possibilities set state='maybe',updated_at=now() where id=prior_conflict.id;
      insert into public.sandbox_decision_events(owner_id,project_id,possibility_id,prior_state,next_state,resolution)
        values(actor,p_project_id,prior_conflict.id,'canon','maybe','replaced');
    end if;
  end if;
  update public.create_ideation_possibilities set state=p_state,updated_at=now() where id=item.id;
  insert into public.sandbox_decision_events(owner_id,project_id,possibility_id,prior_state,next_state,resolution)
    values(actor,p_project_id,item.id,item.state,p_state,p_resolution);
  return jsonb_build_object('status','updated','state',p_state);
end;
$$;
revoke all on function public.sandbox_set_possibility_state_v1(uuid,uuid,text,text) from public,anon;
grant execute on function public.sandbox_set_possibility_state_v1(uuid,uuid,text,text) to authenticated;

create function public.sandbox_quota_v1() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); plan_name text; response_limit integer; used_count integer;
  period_start timestamptz; reset_at timestamptz;
begin
  if actor is null then raise exception using errcode='42501',message='SANDBOX_UNAUTHENTICATED'; end if;
  select coalesce(e.sandbox_plan,'free'),l.free_response_limit,coalesce(e.paid_monthly_limit,l.paid_monthly_limit),e.usage_reset_at
    into plan_name,used_count,response_limit,reset_at
    from private.sandbox_limits l left join public.sandbox_entitlements e on e.owner_id=actor where l.id=true;
  if plan_name='free' then response_limit:=used_count; period_start:=coalesce(reset_at,'-infinity'::timestamptz);
  else period_start:=greatest(coalesce(reset_at,'-infinity'::timestamptz),date_trunc('month',now())); end if;
  select count(*) into used_count from public.sandbox_turns
    where owner_id=actor and status='completed' and created_at>=period_start;
  return jsonb_build_object('plan',plan_name,'limit',response_limit,'used',used_count);
end;
$$;
revoke all on function public.sandbox_quota_v1() from public,anon;
grant execute on function public.sandbox_quota_v1() to authenticated;

create function public.sandbox_set_mode_v1(p_project_id uuid,p_session_id uuid,p_mode text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null then raise exception using errcode='42501',message='SANDBOX_UNAUTHENTICATED'; end if;
  if p_mode not in ('divergence','convergence') then raise exception using errcode='22023',message='SANDBOX_INVALID_MODE'; end if;
  update public.sandbox_sessions set mode=p_mode,updated_at=now()
    where id=p_session_id and project_id=p_project_id and owner_id=actor and status='active';
  return found;
end;
$$;
revoke all on function public.sandbox_set_mode_v1(uuid,uuid,text) from public,anon;
grant execute on function public.sandbox_set_mode_v1(uuid,uuid,text) to authenticated;

create function public.sandbox_apply_handoff_v1(
  p_project_id uuid,p_operation_id uuid,p_writer_id uuid,p_selected_ids uuid[],
  p_expected_updated_at timestamptz,p_context jsonb,p_synthesis jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  guide_row public.create_ideation_guides%rowtype;
  prior public.sandbox_guide_versions%rowtype;
  selected_count integer;
begin
  if actor is null then raise exception using errcode='42501',message='SANDBOX_UNAUTHENTICATED'; end if;
  if p_project_id is null or p_operation_id is null or p_writer_id is null
    or p_selected_ids is null or cardinality(p_selected_ids)>30
    or jsonb_typeof(p_context)<>'object' or jsonb_typeof(p_synthesis)<>'object'
    or octet_length(p_context::text)>80000 or octet_length(p_synthesis::text)>80000 then
    raise exception using errcode='22023',message='SANDBOX_HANDOFF_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text,0));
  select * into prior from public.sandbox_guide_versions where operation_id=p_operation_id;
  if found then
    if prior.owner_id<>actor or prior.project_id<>p_project_id or prior.writer_id<>p_writer_id then
      raise exception using errcode='22023',message='SANDBOX_HANDOFF_OPERATION_REUSED';
    end if;
    return prior.guide_id;
  end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=actor)
    or not exists(select 1 from public.writer_scripts where id=p_writer_id and owner_id=actor and project_id=p_project_id) then
    raise exception using errcode='42501',message='SANDBOX_PROJECT_UNAVAILABLE';
  end if;
  select count(*) into selected_count from public.create_ideation_possibilities
    where id=any(p_selected_ids) and owner_id=actor and project_id=p_project_id and state in ('canon','maybe');
  if selected_count<>cardinality(p_selected_ids) then
    raise exception using errcode='22023',message='SANDBOX_HANDOFF_SELECTION_INVALID';
  end if;
  select * into guide_row from public.create_ideation_guides
    where project_id=p_project_id and owner_id=actor for update;
  if (guide_row.id is null and p_expected_updated_at is not null)
    or (guide_row.id is not null and guide_row.updated_at is distinct from p_expected_updated_at) then
    raise exception using errcode='40001',message='SANDBOX_GUIDE_CHANGED';
  end if;
  if not found then
    insert into public.create_ideation_guides(owner_id,project_id,writer_id,context,synthesis)
      values(actor,p_project_id,p_writer_id,p_context,p_synthesis)
      returning * into guide_row;
    insert into public.sandbox_guide_versions
      (operation_id,owner_id,project_id,guide_id,writer_id,prior_context,prior_synthesis,
       applied_context,applied_synthesis,selected_possibility_ids)
      values(p_operation_id,actor,p_project_id,guide_row.id,p_writer_id,null,null,
        p_context,p_synthesis,p_selected_ids);
  else
    insert into public.sandbox_guide_versions
      (operation_id,owner_id,project_id,guide_id,writer_id,prior_context,prior_synthesis,
       applied_context,applied_synthesis,selected_possibility_ids)
      values(p_operation_id,actor,p_project_id,guide_row.id,p_writer_id,guide_row.context,guide_row.synthesis,
        p_context,p_synthesis,p_selected_ids);
    update public.create_ideation_guides set writer_id=p_writer_id,context=p_context,
      synthesis=p_synthesis,updated_at=now() where id=guide_row.id;
  end if;
  return guide_row.id;
end;
$$;
revoke all on function public.sandbox_apply_handoff_v1(uuid,uuid,uuid,uuid[],timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.sandbox_apply_handoff_v1(uuid,uuid,uuid,uuid[],timestamptz,jsonb,jsonb) to authenticated;

commit;
