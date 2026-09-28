begin;

-- Writer assisted import keeps provider accounting and analysis outside the
-- canonical screenplay document. The source text is never stored here.

create table public.writer_assisted_imports (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_hash text not null,
  options_hash text not null,
  source_format text not null check (source_format in ('pasted','txt','fdx')),
  title text not null,
  status text not null check (status in ('reserved','processing','ready','completed','failed','cancelled','uncertain')),
  provider_model text,
  provider_calls integer not null default 0 check (provider_calls between 0 and 24),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  reserved_cost_microusd bigint not null default 0 check (reserved_cost_microusd between 0 and 200000),
  actual_cost_microusd bigint not null default 0 check (actual_cost_microusd between 0 and 200000),
  source_words integer not null check (source_words between 1 and 30000),
  source_tokens integer not null check (source_tokens between 1 and 80000),
  source_bytes integer not null check (source_bytes between 1 and 2097152),
  script_id uuid references public.writer_scripts(id) on delete set null,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  constraint writer_assisted_import_title_length check (char_length(title) between 1 and 160),
  constraint writer_assisted_import_hashes check (
    source_hash ~ '^[0-9a-f]{64}$' and options_hash ~ '^[0-9a-f]{64}$'
  )
);

create unique index writer_assisted_import_one_active_per_owner
  on public.writer_assisted_imports(owner_id)
  where status in ('reserved','processing','ready','uncertain');
create index writer_assisted_import_owner_created_idx
  on public.writer_assisted_imports(owner_id, created_at desc);

create table public.writer_assisted_import_batches (
  operation_id uuid not null references public.writer_assisted_imports(id) on delete cascade,
  batch_index integer not null check (batch_index between 0 and 23),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('reserved','completed','failed','uncertain')),
  result jsonb,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  reserved_cost_microusd bigint not null default 0 check (reserved_cost_microusd >= 0),
  actual_cost_microusd bigint not null default 0 check (actual_cost_microusd >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(operation_id, batch_index)
);

