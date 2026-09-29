begin;

-- The operation budget is an entitlement derived only from server-side policy.
-- The planned Terra reservation is checked against it, but never becomes it.
create or replace function public.writer_assisted_import_authorized_budget(
  p_user_id uuid,
  p_operation_id uuid,
  p_source_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.writer_assisted_imports%rowtype;
  budget_grant private.writer_assisted_import_budget_grants%rowtype;
begin
  if p_user_id is null or p_operation_id is null or p_source_hash !~ '^[0-9a-f]{64}$' then
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

  select * into budget_grant
    from private.writer_assisted_import_budget_grants
    where operation_id=p_operation_id;
  if not found then
    return jsonb_build_object(
      'authorized_budget_microusd',200000,
      'authorization','ordinary'
    );
  end if;
  if budget_grant.owner_id<>p_user_id
    or budget_grant.source_hash<>p_source_hash
    or budget_grant.status<>'active'
    or budget_grant.expires_at<=clock_timestamp() then
    raise exception using errcode='P0001', message='WRITER_IMPORT_BUDGET_AUTHORIZATION';
  end if;
  return jsonb_build_object(
    'authorized_budget_microusd',budget_grant.budget_microusd,
    'authorization','qa_grant'
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
    operation_budget := budget_grant.budget_microusd;
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

revoke all on function public.writer_assisted_import_authorized_budget(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.writer_assisted_import_authorized_budget(uuid,uuid,text)
  to service_role;

commit;
