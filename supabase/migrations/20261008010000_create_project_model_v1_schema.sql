-- Project Model V1: additive Create context over the existing audiovisual projects table.
begin;

alter table public.writer_scripts add column project_id uuid;
alter table public.writer_shotlists add column project_id uuid;
alter table public.storyboard_panels add column project_id uuid;
alter table public.production_plans add column project_id uuid;

alter table public.writer_scripts add constraint writer_scripts_project_owner_fk
  foreign key (project_id, owner_id) references public.projects(id, owner_id)
  on delete no action deferrable initially deferred;
alter table public.writer_shotlists add constraint writer_shotlists_project_owner_fk
  foreign key (project_id, owner_id) references public.projects(id, owner_id)
  on delete no action deferrable initially deferred;
alter table public.storyboard_panels add constraint storyboard_panels_project_owner_fk
  foreign key (project_id, owner_id) references public.projects(id, owner_id)
  on delete no action deferrable initially deferred;
alter table public.production_plans add constraint production_plans_project_owner_fk
  foreign key (project_id, owner_id) references public.projects(id, owner_id)
  on delete no action deferrable initially deferred;

alter table public.writer_scripts add constraint writer_scripts_id_owner_project_unique unique(id, owner_id, project_id);
alter table public.writer_shotlists add constraint writer_shotlists_id_owner_project_unique unique(id, owner_id, project_id);
alter table public.writer_shotlists add constraint writer_shotlists_source_project_fk
  foreign key (script_id, owner_id, project_id) references public.writer_scripts(id, owner_id, project_id)
  on delete set null (script_id) deferrable initially deferred;
alter table public.storyboard_panels add constraint storyboard_panels_shotlist_project_fk
  foreign key (shotlist_id, owner_id, project_id) references public.writer_shotlists(id, owner_id, project_id)
  on delete cascade deferrable initially deferred;

create index writer_scripts_owner_project_updated_idx on public.writer_scripts(owner_id, project_id, updated_at desc) where project_id is not null;
create index writer_shotlists_owner_project_updated_idx on public.writer_shotlists(owner_id, project_id, updated_at desc) where project_id is not null;
create index storyboard_panels_owner_project_shotlist_idx on public.storyboard_panels(owner_id, project_id, shotlist_id) where project_id is not null;
create index production_plans_owner_project_updated_idx on public.production_plans(owner_id, project_id, updated_at desc) where project_id is not null;

