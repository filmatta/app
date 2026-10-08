-- An existing Create Project can recover its Writer after the previous one is deleted.
create function public.writer_create_project_script_v1(
  p_project_id uuid,
  p_operation_id uuid,
  p_title text,
  p_document jsonb,
  p_schema_version integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
  fingerprint text;
  existing public.writer_operations%rowtype;
  created_id uuid;
begin
  if actor is null then raise exception using errcode='42501', message='WRITER_UNAUTHENTICATED'; end if;
  if p_project_id is null or p_operation_id is null then
    raise exception using errcode='22023', message='WRITER_OPERATION_REQUIRED';
  end if;
  perform private.writer_validate_payload(p_title, p_document, p_schema_version);
  perform 1 from public.projects where id=p_project_id and owner_id=actor and lifecycle_status<>'archived' for share;
  if not found then raise exception using errcode='42501', message='PROJECT_UNAVAILABLE'; end if;
  fingerprint := md5('create-project-v1|' || p_project_id::text || '|' || btrim(p_title) || '|' || p_schema_version::text || '|' || p_document::text);
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 8741));
  select * into existing from public.writer_operations where user_id=actor and operation_id=p_operation_id;
  if found then
    if existing.operation_kind<>'create' or existing.request_hash<>fingerprint then
      raise exception using errcode='22023', message='WRITER_OPERATION_REUSED';
    end if;
    return existing.script_id;
  end if;
  if (select count(*) from public.writer_scripts where owner_id=actor)>=3 then
    raise exception using errcode='P0001', message='WRITER_QUOTA_REACHED';
  end if;
  insert into public.writer_scripts(owner_id,project_id,title,document,schema_version)
  values(actor,p_project_id,btrim(p_title),p_document,p_schema_version)
  returning id into created_id;
  insert into public.writer_operations(user_id,operation_id,operation_kind,request_hash,script_id,result_revision)
  values(actor,p_operation_id,'create',fingerprint,created_id,1);
  return created_id;
end;
$$;
revoke all on function public.writer_create_project_script_v1(uuid,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.writer_create_project_script_v1(uuid,uuid,text,jsonb,integer) to authenticated;
