begin;

alter table public.writer_assisted_imports
  add column operation_budget_microusd bigint not null default 200000;

alter table public.writer_assisted_imports
  drop constraint writer_assisted_imports_reserved_cost_microusd_check,
  drop constraint writer_assisted_imports_actual_cost_microusd_check;

alter table public.writer_assisted_imports
  add constraint writer_assisted_import_operation_budget_check
    check (operation_budget_microusd in (200000, 600000)),
  add constraint writer_assisted_import_operation_spend_check
    check (
      reserved_cost_microusd >= 0
      and actual_cost_microusd >= 0
      and reserved_cost_microusd + actual_cost_microusd <= operation_budget_microusd
    );

create table private.writer_assisted_import_budget_grants (
  operation_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  budget_microusd bigint not null check (budget_microusd = 600000),
  status text not null check (status in ('active','consumed','revoked')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint writer_assisted_import_budget_grant_state check (
    (status='active' and consumed_at is null and revoked_at is null)
    or (status='consumed' and consumed_at is not null and revoked_at is null)
    or (status='revoked' and revoked_at is not null)
  )
);

alter table private.writer_assisted_import_budget_grants enable row level security;
revoke all on private.writer_assisted_import_budget_grants from public, anon, authenticated;

create or replace function public.writer_grant_assisted_import_qa_budget(
  p_user_id uuid,
  p_operation_id uuid,
  p_source_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing private.writer_assisted_import_budget_grants%rowtype;
begin
  if p_user_id is null or p_operation_id is null
    or p_source_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp()+interval '24 hours' then
    raise exception using errcode='22023', message='WRITER_IMPORT_GRANT_INVALID';
  end if;
  if exists(select 1 from public.writer_assisted_imports where id=p_operation_id) then
    raise exception using errcode='P0001', message='WRITER_IMPORT_GRANT_OPERATION_EXISTS';
  end if;

  select * into existing from private.writer_assisted_import_budget_grants
    where operation_id=p_operation_id for update;
  if found then
    if existing.owner_id<>p_user_id or existing.source_hash<>p_source_hash
      or existing.status<>'active' or existing.expires_at<=clock_timestamp() then
      raise exception using errcode='P0001', message='WRITER_IMPORT_GRANT_REUSED';
    end if;
    return jsonb_build_object(
      'operation_id',existing.operation_id,'budget_microusd',existing.budget_microusd,
      'status',existing.status,'reused',true
    );
  end if;

  insert into private.writer_assisted_import_budget_grants(
    operation_id,owner_id,source_hash,budget_microusd,status,expires_at
  ) values (p_operation_id,p_user_id,p_source_hash,600000,'active',p_expires_at);
  return jsonb_build_object(
    'operation_id',p_operation_id,'budget_microusd',600000,'status','active','reused',false
  );
end;
$$;

create or replace function public.writer_revoke_assisted_import_qa_budget(
  p_user_id uuid,
  p_operation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed private.writer_assisted_import_budget_grants%rowtype;
begin
  update private.writer_assisted_import_budget_grants set
    status='revoked',revoked_at=coalesce(revoked_at,clock_timestamp())
    where operation_id=p_operation_id and owner_id=p_user_id
    returning * into changed;
  if not found then
    raise exception using errcode='P0001', message='WRITER_IMPORT_GRANT_NOT_FOUND';
  end if;
  return jsonb_build_object(
    'operation_id',changed.operation_id,'budget_microusd',changed.budget_microusd,
    'status',changed.status,'consumed_at',changed.consumed_at,'revoked_at',changed.revoked_at
  );
end;
$$;

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
  p_model text,
  p_maximum_plan_cost_microusd bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.writer_assisted_imports%rowtype;
  budget_grant private.writer_assisted_import_budget_grants%rowtype;
  operation_budget bigint := 200000;
  attempts integer;
begin
  if p_user_id is null or p_operation_id is null
    or p_maximum_plan_cost_microusd<=0 or p_maximum_plan_cost_microusd>600000 then
    raise exception using errcode='22023', message='WRITER_IMPORT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 9127));
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 9129));

  select * into existing from public.writer_assisted_imports where id=p_operation_id;
  if found then
    if existing.owner_id<>p_user_id or existing.source_hash<>p_source_hash or existing.options_hash<>p_options_hash then
      raise exception using errcode='22023', message='WRITER_IMPORT_OPERATION_REUSED';
    end if;
    if p_maximum_plan_cost_microusd>existing.operation_budget_microusd then
      raise exception using errcode='P0001', message='WRITER_IMPORT_BUDGET';
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
        'operation_budget_microusd',existing.operation_budget_microusd,
        'reused',false,'resumed',true);
    end if;
    return jsonb_build_object('id',existing.id,'status',existing.status,'script_id',existing.script_id,
      'provider_calls',existing.provider_calls,'actual_cost_microusd',existing.actual_cost_microusd,
      'operation_budget_microusd',existing.operation_budget_microusd,'reused',true);
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

  if p_maximum_plan_cost_microusd>200000 then
    select * into budget_grant from private.writer_assisted_import_budget_grants
      where operation_id=p_operation_id and owner_id=p_user_id and source_hash=p_source_hash
        and status='active' and expires_at>clock_timestamp()
      for update;
    if not found or budget_grant.budget_microusd<p_maximum_plan_cost_microusd then
      raise exception using errcode='P0001', message='WRITER_IMPORT_BUDGET_AUTHORIZATION';
    end if;
    operation_budget := budget_grant.budget_microusd;
  end if;

  insert into public.writer_assisted_imports(
    id,owner_id,source_hash,options_hash,source_format,title,status,provider_model,
    source_words,source_tokens,source_bytes,operation_budget_microusd
  ) values (
    p_operation_id,p_user_id,p_source_hash,p_options_hash,p_source_format,btrim(p_title),'reserved',p_model,
    p_source_words,p_source_tokens,p_source_bytes,operation_budget
  );
  if operation_budget>200000 then
    update private.writer_assisted_import_budget_grants set
      status='consumed',consumed_at=clock_timestamp()
      where operation_id=p_operation_id;
  end if;
  return jsonb_build_object(
    'id',p_operation_id,'status','reserved','script_id',null,
    'operation_budget_microusd',operation_budget,'reused',false
  );
