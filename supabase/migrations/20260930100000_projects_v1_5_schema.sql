-- Projects V1.5 schema: explicit lifecycle/visibility and optional Opportunity links.
begin;

alter table public.projects
  add column description text,
  add column cover_image_path text,
  add column starts_on date,
  add column ends_on date,
  add column dates_confirmed boolean not null default false,
  add column lifecycle_status text not null default 'draft',
  add column visibility text not null default 'private';

update public.projects
set lifecycle_status = case
    when status = 'archived' then 'archived'
    when status = 'published' then 'active'
    else 'draft'
  end,
  visibility = case when status = 'published' then 'public' else 'private' end;

alter table public.projects
  add constraint projects_description_v15_check check (
    description is null
    or (description ~ '[^[:space:]]' and char_length(description) <= 20000)
  ),
  add constraint projects_cover_path_v15_check check (
    cover_image_path is null
    or (cover_image_path = btrim(cover_image_path) and cover_image_path ~ '[^[:space:]]' and char_length(cover_image_path) <= 1024)
  ),
  add constraint projects_dates_v15_check check (
    (starts_on is null or (isfinite(starts_on) and starts_on between date '2000-01-01' and date '2200-12-31'))
    and (ends_on is null or (isfinite(ends_on) and ends_on between date '2000-01-01' and date '2200-12-31'))
    and (starts_on is null or ends_on is null or ends_on >= starts_on)
  ),
  add constraint projects_lifecycle_v15_check check (lifecycle_status in ('draft','active','archived')),
  add constraint projects_visibility_v15_check check (visibility in ('private','public')),
  add constraint projects_state_visibility_v15_check check (
    (lifecycle_status = 'active' or visibility = 'private')
    and (lifecycle_status <> 'archived' or visibility = 'private')
  );

-- Preserve the historical contact-context flag without coupling it to public
-- visibility. Existing project IDs and contact snapshots remain intact.
alter table public.projects drop constraint projects_v0_fields;
alter table public.projects add constraint projects_v0_fields check (
  project_type in ('Cortometraje','Largometraje','Series','Documental','Publicidad','Videoclip','Contenido digital','Eventos','Fotografía','Institucional','Educativo','Proyecto estudiantil','Live session','Otro')
  and client_type in ('Artista','Marca','Agencia','Productora','Proyecto personal','Institución','Otro')
  and length(client_name) <= 120 and length(city) <= 80 and length(work_area) <= 80 and length(date_window) <= 100
  and shooting_schedule in ('day','night','mixed') and economic_mode in ('paid','collaboration','undecided')
  and cardinality(roles) <= 16
  and roles <@ array['Dirección','Producción','Dirección de fotografía','Cámara','Iluminación','Sonido','Dirección de arte','Edición','Color','VFX','Animación','Actuación','Modelaje','Guion','Música','Foto fija']::text[]
);

create function private.sync_project_v15_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' and new.lifecycle_status = 'draft' and new.visibility = 'private' then
      new.lifecycle_status := 'active';
      new.visibility := 'public';
    elsif new.status = 'archived' then
      new.lifecycle_status := 'archived';
      new.visibility := 'private';
    else
      new.status := case when new.lifecycle_status = 'archived' then 'archived' when new.visibility = 'public' then 'published' else 'draft' end;
    end if;
  elsif new.lifecycle_status is distinct from old.lifecycle_status or new.visibility is distinct from old.visibility then
    new.status := case when new.lifecycle_status = 'archived' then 'archived' when new.visibility = 'public' then 'published' else 'draft' end;
  elsif new.status is distinct from old.status then
    new.lifecycle_status := case when new.status = 'archived' then 'archived' when new.status = 'published' then 'active' else 'draft' end;
    new.visibility := case when new.status = 'published' then 'public' else 'private' end;
  else
    new.status := case when new.lifecycle_status = 'archived' then 'archived' when new.visibility = 'public' then 'published' else 'draft' end;
  end if;

  if new.lifecycle_status <> 'active' then
    new.visibility := 'private';
    new.status := case when new.lifecycle_status = 'archived' then 'archived' else 'draft' end;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_project_v15_state() from public, anon, authenticated;
create trigger projects_a_v15_sync_state before insert or update on public.projects
for each row execute function private.sync_project_v15_state();

alter policy projects_public_read on public.projects
using (lifecycle_status = 'active' and visibility = 'public');

create index projects_public_v15_idx on public.projects (published_at desc, id)
where lifecycle_status = 'active' and visibility = 'public';
create index projects_owner_v15_idx on public.projects (owner_id, lifecycle_status, visibility, updated_at desc);

-- Opportunities can stand alone. The composite FK continues to guarantee
-- common ownership whenever a Project is linked.
alter table public.opportunities alter column project_id drop not null;
alter table public.opportunities add constraint opportunities_owner_user_fk
  foreign key (owner_id)
  references auth.users (id)
  on delete cascade;
alter table public.opportunities drop constraint opportunities_project_owner_fk;
alter table public.opportunities add constraint opportunities_project_owner_fk
  foreign key (project_id, owner_id)
  references public.projects (id, owner_id)
  on update restrict
  on delete restrict;

drop policy opportunities_public_read on public.opportunities;
create policy opportunities_public_read on public.opportunities
for select to anon, authenticated using (status = 'published');

drop policy opportunities_owner_insert on public.opportunities;
create policy opportunities_owner_insert on public.opportunities
for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and (project_id is null or exists (
    select 1 from public.projects as project
    where project.id = opportunities.project_id
      and project.owner_id = (select auth.uid())
      and project.lifecycle_status <> 'archived'
  ))
);

drop policy opportunities_owner_update on public.opportunities;
create policy opportunities_owner_update on public.opportunities
for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (project_id is null or exists (
    select 1 from public.projects as project
    where project.id = opportunities.project_id
      and project.owner_id = (select auth.uid())
  ))
);

commit;
