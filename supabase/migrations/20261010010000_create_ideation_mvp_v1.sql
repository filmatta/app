begin;

alter table public.create_idea_drafts
  add column analysis jsonb,
  add column analysis_hash text,
  add column synthesis jsonb,
  add column synthesis_hash text,
  add column prepare_operation_id uuid,
  add column prepare_project_name text,
  add column project_id uuid references public.projects(id) on delete set null,
  add column writer_id uuid references public.writer_scripts(id) on delete set null,
  add column archived_at timestamptz;

drop index public.create_idea_drafts_one_active_per_owner;
create unique index create_idea_drafts_one_active_per_owner on public.create_idea_drafts(owner_id) where archived_at is null;
create index create_idea_drafts_archive_owner_idx on public.create_idea_drafts(owner_id, archived_at desc) where archived_at is not null;

alter table public.create_idea_drafts drop constraint create_idea_drafts_step_check;
alter table public.create_idea_drafts add constraint create_idea_drafts_step_check
  check (current_step in ('capture','detail','ready','review','project_name'));
alter table public.create_idea_drafts add constraint create_idea_drafts_analysis_object
  check (analysis is null or jsonb_typeof(analysis) = 'object');
alter table public.create_idea_drafts add constraint create_idea_drafts_synthesis_object
  check (synthesis is null or jsonb_typeof(synthesis) = 'object');
alter table public.create_idea_drafts add constraint create_idea_drafts_prepare_name_length
  check (prepare_project_name is null or char_length(prepare_project_name) between 1 and 160);

drop policy create_idea_drafts_owner_insert on public.create_idea_drafts;
drop policy create_idea_drafts_owner_update on public.create_idea_drafts;
create policy create_idea_drafts_owner_insert on public.create_idea_drafts for insert to authenticated with check (
  owner_id = (select auth.uid()) and (project_id is null or exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  )) and (writer_id is null or exists (
    select 1 from public.writer_scripts w where w.id = writer_id and w.owner_id = (select auth.uid()) and w.project_id = project_id
  ))
);
create policy create_idea_drafts_owner_update on public.create_idea_drafts for update to authenticated using (
  owner_id = (select auth.uid())
) with check (
  owner_id = (select auth.uid()) and (project_id is null or exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  )) and (writer_id is null or exists (
    select 1 from public.writer_scripts w where w.id = writer_id and w.owner_id = (select auth.uid()) and w.project_id = project_id
  ))
);

create table public.create_ideation_guides (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  writer_id uuid references public.writer_scripts(id) on delete set null,
  source_draft_id uuid references public.create_idea_drafts(id) on delete set null,
  context jsonb not null,
  synthesis jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint create_ideation_guides_context_object check (jsonb_typeof(context) = 'object'),
  constraint create_ideation_guides_synthesis_object check (jsonb_typeof(synthesis) = 'object'),
  constraint create_ideation_guides_one_per_project unique (project_id)
);

create index create_ideation_guides_owner_idx on public.create_ideation_guides(owner_id);
create index create_ideation_guides_writer_idx on public.create_ideation_guides(writer_id) where writer_id is not null;

alter table public.create_ideation_guides enable row level security;
revoke all on public.create_ideation_guides from public, anon;
grant select, insert, update on public.create_ideation_guides to authenticated;
create policy create_ideation_guides_owner_select on public.create_ideation_guides for select to authenticated using (owner_id = (select auth.uid()));
create policy create_ideation_guides_owner_insert on public.create_ideation_guides for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  ) and (writer_id is null or exists (
    select 1 from public.writer_scripts w where w.id = writer_id and w.owner_id = (select auth.uid()) and w.project_id = project_id
  ))
);
create policy create_ideation_guides_owner_update on public.create_ideation_guides for update to authenticated using (owner_id = (select auth.uid())) with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  ) and (writer_id is null or exists (
    select 1 from public.writer_scripts w where w.id = writer_id and w.owner_id = (select auth.uid()) and w.project_id = project_id
  ))
);

create table public.create_ideation_possibilities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  content text not null,
  state text not null default 'maybe',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint create_ideation_possibilities_content_length check (char_length(content) between 1 and 2000),
  constraint create_ideation_possibilities_state_check check (state in ('maybe','canon','discarded'))
);
create index create_ideation_possibilities_project_idx on public.create_ideation_possibilities(project_id, created_at desc);
alter table public.create_ideation_possibilities enable row level security;
revoke all on public.create_ideation_possibilities from public, anon;
grant select, insert, update on public.create_ideation_possibilities to authenticated;
create policy create_ideation_possibilities_owner_select on public.create_ideation_possibilities for select to authenticated using (owner_id = (select auth.uid()));
create policy create_ideation_possibilities_owner_insert on public.create_ideation_possibilities for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.create_ideation_guides g where g.project_id = project_id and g.owner_id = (select auth.uid())
  )
);
create policy create_ideation_possibilities_owner_update on public.create_ideation_possibilities for update to authenticated using (owner_id = (select auth.uid())) with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.create_ideation_guides g where g.project_id = project_id and g.owner_id = (select auth.uid())
  )
);

commit;
