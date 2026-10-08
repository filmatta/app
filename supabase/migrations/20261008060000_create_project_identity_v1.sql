-- Existing public.projects also serves other product surfaces. Mark Create containers explicitly.
alter table public.projects add column create_enabled boolean not null default false;

update public.projects p set create_enabled=true
where exists (select 1 from public.writer_scripts w where w.project_id=p.id)
   or exists (select 1 from public.writer_shotlists s where s.project_id=p.id)
   or exists (select 1 from public.production_plans r where r.project_id=p.id);

create index projects_owner_create_updated_idx on public.projects(owner_id,updated_at desc)
where create_enabled=true;

create or replace function private.create_writer_project_v1(p_owner uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid := gen_random_uuid();
begin
  if p_owner is null or p_name is null or char_length(btrim(p_name)) not between 1 and 160 then
    raise exception using errcode='22023', message='CREATE_PROJECT_INVALID';
  end if;
  insert into public.projects(id,owner_id,title,slug,lifecycle_status,visibility,status,create_enabled)
  values(result,p_owner,btrim(p_name),'create-' || replace(result::text,'-',''),'draft','private','draft',true);
  return result;
end;
$$;

create function private.mark_create_project_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is not null then
    update public.projects set create_enabled=true
    where id=new.project_id and owner_id=new.owner_id and create_enabled=false;
  end if;
  return new;
end;
$$;
revoke all on function private.mark_create_project_v1() from public,anon,authenticated;
create trigger writer_scripts_mark_create_project_v1 after insert or update of project_id on public.writer_scripts
for each row execute function private.mark_create_project_v1();
create trigger writer_shotlists_mark_create_project_v1 after insert or update of project_id on public.writer_shotlists
for each row execute function private.mark_create_project_v1();
create trigger production_plans_mark_create_project_v1 after insert or update of project_id on public.production_plans
for each row execute function private.mark_create_project_v1();
