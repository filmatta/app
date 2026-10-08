-- Project Model V1: only graph-connected Writer roots are assigned automatically.
begin;

insert into public.projects(id, owner_id, title, slug, lifecycle_status, visibility, status)
select gen_random_uuid(), w.owner_id, w.title,
  'create-writer-v1-' || replace(w.id::text, '-', ''), 'draft', 'private', 'draft'
from public.writer_scripts w
where w.project_id is null
  and exists (
    select 1 from public.writer_shotlists sl
    where sl.script_id=w.id and sl.owner_id=w.owner_id
  )
on conflict (slug) do nothing;

update public.writer_scripts w
set project_id=p.id
from public.projects p
where w.project_id is null
  and p.slug='create-writer-v1-' || replace(w.id::text, '-', '')
  and p.owner_id=w.owner_id and p.title=w.title
  and p.lifecycle_status='draft' and p.visibility='private'
  and exists (
    select 1 from public.writer_shotlists sl
    where sl.script_id=w.id and sl.owner_id=w.owner_id
  );

update public.writer_shotlists sl
set project_id=w.project_id
from public.writer_scripts w
where sl.project_id is null and sl.script_id=w.id and sl.owner_id=w.owner_id
  and w.project_id is not null;

update public.storyboard_panels sp
set project_id=sl.project_id
from public.writer_shotlists sl
where sp.project_id is null and sp.shotlist_id=sl.id and sp.owner_id=sl.owner_id
  and sl.project_id is not null;

-- Preserve the soft source IDs. A plan is assigned only when every present source
-- resolves to the same owned Project; contradictory or parentless plans stay null.
update public.production_plans p
set project_id=coalesce(w.project_id, sl.project_id)
from public.writer_scripts w
left join public.writer_shotlists sl on sl.script_id=w.id and sl.owner_id=w.owner_id
where p.project_id is null and p.script_id=w.id and p.owner_id=w.owner_id
  and (p.shotlist_id is null or (sl.id=p.shotlist_id and sl.project_id=w.project_id))
  and w.project_id is not null;

update public.production_plans p
set project_id=sl.project_id
from public.writer_shotlists sl
where p.project_id is null and p.script_id is null and p.shotlist_id=sl.id
  and p.owner_id=sl.owner_id and sl.project_id is not null;

commit;
