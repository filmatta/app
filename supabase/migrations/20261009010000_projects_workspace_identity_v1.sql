-- Create an empty, private Project before any creative module is opened.
begin;

alter table public.projects
  add column entry_module text,
  add column cover_source text;

alter table public.projects
  add constraint projects_entry_module_v1_check
    check (entry_module is null or entry_module in ('writer', 'shotlist', 'storyboard', 'production')),
  add constraint projects_cover_source_v1_check
    check (cover_source is null or cover_source in ('uploaded', 'generated'));

create function public.create_workspace_project_v1(
  p_operation_id uuid,
  p_title text,
  p_entry_module text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  clean_title text := btrim(p_title);
  existing public.projects%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'PROJECT_UNAUTHENTICATED';
  end if;
  if p_operation_id is null or clean_title is null
    or char_length(clean_title) not between 1 and 160
    or p_entry_module is null
    or p_entry_module not in ('writer', 'shotlist', 'storyboard', 'production') then
    raise exception using errcode = '22023', message = 'PROJECT_CREATE_INVALID';
  end if;

  -- The operation UUID is also the Project UUID. An exact retry returns the
  -- same row without creating a Writer or any other artifact.
  insert into public.projects (
    id, owner_id, title, slug, lifecycle_status, visibility, status,
    create_enabled, entry_module
  ) values (
    p_operation_id, actor, clean_title,
    'create-workspace-' || replace(p_operation_id::text, '-', ''),
    'draft', 'private', 'draft', true, p_entry_module
  ) on conflict (id) do nothing;

  select * into existing from public.projects where id = p_operation_id;
  if not found or existing.owner_id is distinct from actor
    or existing.title is distinct from clean_title
    or existing.entry_module is distinct from p_entry_module
    or existing.create_enabled is distinct from true then
    raise exception using errcode = '22023', message = 'PROJECT_OPERATION_REUSED';
  end if;
  return existing.id;
end;
$$;

revoke all on function public.create_workspace_project_v1(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_workspace_project_v1(uuid, text, text) to authenticated;

-- Supabase Storage requires SELECT as well as DELETE to remove a file. Owners
-- may read their own Project prefix even after the database stops referencing
-- an old cover; public reads still require the exact current cover pointer.
alter policy project_covers_authorized_read on storage.objects using (
  bucket_id = 'project-covers'
  and (
    exists (
      select 1 from public.projects as project
      where project.id::text = split_part(name, '/', 2)
        and project.owner_id = (select auth.uid())
        and split_part(name, '/', 1) = project.owner_id::text
    )
    or exists (
      select 1 from public.projects as project
      where project.cover_image_path = name
        and name like project.owner_id::text || '/' || project.id::text || '/%'
        and not project.create_enabled
        and project.lifecycle_status = 'active'
        and project.visibility = 'public'
    )
  )
);

commit;
