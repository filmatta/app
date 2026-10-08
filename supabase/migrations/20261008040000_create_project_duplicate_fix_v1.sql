-- Correct the Writer duplicate INSERT arity while retaining the source Project.
-- Duplication stays inside the source Project; legacy sources receive a new Project via the insert trigger.
create or replace function public.writer_duplicate_script(
  p_source_id uuid,
  p_operation_id uuid,
  p_title text
) returns table (
  id uuid,
  title text,
  document jsonb,
  schema_version integer,
  revision bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  fingerprint text;
  existing public.writer_operations%rowtype;
  source_script public.writer_scripts%rowtype;
  created public.writer_scripts%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'WRITER_UNAUTHENTICATED';
  end if;
  if p_operation_id is null or p_source_id is null then
    raise exception using errcode = '22023', message = 'WRITER_OPERATION_REQUIRED';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'WRITER_INVALID_TITLE';
  end if;
  fingerprint := md5('duplicate|' || p_source_id::text || '|' || btrim(p_title));
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 8741));

  select * into existing from public.writer_operations
  where user_id = current_user_id and operation_id = p_operation_id;
  if found then
    if existing.operation_kind <> 'duplicate' or existing.request_hash <> fingerprint then
      raise exception using errcode = '22023', message = 'WRITER_OPERATION_REUSED';
    end if;
    return query
      select s.id, s.title, s.document, s.schema_version, s.revision, s.created_at, s.updated_at
      from public.writer_scripts s
      where s.id = existing.script_id and s.owner_id = current_user_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'WRITER_OPERATION_TARGET_MISSING';
    end if;
    return;
  end if;

  select * into source_script from public.writer_scripts
  where writer_scripts.id = p_source_id and owner_id = current_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'WRITER_NOT_FOUND';
  end if;
  if (select count(*) from public.writer_scripts where owner_id = current_user_id) >= 3 then
    raise exception using errcode = 'P0001', message = 'WRITER_QUOTA_REACHED';
  end if;

  insert into public.writer_scripts (owner_id, project_id, title, document, schema_version)
  values (
    current_user_id,
    source_script.project_id,
    btrim(p_title),
    private.writer_rekey_document(source_script.document),
    source_script.schema_version
  ) returning * into created;

  insert into public.writer_operations
    (user_id, operation_id, operation_kind, request_hash, script_id, result_revision)
  values
    (current_user_id, p_operation_id, 'duplicate', fingerprint, created.id, created.revision);

  return query select created.id, created.title, created.document, created.schema_version,
    created.revision, created.created_at, created.updated_at;
end;
$$;
