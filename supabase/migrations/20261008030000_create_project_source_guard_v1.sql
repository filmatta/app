-- New Production plans must use sources owned by the same user and Project.
-- Legacy plans with null project_id remain editable until explicitly assigned.
create or replace function private.production_project_sources_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
declare source_project uuid;
begin
  if new.project_id is null then
    if tg_op='INSERT' then raise exception using errcode='23502', message='PRODUCTION_PROJECT_REQUIRED'; end if;
    return new;
  end if;
  if new.script_id is not null then
    select project_id into source_project from public.writer_scripts where id=new.script_id and owner_id=new.owner_id;
    if not found then raise exception using errcode='23503', message='PRODUCTION_SCRIPT_NOT_FOUND'; end if;
    if source_project is distinct from new.project_id then
      raise exception using errcode='23514', message='PRODUCTION_SCRIPT_PROJECT_MISMATCH';
    end if;
  end if;
  if new.shotlist_id is not null then
    select project_id into source_project from public.writer_shotlists where id=new.shotlist_id and owner_id=new.owner_id;
    if not found then raise exception using errcode='23503', message='PRODUCTION_SHOTLIST_NOT_FOUND'; end if;
    if source_project is distinct from new.project_id then
      raise exception using errcode='23514', message='PRODUCTION_SHOTLIST_PROJECT_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;
