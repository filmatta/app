begin;

create table public.writer_scripts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  document jsonb not null,
  schema_version integer not null default 1,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint writer_scripts_title_length check (char_length(title) between 1 and 160),
  constraint writer_scripts_document_object check (jsonb_typeof(document) = 'object'),
  constraint writer_scripts_schema_version_positive check (schema_version > 0),
  constraint writer_scripts_revision_positive check (revision > 0)
);

create index writer_scripts_owner_updated_idx
  on public.writer_scripts (owner_id, updated_at desc);

create table public.writer_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  operation_kind text not null check (operation_kind in ('create', 'duplicate', 'save', 'rename')),
  request_hash text not null,
  script_id uuid references public.writer_scripts(id) on delete cascade,
  result_revision bigint,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

create index writer_operations_created_idx on public.writer_operations (created_at);

alter table public.writer_scripts enable row level security;
alter table public.writer_operations enable row level security;

revoke all on public.writer_scripts, public.writer_operations from public, anon, authenticated;
grant select on public.writer_scripts to authenticated;

create policy writer_scripts_owner_read
  on public.writer_scripts
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create or replace function private.writer_validate_payload(
  p_title text,
  p_document jsonb,
  p_schema_version integer
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'WRITER_INVALID_TITLE';
  end if;
  if p_schema_version <> 1 then
    raise exception using errcode = '22023', message = 'WRITER_UNSUPPORTED_SCHEMA';
  end if;
  if p_document is null
    or jsonb_typeof(p_document) <> 'object'
    or p_document->>'type' is distinct from 'doc'
    or jsonb_typeof(p_document->'content') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'WRITER_INVALID_DOCUMENT';
  end if;
  if jsonb_array_length(p_document->'content') > 10000
    or octet_length(p_document::text) > 2000000 then
    raise exception using errcode = '22023', message = 'WRITER_DOCUMENT_TOO_LARGE';
  end if;
end;
$$;

revoke all on function private.writer_validate_payload(text, jsonb, integer)
  from public, anon, authenticated;

create or replace function private.writer_rekey_document(p_document jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  item jsonb;
  rewritten jsonb := '[]'::jsonb;
begin
  for item in select value from jsonb_array_elements(p_document->'content') loop
    if item->>'type' = 'screenplayBlock' then
      item := jsonb_set(item, '{attrs,id}', to_jsonb(gen_random_uuid()::text), true);
    end if;
    rewritten := rewritten || jsonb_build_array(item);
  end loop;
  return jsonb_set(p_document, '{content}', rewritten, true);
end;
$$;

revoke all on function private.writer_rekey_document(jsonb)
  from public, anon, authenticated;

create or replace function public.writer_create_script(
  p_operation_id uuid,
  p_title text,
  p_document jsonb,
  p_schema_version integer
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
  created public.writer_scripts%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'WRITER_UNAUTHENTICATED';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'WRITER_OPERATION_REQUIRED';
  end if;
  perform private.writer_validate_payload(p_title, p_document, p_schema_version);
  fingerprint := md5('create|' || btrim(p_title) || '|' || p_schema_version::text || '|' || p_document::text);
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 8741));

  select * into existing from public.writer_operations
  where user_id = current_user_id and operation_id = p_operation_id;
  if found then
    if existing.operation_kind <> 'create' or existing.request_hash <> fingerprint then
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

  if (select count(*) from public.writer_scripts where owner_id = current_user_id) >= 3 then
    raise exception using errcode = 'P0001', message = 'WRITER_QUOTA_REACHED';
  end if;

  insert into public.writer_scripts (owner_id, title, document, schema_version)
  values (current_user_id, btrim(p_title), p_document, p_schema_version)
  returning * into created;

  insert into public.writer_operations
    (user_id, operation_id, operation_kind, request_hash, script_id, result_revision)
  values
    (current_user_id, p_operation_id, 'create', fingerprint, created.id, created.revision);

  return query select created.id, created.title, created.document, created.schema_version,
    created.revision, created.created_at, created.updated_at;
end;
$$;

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

  insert into public.writer_scripts (owner_id, title, document, schema_version)
  values (
    current_user_id,
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

create or replace function public.writer_save_script(
  p_script_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_title text,
  p_document jsonb,
  p_schema_version integer
) returns table (revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  fingerprint text;
  existing public.writer_operations%rowtype;
  saved public.writer_scripts%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'WRITER_UNAUTHENTICATED';
  end if;
  if p_operation_id is null or p_script_id is null or p_expected_revision is null then
    raise exception using errcode = '22023', message = 'WRITER_OPERATION_REQUIRED';
  end if;
  perform private.writer_validate_payload(p_title, p_document, p_schema_version);
  fingerprint := md5('save|' || p_script_id::text || '|' || p_expected_revision::text || '|' ||
    btrim(p_title) || '|' || p_schema_version::text || '|' || p_document::text);

  select * into existing from public.writer_operations
  where user_id = current_user_id and operation_id = p_operation_id;
  if found then
    if existing.operation_kind <> 'save' or existing.request_hash <> fingerprint then
      raise exception using errcode = '22023', message = 'WRITER_OPERATION_REUSED';
    end if;
    return query select existing.result_revision, existing.created_at;
    return;
  end if;

  update public.writer_scripts
  set title = btrim(p_title),
      document = p_document,
      schema_version = p_schema_version,
      revision = writer_scripts.revision + 1,
      updated_at = now()
  where writer_scripts.id = p_script_id
    and owner_id = current_user_id
    and writer_scripts.revision = p_expected_revision
  returning * into saved;

  if not found then
    if exists (select 1 from public.writer_scripts where id = p_script_id and owner_id = current_user_id) then
      raise exception using errcode = 'P0001', message = 'WRITER_REVISION_CONFLICT';
    end if;
    raise exception using errcode = 'P0001', message = 'WRITER_NOT_FOUND';
  end if;

  insert into public.writer_operations
    (user_id, operation_id, operation_kind, request_hash, script_id, result_revision)
  values
    (current_user_id, p_operation_id, 'save', fingerprint, saved.id, saved.revision);

  delete from public.writer_operations
  where user_id = current_user_id and created_at < now() - interval '7 days';

  return query select saved.revision, saved.updated_at;
end;
$$;

create or replace function public.writer_rename_script(
  p_script_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_title text
) returns table (revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  fingerprint text;
  existing public.writer_operations%rowtype;
  saved public.writer_scripts%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'WRITER_UNAUTHENTICATED';
  end if;
  if p_operation_id is null or p_script_id is null or p_expected_revision is null
    or p_title is null or char_length(btrim(p_title)) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'WRITER_INVALID_RENAME';
  end if;
  fingerprint := md5('rename|' || p_script_id::text || '|' || p_expected_revision::text || '|' || btrim(p_title));

  select * into existing from public.writer_operations
  where user_id = current_user_id and operation_id = p_operation_id;
  if found then
    if existing.operation_kind <> 'rename' or existing.request_hash <> fingerprint then
      raise exception using errcode = '22023', message = 'WRITER_OPERATION_REUSED';
    end if;
    return query select existing.result_revision, existing.created_at;
    return;
  end if;

  update public.writer_scripts
  set title = btrim(p_title), revision = writer_scripts.revision + 1, updated_at = now()
  where writer_scripts.id = p_script_id
    and owner_id = current_user_id
    and writer_scripts.revision = p_expected_revision
  returning * into saved;
  if not found then
    if exists (select 1 from public.writer_scripts where id = p_script_id and owner_id = current_user_id) then
      raise exception using errcode = 'P0001', message = 'WRITER_REVISION_CONFLICT';
    end if;
    raise exception using errcode = 'P0001', message = 'WRITER_NOT_FOUND';
  end if;
  insert into public.writer_operations
    (user_id, operation_id, operation_kind, request_hash, script_id, result_revision)
  values
    (current_user_id, p_operation_id, 'rename', fingerprint, saved.id, saved.revision);
  return query select saved.revision, saved.updated_at;
end;
$$;

create or replace function public.writer_delete_script(
  p_script_id uuid,
  p_expected_revision bigint
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'WRITER_UNAUTHENTICATED';
  end if;
  delete from public.writer_scripts
  where id = p_script_id and owner_id = current_user_id and revision = p_expected_revision;
  if found then return true; end if;
  if exists (select 1 from public.writer_scripts where id = p_script_id and owner_id = current_user_id) then
    raise exception using errcode = 'P0001', message = 'WRITER_REVISION_CONFLICT';
  end if;
  return false;
end;
$$;

revoke all on function public.writer_create_script(uuid, text, jsonb, integer),
  public.writer_duplicate_script(uuid, uuid, text),
  public.writer_save_script(uuid, bigint, uuid, text, jsonb, integer),
  public.writer_rename_script(uuid, bigint, uuid, text),
  public.writer_delete_script(uuid, bigint)
  from public, anon, authenticated;

grant execute on function public.writer_create_script(uuid, text, jsonb, integer),
  public.writer_duplicate_script(uuid, uuid, text),
  public.writer_save_script(uuid, bigint, uuid, text, jsonb, integer),
  public.writer_rename_script(uuid, bigint, uuid, text),
  public.writer_delete_script(uuid, bigint)
  to authenticated;

commit;