create function private.create_writer_project_v1(p_owner uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid := gen_random_uuid();
begin
  if p_owner is null or p_name is null or char_length(btrim(p_name)) not between 1 and 160 then
    raise exception using errcode='22023', message='CREATE_PROJECT_INVALID';
  end if;
  insert into public.projects(id, owner_id, title, slug, lifecycle_status, visibility, status)
  values(result, p_owner, btrim(p_name), 'create-' || replace(result::text, '-', ''), 'draft', 'private', 'draft');
  return result;
end;
$$;
revoke all on function private.create_writer_project_v1(uuid, text) from public, anon, authenticated;

create function private.writer_new_project_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is null then
    new.project_id := private.create_writer_project_v1(new.owner_id, new.title);
  end if;
  return new;
end;
$$;
revoke all on function private.writer_new_project_v1() from public, anon, authenticated;
create trigger writer_scripts_new_project_v1 before insert on public.writer_scripts
for each row execute function private.writer_new_project_v1();

create function private.shotlist_new_project_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
declare source_project uuid; source_title text;
begin
  if new.script_id is not null then
    select project_id, title into source_project, source_title from public.writer_scripts
    where id=new.script_id and owner_id=new.owner_id for update;
    if not found then raise exception using errcode='23503', message='SHOTLIST_SOURCE_NOT_FOUND'; end if;
    if source_project is null then
      source_project := private.create_writer_project_v1(new.owner_id, source_title);
      update public.writer_scripts set project_id=source_project where id=new.script_id and owner_id=new.owner_id;
    end if;
    if new.project_id is null then new.project_id := source_project; end if;
    if new.project_id is distinct from source_project then
      raise exception using errcode='23514', message='SHOTLIST_PROJECT_MISMATCH';
    end if;
  end if;
  if new.project_id is null then raise exception using errcode='23502', message='SHOTLIST_PROJECT_REQUIRED'; end if;
  return new;
end;
$$;
revoke all on function private.shotlist_new_project_v1() from public, anon, authenticated;
create trigger writer_shotlists_new_project_v1 before insert on public.writer_shotlists
for each row execute function private.shotlist_new_project_v1();

create function private.storyboard_new_project_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
declare source_project uuid;
begin
  select project_id into source_project from public.writer_shotlists
  where id=new.shotlist_id and owner_id=new.owner_id;
  if not found then raise exception using errcode='23503', message='STORYBOARD_SHOTLIST_NOT_FOUND'; end if;
  if source_project is null then raise exception using errcode='23502', message='STORYBOARD_PROJECT_REQUIRED'; end if;
  if new.project_id is null then new.project_id := source_project; end if;
  if new.project_id is distinct from source_project then
    raise exception using errcode='23514', message='STORYBOARD_PROJECT_MISMATCH';
  end if;
  return new;
end;
$$;
revoke all on function private.storyboard_new_project_v1() from public, anon, authenticated;
create trigger storyboard_panels_new_project_v1 before insert on public.storyboard_panels
for each row execute function private.storyboard_new_project_v1();

create function private.production_project_sources_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
declare source_project uuid;
begin
  if new.project_id is null then
    if tg_op='INSERT' then raise exception using errcode='23502', message='PRODUCTION_PROJECT_REQUIRED'; end if;
    return new; -- Existing legacy plans may still be edited before explicit assignment.
  end if;
  if new.script_id is not null then
    select project_id into source_project from public.writer_scripts where id=new.script_id and owner_id=new.owner_id;
    if found and source_project is distinct from new.project_id then
      raise exception using errcode='23514', message='PRODUCTION_SCRIPT_PROJECT_MISMATCH';
    end if;
  end if;
  if new.shotlist_id is not null then
    select project_id into source_project from public.writer_shotlists where id=new.shotlist_id and owner_id=new.owner_id;
    if found and source_project is distinct from new.project_id then
      raise exception using errcode='23514', message='PRODUCTION_SHOTLIST_PROJECT_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.production_project_sources_v1() from public, anon, authenticated;
create trigger production_plans_project_sources_v1 before insert or update of project_id, script_id, shotlist_id on public.production_plans
for each row execute function private.production_project_sources_v1();

create function private.create_project_stable_v1() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.project_id is not null and new.project_id is distinct from old.project_id then
    raise exception using errcode='23514', message='CREATE_PROJECT_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function private.create_project_stable_v1() from public, anon, authenticated;
create trigger writer_scripts_project_stable_v1 before update of project_id on public.writer_scripts
for each row execute function private.create_project_stable_v1();
create trigger writer_shotlists_project_stable_v1 before update of project_id on public.writer_shotlists
for each row execute function private.create_project_stable_v1();
create trigger storyboard_panels_project_stable_v1 before update of project_id on public.storyboard_panels
for each row execute function private.create_project_stable_v1();
create trigger production_plans_project_stable_v1 before update of project_id on public.production_plans
for each row execute function private.create_project_stable_v1();

-- Existing RLS remains in force. The composite FKs bind every Project to the artifact owner.
comment on column public.writer_scripts.project_id is 'Canonical Create Project; null only for audited legacy rows.';
comment on column public.writer_shotlists.project_id is 'Canonical Create Project; script_id remains the specific Writer source.';
comment on column public.storyboard_panels.project_id is 'Canonical Create Project of the parent Shotlist.';
comment on column public.production_plans.project_id is 'Canonical Create Project; source references remain soft.';

create function public.writer_create_project_shotlist_v1(
  p_project_id uuid, p_script_id uuid, p_title text, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
  source_script public.writer_scripts%rowtype;
  existing public.writer_shotlists%rowtype;
  created_id uuid; block jsonb; scene_position integer := 0; scene_title text;
begin
  if actor is null then raise exception using errcode='42501', message='WRITER_UNAUTHENTICATED'; end if;
  if p_project_id is null or p_operation_id is null or p_title is null or char_length(btrim(p_title)) not between 1 and 160 then
    raise exception using errcode='22023', message='SHOTLIST_INVALID_CREATE';
  end if;
  perform 1 from public.projects where id=p_project_id and owner_id=actor and lifecycle_status<>'archived' for share;
  if not found then raise exception using errcode='42501', message='PROJECT_UNAVAILABLE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 42177));
  select * into existing from public.writer_shotlists where owner_id=actor and creation_operation_id=p_operation_id;
  if found then
    if existing.project_id is distinct from p_project_id or existing.script_id is distinct from p_script_id then
      raise exception using errcode='22023', message='SHOTLIST_OPERATION_REUSED';
    end if;
    return existing.id;
  end if;
  if p_script_id is not null then
    select * into source_script from public.writer_scripts where id=p_script_id and owner_id=actor for share;
    if not found or source_script.project_id is distinct from p_project_id then
      raise exception using errcode='23514', message='SHOTLIST_PROJECT_MISMATCH';
    end if;
  end if;
  insert into public.writer_shotlists(owner_id,project_id,script_id,title,source_revision,creation_operation_id)
  values(actor,p_project_id,p_script_id,btrim(p_title),case when p_script_id is null then null else source_script.revision end,p_operation_id)
  returning id into created_id;
  if p_script_id is not null then
    for block in select value from jsonb_array_elements(source_script.document->'content') loop
      if block->>'type'='screenplayBlock' and block#>>'{attrs,kind}'='sceneHeading' then
        scene_title := nullif(btrim(private.writer_production_block_text(block)), '');
        insert into public.writer_shotlist_groups(owner_id,shotlist_id,source_scene_id,source_scene_title,title,position,source_status,creation_operation_id)
        values(actor,created_id,(block#>>'{attrs,id}')::uuid,scene_title,coalesce(scene_title,'Escena sin encabezado'),scene_position,'linked',gen_random_uuid());
        scene_position := scene_position + 1;
      end if;
    end loop;
  end if;
  if scene_position=0 then
    insert into public.writer_shotlist_groups(owner_id,shotlist_id,title,position,source_status,creation_operation_id)
    values(actor,created_id,'Escena manual',0,'manual',gen_random_uuid());
  end if;
  return created_id;
end;
$$;
revoke all on function public.writer_create_project_shotlist_v1(uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.writer_create_project_shotlist_v1(uuid,uuid,text,uuid) to authenticated;
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

commit;
