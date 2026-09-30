-- Projects V1.5 private cover storage.
begin;

-- Private bucket: reads are authorized against the owning/public Project row.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-covers', 'project-covers', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy project_covers_authorized_read on storage.objects
for select to anon, authenticated using (
  bucket_id = 'project-covers'
  and exists (
    select 1 from public.projects as project
    where project.cover_image_path = name
      and (
        project.owner_id = (select auth.uid())
        or (project.lifecycle_status = 'active' and project.visibility = 'public')
      )
  )
);

create policy project_covers_owner_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'project-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.projects as project
    where project.id::text = (storage.foldername(name))[2]
      and project.owner_id = (select auth.uid())
  )
);

create policy project_covers_owner_update on storage.objects
for update to authenticated
using (bucket_id = 'project-covers' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (
  bucket_id = 'project-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.projects as project
    where project.id::text = (storage.foldername(name))[2]
      and project.owner_id = (select auth.uid())
  )
);

create policy project_covers_owner_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'project-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
