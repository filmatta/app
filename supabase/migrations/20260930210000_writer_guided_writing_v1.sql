begin;

-- Guided Writing persists only the user's question, a structured editorial
-- response and stable references. The screenplay/context sent to the model is
-- intentionally not duplicated in these tables.
create table public.writer_guided_writing_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  scope text not null check (scope in ('scene','document')),
  scene_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint writer_guided_session_scope check (
    (scope='scene' and scene_id is not null) or (scope='document' and scene_id is null)
  )
);

create index writer_guided_sessions_script_scope_idx
  on public.writer_guided_writing_sessions(owner_id,script_id,scope,scene_id,updated_at desc);

create table public.writer_guided_writing_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.writer_guided_writing_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text,
  response_payload jsonb,
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  scene_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint writer_guided_message_shape check (
    (role='user' and char_length(btrim(coalesce(content,''))) between 1 and 1200 and response_payload is null)
    or (role='assistant' and content is null and response_payload is not null and jsonb_typeof(response_payload)='object')
  )
);

create index writer_guided_messages_session_created_idx
  on public.writer_guided_writing_messages(owner_id,session_id,created_at,id);

create table public.writer_guided_writing_operations (
  id uuid primary key,
  session_id uuid not null references public.writer_guided_writing_sessions(id) on delete cascade,
  user_message_id uuid not null references public.writer_guided_writing_messages(id) on delete cascade,
  assistant_message_id uuid references public.writer_guided_writing_messages(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  model text not null,
  status text not null check (status in ('reserved','completed','failed','uncertain')),
  reserved_cost_microusd bigint not null check (reserved_cost_microusd between 0 and 3000000),
  actual_cost_microusd bigint not null default 0 check (actual_cost_microusd between 0 and 3000000),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz
);

create index writer_guided_operations_owner_created_idx
  on public.writer_guided_writing_operations(owner_id,created_at desc);

alter table public.writer_guided_writing_sessions enable row level security;
alter table public.writer_guided_writing_messages enable row level security;
alter table public.writer_guided_writing_operations enable row level security;

revoke all on public.writer_guided_writing_sessions, public.writer_guided_writing_messages,
  public.writer_guided_writing_operations from public,anon,authenticated;
grant select on public.writer_guided_writing_sessions, public.writer_guided_writing_messages to authenticated;

create policy writer_guided_sessions_owner_read on public.writer_guided_writing_sessions
  for select to authenticated using(owner_id=(select auth.uid()));
create policy writer_guided_messages_owner_read on public.writer_guided_writing_messages
  for select to authenticated using(owner_id=(select auth.uid()));

create or replace function public.writer_reserve_guided_writing(
  p_user_id uuid,p_operation_id uuid,p_script_id uuid,p_session_id uuid,p_scope text,p_scene_id uuid,
  p_document_hash text,p_request_hash text,p_model text,p_question text,
  p_max_cost_microusd bigint,p_global_budget_microusd bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  session_value public.writer_guided_writing_sessions%rowtype;
  existing public.writer_guided_writing_operations%rowtype;
  message_id uuid;
  spent bigint;
  held bigint;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_GUIDED_FORBIDDEN' using errcode='42501'; end if;
  if p_user_id is null or p_operation_id is null or p_script_id is null
    or p_scope not in ('scene','document')
    or (p_scope='scene' and p_scene_id is null) or (p_scope='document' and p_scene_id is not null)
    or p_document_hash !~ '^[0-9a-f]{64}$' or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_model <> 'gpt-5.6-terra' or char_length(btrim(coalesce(p_question,''))) not between 1 and 1200
    or p_max_cost_microusd not between 1 and 3000000
    or p_global_budget_microusd not between p_max_cost_microusd and 10000000 then
    raise exception 'WRITER_GUIDED_INVALID' using errcode='22023';
  end if;
  if not exists(select 1 from public.writer_scripts where id=p_script_id and owner_id=p_user_id) then
    raise exception 'WRITER_GUIDED_NOT_FOUND' using errcode='P0001';
  end if;

  select * into existing from public.writer_guided_writing_operations where id=p_operation_id and owner_id=p_user_id;
  if found then
    return jsonb_build_object('status',existing.status,'session_id',existing.session_id,
      'user_message_id',existing.user_message_id,'assistant_message_id',existing.assistant_message_id,'reused',true);
  end if;

  if p_session_id is null then
    insert into public.writer_guided_writing_sessions(owner_id,script_id,scope,scene_id)
      values(p_user_id,p_script_id,p_scope,p_scene_id) returning * into session_value;
  else
    select * into session_value from public.writer_guided_writing_sessions
      where id=p_session_id and owner_id=p_user_id and script_id=p_script_id and scope=p_scope
        and scene_id is not distinct from p_scene_id for update;
    if not found then raise exception 'WRITER_GUIDED_SESSION_NOT_FOUND' using errcode='P0001'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('writer-guided-budget',9189));
  select coalesce(sum(actual_cost_microusd),0) into spent from public.writer_guided_writing_operations;
  select coalesce(sum(reserved_cost_microusd),0) into held from public.writer_guided_writing_operations where status in ('reserved','uncertain');
  if spent+held+p_max_cost_microusd > p_global_budget_microusd then
    raise exception 'WRITER_GUIDED_GLOBAL_BUDGET' using errcode='P0001';
  end if;

  insert into public.writer_guided_writing_messages(session_id,owner_id,script_id,role,content,document_hash,scene_id)
    values(session_value.id,p_user_id,p_script_id,'user',btrim(p_question),p_document_hash,p_scene_id)
    returning id into message_id;
  insert into public.writer_guided_writing_operations(
    id,session_id,user_message_id,owner_id,script_id,request_hash,document_hash,model,status,reserved_cost_microusd
  ) values(
    p_operation_id,session_value.id,message_id,p_user_id,p_script_id,p_request_hash,p_document_hash,p_model,'reserved',p_max_cost_microusd
  );
  update public.writer_guided_writing_sessions set updated_at=clock_timestamp() where id=session_value.id;
  return jsonb_build_object('status','reserved','session_id',session_value.id,'user_message_id',message_id,'reused',false);
end$$;

create or replace function public.writer_settle_guided_writing(
  p_user_id uuid,p_operation_id uuid,p_status text,p_response jsonb,p_error_code text,
  p_input_tokens bigint,p_cached_input_tokens bigint,p_output_tokens bigint,p_reasoning_tokens bigint,
  p_actual_cost_microusd bigint,p_latency_ms integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  op public.writer_guided_writing_operations%rowtype;
  assistant_id uuid;
  scene_value uuid;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'WRITER_GUIDED_FORBIDDEN' using errcode='42501'; end if;
  select * into op from public.writer_guided_writing_operations where id=p_operation_id and owner_id=p_user_id for update;
  if not found then raise exception 'WRITER_GUIDED_OPERATION_NOT_FOUND' using errcode='P0001'; end if;
  if op.status in ('completed','failed','uncertain') then
    return jsonb_build_object('status',op.status,'assistant_message_id',op.assistant_message_id,'reused',true);
  end if;
  if p_status not in ('completed','failed','uncertain') or p_actual_cost_microusd < 0
    or p_actual_cost_microusd > op.reserved_cost_microusd
    or (p_status='completed' and (p_response is null or jsonb_typeof(p_response)<>'object')) then
    raise exception 'WRITER_GUIDED_INVALID' using errcode='22023';
  end if;
  if p_status='completed' then
    select scene_id into scene_value from public.writer_guided_writing_sessions where id=op.session_id;
    insert into public.writer_guided_writing_messages(
      session_id,owner_id,script_id,role,response_payload,document_hash,scene_id
    ) values(op.session_id,p_user_id,op.script_id,'assistant',p_response,op.document_hash,scene_value)
    returning id into assistant_id;
  end if;
  update public.writer_guided_writing_operations set status=p_status,assistant_message_id=assistant_id,
    actual_cost_microusd=p_actual_cost_microusd,input_tokens=greatest(0,p_input_tokens),
    cached_input_tokens=greatest(0,p_cached_input_tokens),output_tokens=greatest(0,p_output_tokens),
    reasoning_tokens=greatest(0,p_reasoning_tokens),latency_ms=greatest(0,p_latency_ms),
    error_code=left(p_error_code,80),updated_at=clock_timestamp(),settled_at=clock_timestamp()
    where id=p_operation_id;
  update public.writer_guided_writing_sessions set updated_at=clock_timestamp() where id=op.session_id;
  return jsonb_build_object('status',p_status,'assistant_message_id',assistant_id,'reused',false);
end$$;

revoke all on function public.writer_reserve_guided_writing(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,bigint,bigint),
  public.writer_settle_guided_writing(uuid,uuid,text,jsonb,text,bigint,bigint,bigint,bigint,bigint,integer)
  from public,anon,authenticated;
grant execute on function public.writer_reserve_guided_writing(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,bigint,bigint),
  public.writer_settle_guided_writing(uuid,uuid,text,jsonb,text,bigint,bigint,bigint,bigint,bigint,integer)
  to service_role;

insert into public.plan_entitlements(plan_code,entitlement_key,access_value,allowance_value,allowance_unit,unlimited,fair_use)
values('free','writer.guided_writing',true,null,null,false,false)
on conflict(plan_code,entitlement_key) do nothing;

commit;