end;
$$;

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
language sql
security definer
set search_path = ''
as $$
  select public.writer_reserve_assisted_import(
    p_user_id,p_operation_id,p_source_hash,p_options_hash,p_source_format,p_title,
    p_source_words,p_source_tokens,p_source_bytes,p_model,200000::bigint
  )
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
  if p_max_cost_microusd<=0
    or op.actual_cost_microusd+op.reserved_cost_microusd+p_max_cost_microusd>op.operation_budget_microusd then
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

revoke all on function public.writer_grant_assisted_import_qa_budget(uuid,uuid,text,timestamptz),
  public.writer_revoke_assisted_import_qa_budget(uuid,uuid),
  public.writer_reserve_assisted_import(uuid,uuid,text,text,text,text,integer,integer,integer,text,bigint),
  public.writer_reserve_assisted_import(uuid,uuid,text,text,text,text,integer,integer,integer,text),
  public.writer_reserve_assisted_import_call(uuid,uuid,integer,text,bigint)
  from public,anon,authenticated;

grant execute on function public.writer_grant_assisted_import_qa_budget(uuid,uuid,text,timestamptz),
  public.writer_revoke_assisted_import_qa_budget(uuid,uuid),
  public.writer_reserve_assisted_import(uuid,uuid,text,text,text,text,integer,integer,integer,text,bigint),
  public.writer_reserve_assisted_import(uuid,uuid,text,text,text,text,integer,integer,integer,text),
  public.writer_reserve_assisted_import_call(uuid,uuid,integer,text,bigint)
  to service_role;

commit;