create table public.writer_import_analyses (
  script_id uuid primary key references public.writer_scripts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null unique references public.writer_assisted_imports(id) on delete restrict,
  document_revision bigint not null check (document_revision > 0),
  analysis_version text not null,
  provider_model text,
  identities jsonb not null default '[]'::jsonb check (jsonb_typeof(identities) = 'array'),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  observations jsonb not null default '[]'::jsonb check (jsonb_typeof(observations) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.writer_import_analysis_decisions (
  script_id uuid not null references public.writer_scripts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  block_id uuid not null,
  decision text not null check (decision in ('confirmed','linked','ignored')),
  identity_key text,
  identity_name text,
  decided_at timestamptz not null default clock_timestamp(),
  primary key(script_id, fingerprint)
);

alter table public.writer_assisted_imports enable row level security;
alter table public.writer_assisted_import_batches enable row level security;
alter table public.writer_import_analyses enable row level security;
alter table public.writer_import_analysis_decisions enable row level security;

revoke all on public.writer_assisted_imports,
  public.writer_assisted_import_batches,
  public.writer_import_analyses,
  public.writer_import_analysis_decisions
  from public, anon, authenticated;

grant select on public.writer_import_analyses, public.writer_import_analysis_decisions to authenticated;
grant select,insert,update,delete on public.writer_assisted_imports,
  public.writer_assisted_import_batches,
  public.writer_import_analyses,
  public.writer_import_analysis_decisions
  to service_role;

create policy writer_import_analyses_owner_read on public.writer_import_analyses
  for select to authenticated using (owner_id = (select auth.uid()));
create policy writer_import_decisions_owner_read on public.writer_import_analysis_decisions
  for select to authenticated using (owner_id = (select auth.uid()));

create or replace function public.writer_reserve_assisted_import(
  p_user_id uuid,
  p_operation_id uuid,
  p_source_hash text,
  p_options_hash text,
  p_source_format text,
  p_title text,
  p_source_words integer,
  p_source_tokens integer,
  p_source_bytes integer,
  p_model text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.writer_assisted_imports%rowtype;
  attempts integer;
begin
  if p_user_id is null or p_operation_id is null then
    raise exception using errcode='22023', message='WRITER_IMPORT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 9127));

  select * into existing from public.writer_assisted_imports where id=p_operation_id;
  if found then
    if existing.owner_id<>p_user_id or existing.source_hash<>p_source_hash or existing.options_hash<>p_options_hash then
      raise exception using errcode='22023', message='WRITER_IMPORT_OPERATION_REUSED';
    end if;
    if existing.status in ('failed','cancelled') then
      if exists(select 1 from public.writer_assisted_imports
        where owner_id=p_user_id and id<>p_operation_id
          and status in ('reserved','processing','ready','uncertain')) then
        raise exception using errcode='P0001', message='WRITER_IMPORT_ACTIVE';
      end if;
      update public.writer_assisted_imports set status='reserved',error_code=null,updated_at=clock_timestamp()
        where id=p_operation_id;
      return jsonb_build_object('id',existing.id,'status','reserved','script_id',null,
        'provider_calls',existing.provider_calls,'actual_cost_microusd',existing.actual_cost_microusd,
        'reused',false,'resumed',true);
    end if;
    return jsonb_build_object('id',existing.id,'status',existing.status,'script_id',existing.script_id,
      'provider_calls',existing.provider_calls,'actual_cost_microusd',existing.actual_cost_microusd,'reused',true);
  end if;

  if exists(select 1 from public.writer_assisted_imports where owner_id=p_user_id and status='completed') then
    raise exception using errcode='P0001', message='WRITER_IMPORT_FREE_USED';
  end if;
  select count(*) into attempts from public.writer_assisted_imports
    where owner_id=p_user_id and created_at>clock_timestamp()-interval '24 hours';
  if attempts>=3 then raise exception using errcode='P0001', message='WRITER_IMPORT_ATTEMPTS'; end if;
  if exists(select 1 from public.writer_assisted_imports where owner_id=p_user_id and status in ('reserved','processing','ready','uncertain')) then
    raise exception using errcode='P0001', message='WRITER_IMPORT_ACTIVE';
  end if;
  if (select count(*) from public.writer_scripts where owner_id=p_user_id)>=3 then
    raise exception using errcode='P0001', message='WRITER_QUOTA_REACHED';
  end if;

  insert into public.writer_assisted_imports(
    id,owner_id,source_hash,options_hash,source_format,title,status,provider_model,
    source_words,source_tokens,source_bytes
  ) values (
    p_operation_id,p_user_id,p_source_hash,p_options_hash,p_source_format,btrim(p_title),'reserved',p_model,
    p_source_words,p_source_tokens,p_source_bytes
  );
  return jsonb_build_object('id',p_operation_id,'status','reserved','script_id',null,'reused',false);
end;
$$;

create or replace function public.writer_reserve_assisted_import_call(
  p_user_id uuid,
  p_operation_id uuid,
  p_batch_index integer,
  p_request_hash text,
  p_max_cost_microusd bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  op public.writer_assisted_imports%rowtype;
  batch public.writer_assisted_import_batches%rowtype;
  global_committed bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('writer-import-global-v1', 9128));
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 9129));
  select * into op from public.writer_assisted_imports where id=p_operation_id and owner_id=p_user_id for update;
  if not found or op.status not in ('reserved','processing') then
    raise exception using errcode='P0001', message='WRITER_IMPORT_NOT_ACTIVE';
  end if;
  select * into batch from public.writer_assisted_import_batches
    where operation_id=p_operation_id and batch_index=p_batch_index;
  if found then
    if batch.request_hash<>p_request_hash then
      raise exception using errcode='22023', message='WRITER_IMPORT_BATCH_REUSED';
    end if;
    if batch.status<>'failed' then
      return jsonb_build_object('status',batch.status,'result',batch.result);
    end if;
  end if;
  if op.provider_calls>=24 then raise exception using errcode='P0001', message='WRITER_IMPORT_CALL_LIMIT'; end if;
  if p_max_cost_microusd<=0 or op.actual_cost_microusd+op.reserved_cost_microusd+p_max_cost_microusd>200000 then
    raise exception using errcode='P0001', message='WRITER_IMPORT_BUDGET';
  end if;
  select coalesce(sum(actual_cost_microusd+reserved_cost_microusd),0) into global_committed
    from public.writer_assisted_imports;
  if global_committed+p_max_cost_microusd>2000000 then
    raise exception using errcode='P0001', message='WRITER_IMPORT_GLOBAL_BUDGET';
  end if;
  insert into public.writer_assisted_import_batches(
    operation_id,batch_index,request_hash,status,reserved_cost_microusd
  ) values (p_operation_id,p_batch_index,p_request_hash,'reserved',p_max_cost_microusd)
  on conflict(operation_id,batch_index) do update set
    status='reserved',result=null,reserved_cost_microusd=excluded.reserved_cost_microusd,
    updated_at=clock_timestamp();
  update public.writer_assisted_imports set status='processing',provider_calls=provider_calls+1,
    reserved_cost_microusd=reserved_cost_microusd+p_max_cost_microusd,updated_at=clock_timestamp()
    where id=p_operation_id;
  return jsonb_build_object('status','reserved','result',null);
end;
$$;

create or replace function public.writer_settle_assisted_import_call(
  p_user_id uuid,
  p_operation_id uuid,
  p_batch_index integer,
  p_status text,
  p_result jsonb,
  p_input_tokens bigint,
  p_cached_input_tokens bigint,
  p_output_tokens bigint,
  p_reasoning_tokens bigint,
  p_actual_cost_microusd bigint
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch public.writer_assisted_import_batches%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 9129));
  if not exists(select 1 from public.writer_assisted_imports where id=p_operation_id and owner_id=p_user_id) then
    raise exception using errcode='42501', message='WRITER_IMPORT_FORBIDDEN';
  end if;
  select * into strict batch from public.writer_assisted_import_batches
    where operation_id=p_operation_id and batch_index=p_batch_index for update;
  if batch.status='completed' then return; end if;
  if p_status not in ('completed','failed','uncertain') or p_actual_cost_microusd<0
    or p_actual_cost_microusd>batch.reserved_cost_microusd then
    raise exception using errcode='22023', message='WRITER_IMPORT_INVALID_SETTLEMENT';
  end if;
  update public.writer_assisted_import_batches set status=p_status,result=case when p_status='completed' then p_result else null end,
    input_tokens=input_tokens+p_input_tokens,cached_input_tokens=cached_input_tokens+p_cached_input_tokens,
    output_tokens=output_tokens+p_output_tokens,reasoning_tokens=reasoning_tokens+p_reasoning_tokens,
    actual_cost_microusd=actual_cost_microusd+p_actual_cost_microusd,reserved_cost_microusd=0,
    updated_at=clock_timestamp()
    where operation_id=p_operation_id and batch_index=p_batch_index;
  update public.writer_assisted_imports set
    reserved_cost_microusd=greatest(0,reserved_cost_microusd-batch.reserved_cost_microusd),
    actual_cost_microusd=actual_cost_microusd+p_actual_cost_microusd,
    input_tokens=input_tokens+p_input_tokens,cached_input_tokens=cached_input_tokens+p_cached_input_tokens,
    output_tokens=output_tokens+p_output_tokens,reasoning_tokens=reasoning_tokens+p_reasoning_tokens,
    status=case when p_status='uncertain' then 'uncertain' else status end,updated_at=clock_timestamp()
    where id=p_operation_id;
