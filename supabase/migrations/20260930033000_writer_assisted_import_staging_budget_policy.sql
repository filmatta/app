begin;

-- Historical rows keep their persisted budget. The new value is available only
-- to the server-selected staging policy; it is not inferred from plan cost.
alter table public.writer_assisted_imports
  drop constraint writer_assisted_import_operation_budget_check;

alter table public.writer_assisted_imports
  add constraint writer_assisted_import_operation_budget_check
    check (operation_budget_microusd in (200000, 600000, 3000000));

create or replace function public.writer_assisted_import_authorized_budget(
  p_user_id uuid,
  p_operation_id uuid,
  p_source_hash text,
  p_ordinary_budget_microusd bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.writer_assisted_imports%rowtype;
  budget_grant private.writer_assisted_import_budget_grants%rowtype;
  authorized_budget bigint;
  authorization_kind text := 'ordinary';
begin
  if p_user_id is null or p_operation_id is null
    or p_source_hash !~ '^[0-9a-f]{64}$'
    or p_ordinary_budget_microusd not in (200000, 3000000) then
    raise exception using errcode='22023', message='WRITER_IMPORT_INVALID';
  end if;

  select * into existing
    from public.writer_assisted_imports
    where id=p_operation_id;
  if found then
    if existing.owner_id<>p_user_id or existing.source_hash<>p_source_hash then
      raise exception using errcode='22023', message='WRITER_IMPORT_OPERATION_REUSED';
    end if;
    return jsonb_build_object(
      'authorized_budget_microusd',existing.operation_budget_microusd,
      'authorization','persisted_operation'
    );
  end if;

  authorized_budget := p_ordinary_budget_microusd;
  select * into budget_grant
    from private.writer_assisted_import_budget_grants
    where operation_id=p_operation_id;
  if found then
    if budget_grant.owner_id<>p_user_id
      or budget_grant.source_hash<>p_source_hash
      or budget_grant.status<>'active'
      or budget_grant.expires_at<=clock_timestamp() then
      raise exception using errcode='P0001', message='WRITER_IMPORT_BUDGET_AUTHORIZATION';
    end if;
    if budget_grant.budget_microusd>authorized_budget then
      authorized_budget := budget_grant.budget_microusd;
      authorization_kind := 'qa_grant';
    end if;
  end if;

  return jsonb_build_object(
    'authorized_budget_microusd',authorized_budget,
    'authorization',authorization_kind
  );
end;
$$;

create or replace function public.writer_assisted_import_authorized_budget(
  p_user_id uuid,
  p_operation_id uuid,
  p_source_hash text
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.writer_assisted_import_authorized_budget(
    p_user_id,p_operation_id,p_source_hash,200000::bigint
  )
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
  p_maximum_plan_cost_microusd bigint,
  p_ordinary_budget_microusd bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.writer_assisted_imports%rowtype;
  budget_grant private.writer_assisted_import_budget_grants%rowtype;
  operation_budget bigint := p_ordinary_budget_microusd;
  attempts integer;
  grant_present boolean := false;
begin
  if p_user_id is null or p_operation_id is null
    or p_ordinary_budget_microusd not in (200000, 3000000)
    or p_maximum_plan_cost_microusd<=0 or p_maximum_plan_cost_microusd>3000000 then
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

  select * into budget_grant
    from private.writer_assisted_import_budget_grants
    where operation_id=p_operation_id
    for update;
  if found then
    if budget_grant.owner_id<>p_user_id
      or budget_grant.source_hash<>p_source_hash
      or budget_grant.status<>'active'
      or budget_grant.expires_at<=clock_timestamp() then
      raise exception using errcode='P0001', message='WRITER_IMPORT_BUDGET_AUTHORIZATION';
    end if;
    operation_budget := greatest(operation_budget,budget_grant.budget_microusd);
    grant_present := true;
  end if;
  if p_maximum_plan_cost_microusd>operation_budget then
    raise exception using errcode='P0001', message='WRITER_IMPORT_BUDGET';
  end if;

  insert into public.writer_assisted_imports(
    id,owner_id,source_hash,options_hash,source_format,title,status,provider_model,
    source_words,source_tokens,source_bytes,operation_budget_microusd
  ) values (
    p_operation_id,p_user_id,p_source_hash,p_options_hash,p_source_format,btrim(p_title),'reserved',p_model,
    p_source_words,p_source_tokens,p_source_bytes,operation_budget
  );
  if grant_present then
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
  p_model text,
  p_maximum_plan_cost_microusd bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_maximum_plan_cost_microusd<=0 or p_maximum_plan_cost_microusd>600000 then
    raise exception using errcode='22023', message='WRITER_IMPORT_INVALID';
  end if;
  return public.writer_reserve_assisted_import(
    p_user_id,p_operation_id,p_source_hash,p_options_hash,p_source_format,p_title,
    p_source_words,p_source_tokens,p_source_bytes,p_model,p_maximum_plan_cost_microusd,200000::bigint
  );
end
$$;

create or replace function public.writer_reserve_assisted_import_call(
  p_user_id uuid,
  p_operation_id uuid,
  p_batch_index integer,
  p_request_hash text,
  p_max_cost_microusd bigint,
  p_global_budget_microusd bigint
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
  if p_global_budget_microusd not in (2000000,10000000) then
    raise exception using errcode='22023', message='WRITER_IMPORT_INVALID';
  end if;
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
  if global_committed+p_max_cost_microusd>p_global_budget_microusd then
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

create or replace function public.writer_reserve_assisted_import_call(
  p_user_id uuid,
  p_operation_id uuid,
  p_batch_index integer,
  p_request_hash text,
  p_max_cost_microusd bigint
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.writer_reserve_assisted_import_call(
    p_user_id,p_operation_id,p_batch_index,p_request_hash,p_max_cost_microusd,2000000::bigint
  )
$$;

revoke all on function public.writer_assisted_import_authorized_budget(uuid,uuid,text,bigint),
  public.writer_assisted_import_authorized_budget(uuid,uuid,text),
  public.writer_reserve_assisted_import(uuid,uuid,text,text,text,text,integer,integer,integer,text,bigint,bigint),
  public.writer_reserve_assisted_import(uuid,uuid,text,text,text,text,integer,integer,integer,text,bigint),
  public.writer_reserve_assisted_import_call(uuid,uuid,integer,text,bigint,bigint),
  public.writer_reserve_assisted_import_call(uuid,uuid,integer,text,bigint)
  from public,anon,authenticated;

grant execute on function public.writer_assisted_import_authorized_budget(uuid,uuid,text,bigint),
  public.writer_assisted_import_authorized_budget(uuid,uuid,text),
  public.writer_reserve_assisted_import(uuid,uuid,text,text,text,text,integer,integer,integer,text,bigint,bigint),
  public.writer_reserve_assisted_import(uuid,uuid,text,text,text,text,integer,integer,integer,text,bigint),
  public.writer_reserve_assisted_import_call(uuid,uuid,integer,text,bigint,bigint),
  public.writer_reserve_assisted_import_call(uuid,uuid,integer,text,bigint)
  to service_role;

commit;