end;
$$;

create or replace function public.writer_finalize_assisted_import(
  p_user_id uuid,
  p_operation_id uuid,
  p_title text,
  p_document jsonb,
  p_schema_version integer,
  p_analysis_version text,
  p_model text,
  p_identities jsonb,
  p_evidence jsonb,
  p_observations jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  op public.writer_assisted_imports%rowtype;
  created public.writer_scripts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 9127));
  select * into op from public.writer_assisted_imports where id=p_operation_id and owner_id=p_user_id for update;
  if not found then raise exception using errcode='P0001', message='WRITER_IMPORT_NOT_FOUND'; end if;
  if op.status='completed' and op.script_id is not null then
    return jsonb_build_object('id',op.script_id,'revision',1,'reused',true);
  end if;
  if op.status not in ('reserved','processing') or op.reserved_cost_microusd<>0 then
    raise exception using errcode='P0001', message='WRITER_IMPORT_NOT_READY';
  end if;
  perform private.writer_validate_payload(p_title,p_document,p_schema_version);
  if (select count(*) from public.writer_scripts where owner_id=p_user_id)>=3 then
    raise exception using errcode='P0001', message='WRITER_QUOTA_REACHED';
  end if;
  insert into public.writer_scripts(owner_id,title,document,schema_version)
    values(p_user_id,btrim(p_title),p_document,p_schema_version) returning * into created;
  insert into public.writer_import_analyses(
    script_id,owner_id,operation_id,document_revision,analysis_version,provider_model,identities,evidence,observations
  ) values (
    created.id,p_user_id,p_operation_id,created.revision,p_analysis_version,p_model,
    p_identities,p_evidence,p_observations
  );
  update public.writer_assisted_imports set status='completed',script_id=created.id,completed_at=clock_timestamp(),
    updated_at=clock_timestamp() where id=p_operation_id;
  return jsonb_build_object('id',created.id,'revision',created.revision,'reused',false);
end;
$$;

create or replace function public.writer_fail_assisted_import(
  p_user_id uuid,p_operation_id uuid,p_status text,p_error_code text
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_status not in ('failed','cancelled','uncertain') then
    raise exception using errcode='22023',message='WRITER_IMPORT_INVALID_STATUS';
  end if;
  update public.writer_assisted_imports set status=p_status,error_code=left(p_error_code,80),
    reserved_cost_microusd=0,updated_at=clock_timestamp()
    where id=p_operation_id and owner_id=p_user_id and status<>'completed';
  update public.writer_assisted_import_batches set reserved_cost_microusd=0,
    status=case when status='reserved' then p_status else status end,updated_at=clock_timestamp()
    where operation_id=p_operation_id and status='reserved';
end;
$$;

create or replace function public.writer_save_import_decision(
  p_user_id uuid,p_script_id uuid,p_fingerprint text,p_block_id uuid,p_decision text,
  p_identity_key text,p_identity_name text
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from public.writer_scripts where id=p_script_id and owner_id=p_user_id)
    or char_length(p_fingerprint) not between 1 and 160
    or p_decision not in ('confirmed','linked','ignored') then
    raise exception using errcode='42501',message='WRITER_IMPORT_DECISION_FORBIDDEN';
  end if;
  insert into public.writer_import_analysis_decisions(
    script_id,owner_id,fingerprint,block_id,decision,identity_key,identity_name
  ) values (
    p_script_id,p_user_id,p_fingerprint,p_block_id,p_decision,
    nullif(left(btrim(p_identity_key),128),''),nullif(left(btrim(p_identity_name),64),'')
  ) on conflict(script_id,fingerprint) do update set
    decision=excluded.decision,identity_key=excluded.identity_key,identity_name=excluded.identity_name,
    decided_at=clock_timestamp();
end;
$$;

create or replace function public.writer_delete_import_decision(
  p_user_id uuid,p_script_id uuid,p_fingerprint text
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from public.writer_scripts where id=p_script_id and owner_id=p_user_id) then
    raise exception using errcode='42501',message='WRITER_IMPORT_DECISION_FORBIDDEN';
  end if;
  delete from public.writer_import_analysis_decisions
    where script_id=p_script_id and owner_id=p_user_id and fingerprint=p_fingerprint;
end;
$$;

revoke all on function public.writer_reserve_assisted_import(uuid,uuid,text,text,text,text,integer,integer,integer,text),
  public.writer_reserve_assisted_import_call(uuid,uuid,integer,text,bigint),
  public.writer_settle_assisted_import_call(uuid,uuid,integer,text,jsonb,bigint,bigint,bigint,bigint,bigint),
  public.writer_finalize_assisted_import(uuid,uuid,text,jsonb,integer,text,text,jsonb,jsonb,jsonb),
  public.writer_fail_assisted_import(uuid,uuid,text,text),
  public.writer_save_import_decision(uuid,uuid,text,uuid,text,text,text),
  public.writer_delete_import_decision(uuid,uuid,text)
  from public,anon,authenticated;

grant execute on function public.writer_reserve_assisted_import(uuid,uuid,text,text,text,text,integer,integer,integer,text),
  public.writer_reserve_assisted_import_call(uuid,uuid,integer,text,bigint),
  public.writer_settle_assisted_import_call(uuid,uuid,integer,text,jsonb,bigint,bigint,bigint,bigint,bigint),
  public.writer_finalize_assisted_import(uuid,uuid,text,jsonb,integer,text,text,jsonb,jsonb,jsonb),
  public.writer_fail_assisted_import(uuid,uuid,text,text),
  public.writer_save_import_decision(uuid,uuid,text,uuid,text,text,text),
  public.writer_delete_import_decision(uuid,uuid,text)
  to service_role;

commit;
