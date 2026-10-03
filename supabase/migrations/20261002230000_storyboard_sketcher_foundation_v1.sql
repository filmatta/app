begin;

alter table public.writer_production_assets
  add column original_storage_path text,
  add column original_mime_type text check (original_mime_type is null or original_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  add column original_size_bytes bigint check (original_size_bytes is null or original_size_bytes between 1 and 5000000),
  add column original_width integer check (original_width is null or original_width between 1 and 12000),
  add column original_height integer check (original_height is null or original_height between 1 and 12000),
  add column asset_purpose text not null default 'source' check (asset_purpose in ('source', 'storyboard_preview'));

create table public.storyboard_panels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  shotlist_id uuid not null,
  shot_id uuid not null,
  position integer not null check (position >= 0),
  current_revision_id uuid,
  creation_operation_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (shotlist_id, owner_id) references public.writer_shotlists(id, owner_id) on delete cascade,
  foreign key (shot_id, owner_id, shotlist_id)
    references public.writer_shotlist_shots(id, owner_id, shotlist_id) on delete restrict,
  unique (owner_id, shotlist_id, creation_operation_id),
  unique (shot_id, position),
  unique (id, owner_id),
  unique (id, owner_id, shotlist_id),
  unique (id, owner_id, shot_id)
);

create table public.storyboard_panel_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  panel_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  schema_version integer not null check (schema_version = 1),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  base_asset_id uuid,
  visual_note text check (visual_note is null or char_length(visual_note) <= 4000),
  logical_width integer not null check (logical_width between 240 and 8192),
  logical_height integer not null check (logical_height between 240 and 8192),
  content_kind text not null check (content_kind in ('empty', 'drawing', 'reference', 'mixed')),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  source_shot_revision integer not null check (source_shot_revision > 0),
  source_context_hash text not null check (source_context_hash ~ '^[0-9a-f]{64}$'),
  operation_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (panel_id, owner_id) references public.storyboard_panels(id, owner_id) on delete cascade,
  foreign key (base_asset_id, owner_id) references public.writer_production_assets(id, owner_id) on delete restrict,
  unique (panel_id, revision_number),
  unique (owner_id, panel_id, operation_id),
  unique (id, owner_id),
  unique (id, owner_id, panel_id)
);

alter table public.storyboard_panels
  add constraint storyboard_panels_current_revision_fk
  foreign key (current_revision_id, owner_id, id)
  references public.storyboard_panel_revisions(id, owner_id, panel_id)
  on delete set null (current_revision_id)
  deferrable initially deferred;

create table public.storyboard_panel_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  panel_id uuid not null,
  revision_id uuid not null,
  approved_by uuid not null references auth.users(id) on delete cascade,
  approved_at timestamptz not null default clock_timestamp(),
  foreign key (panel_id, owner_id) references public.storyboard_panels(id, owner_id) on delete cascade,
  foreign key (revision_id, owner_id, panel_id)
    references public.storyboard_panel_revisions(id, owner_id, panel_id) on delete cascade,
  unique (owner_id, panel_id, revision_id)
);

create table public.storyboard_panel_renders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  panel_id uuid not null,
  revision_id uuid not null,
  kind text not null check (kind in ('thumbnail')),
  status text not null check (status in ('pending', 'ready', 'failed')),
  asset_id uuid,
  error_code text check (error_code is null or char_length(error_code) <= 80),
  operation_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (panel_id, owner_id) references public.storyboard_panels(id, owner_id) on delete cascade,
  foreign key (revision_id, owner_id, panel_id)
    references public.storyboard_panel_revisions(id, owner_id, panel_id) on delete cascade,
  foreign key (asset_id, owner_id) references public.writer_production_assets(id, owner_id) on delete restrict,
  check ((status = 'ready' and asset_id is not null and error_code is null)
    or (status = 'failed' and asset_id is null and error_code is not null)
    or (status = 'pending' and asset_id is null)),
  unique (owner_id, panel_id, revision_id, kind),
  unique (owner_id, operation_id)
);

create table public.storyboard_panel_context_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  panel_id uuid not null,
  revision_id uuid not null,
  source_shot_revision integer not null check (source_shot_revision > 0),
  source_context_hash text not null check (source_context_hash ~ '^[0-9a-f]{64}$'),
  acknowledged_by uuid not null references auth.users(id) on delete cascade,
  acknowledged_at timestamptz not null default clock_timestamp(),
  foreign key (panel_id, owner_id) references public.storyboard_panels(id, owner_id) on delete cascade,
  foreign key (revision_id, owner_id, panel_id)
    references public.storyboard_panel_revisions(id, owner_id, panel_id) on delete cascade,
  unique (owner_id, panel_id, revision_id, source_context_hash)
);

create table public.storyboard_asset_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (owner_id, asset_id)
);

create index storyboard_panels_shot_order_idx on public.storyboard_panels(owner_id, shotlist_id, shot_id, position);
create index storyboard_revisions_panel_created_idx on public.storyboard_panel_revisions(owner_id, panel_id, revision_number desc);
create index storyboard_approvals_panel_idx on public.storyboard_panel_approvals(owner_id, panel_id, approved_at desc);
create index storyboard_renders_revision_idx on public.storyboard_panel_renders(owner_id, revision_id, status);
create index storyboard_cleanup_pending_idx on public.storyboard_asset_cleanup_jobs(status, updated_at) where status in ('pending', 'failed');

alter table public.storyboard_panels enable row level security;
alter table public.storyboard_panel_revisions enable row level security;
alter table public.storyboard_panel_approvals enable row level security;
alter table public.storyboard_panel_renders enable row level security;
alter table public.storyboard_panel_context_acknowledgements enable row level security;
alter table public.storyboard_asset_cleanup_jobs enable row level security;

revoke all on public.storyboard_panels, public.storyboard_panel_revisions,
  public.storyboard_panel_approvals, public.storyboard_panel_renders,
  public.storyboard_panel_context_acknowledgements, public.storyboard_asset_cleanup_jobs
  from public, anon, authenticated;

grant select on public.storyboard_panels, public.storyboard_panel_revisions,
  public.storyboard_panel_approvals, public.storyboard_panel_renders,
  public.storyboard_panel_context_acknowledgements
  to authenticated;

grant all on public.storyboard_panels, public.storyboard_panel_revisions,
  public.storyboard_panel_approvals, public.storyboard_panel_renders,
  public.storyboard_panel_context_acknowledgements, public.storyboard_asset_cleanup_jobs
  to service_role;

create policy storyboard_panels_owner on public.storyboard_panels
  for select to authenticated using (owner_id = (select auth.uid()));
create policy storyboard_revisions_owner on public.storyboard_panel_revisions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy storyboard_approvals_owner on public.storyboard_panel_approvals
  for select to authenticated using (owner_id = (select auth.uid()));
create policy storyboard_renders_owner on public.storyboard_panel_renders
  for select to authenticated using (owner_id = (select auth.uid()));
create policy storyboard_acknowledgements_owner on public.storyboard_panel_context_acknowledgements
  for select to authenticated using (owner_id = (select auth.uid()));

create or replace function public.storyboard_create_panel(
  p_actor_id uuid,
  p_shotlist_id uuid,
  p_shot_id uuid,
  p_operation_id uuid,
  p_document jsonb,
  p_schema_version integer,
  p_base_asset_id uuid,
  p_visual_note text,
  p_logical_width integer,
  p_logical_height integer,
  p_content_kind text,
  p_content_hash text,
  p_source_shot_revision integer,
  p_source_context_hash text
) returns table(panel_id uuid, revision_id uuid, revision_number integer, no_op boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_panel public.storyboard_panels%rowtype;
  result_panel_id uuid;
  result_revision_id uuid;
  next_position integer;
begin
  if p_actor_id is null or p_operation_id is null then
    raise exception using errcode='22023', message='STORYBOARD_INVALID_CREATE';
  end if;
  select * into existing_panel from public.storyboard_panels
    where owner_id=p_actor_id and shotlist_id=p_shotlist_id and creation_operation_id=p_operation_id;
  if found then
    return query select existing_panel.id, existing_panel.current_revision_id, r.revision_number, true
      from public.storyboard_panel_revisions r where r.id=existing_panel.current_revision_id and r.owner_id=p_actor_id;
    return;
  end if;
  perform 1 from public.writer_shotlist_shots
    where id=p_shot_id and shotlist_id=p_shotlist_id and owner_id=p_actor_id for update;
  if not found then raise exception using errcode='P0001', message='STORYBOARD_SHOT_NOT_FOUND'; end if;
  if p_base_asset_id is not null then
    perform 1 from public.writer_production_assets where id=p_base_asset_id and owner_id=p_actor_id and status='ready';
    if not found then raise exception using errcode='P0001', message='STORYBOARD_ASSET_NOT_FOUND'; end if;
  end if;
  select coalesce(max(position)+1,0) into next_position from public.storyboard_panels
    where owner_id=p_actor_id and shot_id=p_shot_id;
  insert into public.storyboard_panels(owner_id,shotlist_id,shot_id,position,creation_operation_id)
  values(p_actor_id,p_shotlist_id,p_shot_id,next_position,p_operation_id) returning id into result_panel_id;
  insert into public.storyboard_panel_revisions(
    owner_id,panel_id,revision_number,schema_version,document,base_asset_id,visual_note,
    logical_width,logical_height,content_kind,content_hash,source_shot_revision,source_context_hash,operation_id
  ) values(
    p_actor_id,result_panel_id,1,p_schema_version,p_document,p_base_asset_id,nullif(btrim(p_visual_note),''),
    p_logical_width,p_logical_height,p_content_kind,p_content_hash,p_source_shot_revision,p_source_context_hash,p_operation_id
  ) returning id into result_revision_id;
  update public.storyboard_panels set current_revision_id=result_revision_id,updated_at=clock_timestamp()
    where id=result_panel_id and owner_id=p_actor_id;
  return query select result_panel_id,result_revision_id,1,false;
end
$$;

create or replace function public.storyboard_save_panel_revision(
  p_actor_id uuid,
  p_panel_id uuid,
  p_expected_revision_id uuid,
  p_operation_id uuid,
  p_document jsonb,
  p_schema_version integer,
  p_base_asset_id uuid,
  p_visual_note text,
  p_logical_width integer,
  p_logical_height integer,
  p_content_kind text,
  p_content_hash text,
  p_source_shot_revision integer,
  p_source_context_hash text
) returns table(panel_id uuid, revision_id uuid, revision_number integer, no_op boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_panel public.storyboard_panels%rowtype;
  current_revision public.storyboard_panel_revisions%rowtype;
  existing_revision public.storyboard_panel_revisions%rowtype;
  result_revision_id uuid;
  next_revision integer;
begin
  if p_actor_id is null or p_operation_id is null or p_expected_revision_id is null then
    raise exception using errcode='22023', message='STORYBOARD_INVALID_SAVE';
  end if;
  select * into target_panel from public.storyboard_panels where id=p_panel_id and owner_id=p_actor_id for update;
  if not found then raise exception using errcode='P0001', message='STORYBOARD_PANEL_NOT_FOUND'; end if;
  select * into existing_revision from public.storyboard_panel_revisions r
    where r.owner_id=p_actor_id and r.panel_id=p_panel_id and r.operation_id=p_operation_id;
  if found then
    return query select p_panel_id,existing_revision.id,existing_revision.revision_number,true;
    return;
  end if;
  if target_panel.current_revision_id <> p_expected_revision_id then
    raise exception using errcode='40001', message='STORYBOARD_REVISION_CONFLICT';
  end if;
  select * into current_revision from public.storyboard_panel_revisions r
    where r.id=target_panel.current_revision_id and r.panel_id=p_panel_id and r.owner_id=p_actor_id for update;
  if not found then raise exception using errcode='P0001', message='STORYBOARD_HEAD_NOT_FOUND'; end if;
  if p_base_asset_id is not null then
    perform 1 from public.writer_production_assets where id=p_base_asset_id and owner_id=p_actor_id and status='ready';
    if not found then raise exception using errcode='P0001', message='STORYBOARD_ASSET_NOT_FOUND'; end if;
  end if;
  if current_revision.content_hash=p_content_hash
    and current_revision.base_asset_id is not distinct from p_base_asset_id
    and current_revision.visual_note is not distinct from nullif(btrim(p_visual_note),'')
    and current_revision.logical_width=p_logical_width
    and current_revision.logical_height=p_logical_height then
    return query select p_panel_id,current_revision.id,current_revision.revision_number,true;
    return;
  end if;
  next_revision := current_revision.revision_number + 1;
  insert into public.storyboard_panel_revisions(
    owner_id,panel_id,revision_number,schema_version,document,base_asset_id,visual_note,
    logical_width,logical_height,content_kind,content_hash,source_shot_revision,source_context_hash,operation_id
  ) values(
    p_actor_id,p_panel_id,next_revision,p_schema_version,p_document,p_base_asset_id,nullif(btrim(p_visual_note),''),
    p_logical_width,p_logical_height,p_content_kind,p_content_hash,p_source_shot_revision,p_source_context_hash,p_operation_id
  ) returning id into result_revision_id;
  update public.storyboard_panels set current_revision_id=result_revision_id,updated_at=clock_timestamp()
    where id=p_panel_id and owner_id=p_actor_id;
  delete from public.storyboard_panel_revisions old
    where old.owner_id=p_actor_id and old.panel_id=p_panel_id and old.id<>result_revision_id
      and not exists(select 1 from public.storyboard_panel_approvals a where a.revision_id=old.id and a.owner_id=p_actor_id)
      and not exists(select 1 from public.storyboard_panel_renders r where r.revision_id=old.id and r.owner_id=p_actor_id)
      and old.id in (
        select retained.id from public.storyboard_panel_revisions retained
        where retained.owner_id=p_actor_id and retained.panel_id=p_panel_id and retained.id<>result_revision_id
        order by retained.revision_number desc offset 10
      );
  return query select p_panel_id,result_revision_id,next_revision,false;
end
$$;

create or replace function public.storyboard_reorder_panels(
  p_actor_id uuid,
  p_shotlist_id uuid,
  p_shot_id uuid,
  p_panel_ids uuid[]
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare panel_count integer; item uuid; ordinal integer := 0;
begin
  if p_actor_id is null or p_panel_ids is null or cardinality(p_panel_ids)=0 then
    raise exception using errcode='22023', message='STORYBOARD_INVALID_ORDER';
  end if;
  perform 1 from public.writer_shotlist_shots
    where id=p_shot_id and shotlist_id=p_shotlist_id and owner_id=p_actor_id for update;
  if not found then raise exception using errcode='P0001', message='STORYBOARD_SHOT_NOT_FOUND'; end if;
  select count(*)::integer into panel_count from public.storyboard_panels
    where owner_id=p_actor_id and shotlist_id=p_shotlist_id and shot_id=p_shot_id;
  if panel_count<>cardinality(p_panel_ids)
    or panel_count<>(select count(distinct value)::integer from unnest(p_panel_ids) value)
    or exists(select 1 from unnest(p_panel_ids) value where not exists(
      select 1 from public.storyboard_panels p where p.id=value and p.owner_id=p_actor_id and p.shot_id=p_shot_id
    )) then raise exception using errcode='22023', message='STORYBOARD_INVALID_ORDER'; end if;
  update public.storyboard_panels set position=position+100000 where owner_id=p_actor_id and shot_id=p_shot_id;
  foreach item in array p_panel_ids loop
    update public.storyboard_panels set position=ordinal,updated_at=clock_timestamp()
      where id=item and owner_id=p_actor_id and shot_id=p_shot_id;
    ordinal := ordinal + 1;
  end loop;
  return true;
end
$$;

create or replace function public.storyboard_duplicate_panel(
  p_actor_id uuid,
  p_panel_id uuid,
  p_operation_id uuid
) returns table(panel_id uuid, revision_id uuid, revision_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare source_panel public.storyboard_panels%rowtype; source_revision public.storyboard_panel_revisions%rowtype;
  existing public.storyboard_panels%rowtype; result_panel uuid; result_revision uuid; next_position integer;
begin
  select * into existing from public.storyboard_panels where owner_id=p_actor_id and creation_operation_id=p_operation_id;
  if found then return query select existing.id,existing.current_revision_id,1; return; end if;
  select * into source_panel from public.storyboard_panels where id=p_panel_id and owner_id=p_actor_id for update;
  if not found then raise exception using errcode='P0001', message='STORYBOARD_PANEL_NOT_FOUND'; end if;
  select * into source_revision from public.storyboard_panel_revisions where id=source_panel.current_revision_id and owner_id=p_actor_id;
  select coalesce(max(position)+1,0) into next_position from public.storyboard_panels where owner_id=p_actor_id and shot_id=source_panel.shot_id;
  insert into public.storyboard_panels(owner_id,shotlist_id,shot_id,position,creation_operation_id)
    values(p_actor_id,source_panel.shotlist_id,source_panel.shot_id,next_position,p_operation_id) returning id into result_panel;
  insert into public.storyboard_panel_revisions(owner_id,panel_id,revision_number,schema_version,document,base_asset_id,visual_note,
    logical_width,logical_height,content_kind,content_hash,source_shot_revision,source_context_hash,operation_id)
    values(p_actor_id,result_panel,1,source_revision.schema_version,source_revision.document,source_revision.base_asset_id,source_revision.visual_note,
      source_revision.logical_width,source_revision.logical_height,source_revision.content_kind,source_revision.content_hash,
      source_revision.source_shot_revision,source_revision.source_context_hash,p_operation_id) returning id into result_revision;
  update public.storyboard_panels set current_revision_id=result_revision where id=result_panel and owner_id=p_actor_id;
  return query select result_panel,result_revision,1;
end
$$;

create or replace function public.storyboard_approve_panel(
  p_actor_id uuid,
  p_panel_id uuid,
  p_revision_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare target public.storyboard_panels%rowtype; revision public.storyboard_panel_revisions%rowtype; result_id uuid;
begin
  select * into target from public.storyboard_panels where id=p_panel_id and owner_id=p_actor_id for update;
  if not found then raise exception using errcode='P0001', message='STORYBOARD_PANEL_NOT_FOUND'; end if;
  if target.current_revision_id<>p_revision_id then raise exception using errcode='40001', message='STORYBOARD_REVISION_CONFLICT'; end if;
  select * into revision from public.storyboard_panel_revisions where id=p_revision_id and panel_id=p_panel_id and owner_id=p_actor_id;
  if not found then raise exception using errcode='P0001', message='STORYBOARD_REVISION_NOT_FOUND'; end if;
  if revision.content_kind='empty' then raise exception using errcode='22023', message='STORYBOARD_EMPTY_APPROVAL'; end if;
  insert into public.storyboard_panel_approvals(owner_id,panel_id,revision_id,approved_by)
    values(p_actor_id,p_panel_id,p_revision_id,p_actor_id)
    on conflict(owner_id,panel_id,revision_id) do update set approved_at=public.storyboard_panel_approvals.approved_at
    returning id into result_id;
  return result_id;
end
$$;

create or replace function public.storyboard_acknowledge_panel_context(
  p_actor_id uuid,
  p_panel_id uuid,
  p_revision_id uuid,
  p_source_shot_revision integer,
  p_source_context_hash text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare target public.storyboard_panels%rowtype; result_id uuid;
begin
  select * into target from public.storyboard_panels where id=p_panel_id and owner_id=p_actor_id for update;
  if not found then raise exception using errcode='P0001', message='STORYBOARD_PANEL_NOT_FOUND'; end if;
  if target.current_revision_id<>p_revision_id then raise exception using errcode='40001', message='STORYBOARD_REVISION_CONFLICT'; end if;
  insert into public.storyboard_panel_context_acknowledgements(
    owner_id,panel_id,revision_id,source_shot_revision,source_context_hash,acknowledged_by
  ) values(p_actor_id,p_panel_id,p_revision_id,p_source_shot_revision,p_source_context_hash,p_actor_id)
  on conflict(owner_id,panel_id,revision_id,source_context_hash)
    do update set acknowledged_at=clock_timestamp(),source_shot_revision=excluded.source_shot_revision
  returning id into result_id;
  return result_id;
end
$$;

create or replace function public.storyboard_delete_panels(
  p_actor_id uuid,
  p_shotlist_id uuid,
  p_panel_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare deleted_count integer;
begin
  if p_panel_ids is null or cardinality(p_panel_ids)=0 or cardinality(p_panel_ids)>500 then
    raise exception using errcode='22023', message='STORYBOARD_INVALID_DELETE'; end if;
  insert into public.storyboard_asset_cleanup_jobs(owner_id,asset_id)
    select distinct p_actor_id,asset_id from (
      select r.base_asset_id asset_id from public.storyboard_panel_revisions r
        where r.owner_id=p_actor_id and r.panel_id=any(p_panel_ids) and r.base_asset_id is not null
      union
      select pr.asset_id from public.storyboard_panel_renders pr
        where pr.owner_id=p_actor_id and pr.panel_id=any(p_panel_ids) and pr.asset_id is not null
    ) assets on conflict(owner_id,asset_id) do update set status='pending',updated_at=clock_timestamp();
  delete from public.storyboard_panels where owner_id=p_actor_id and shotlist_id=p_shotlist_id and id=any(p_panel_ids);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end
$$;

create or replace function public.storyboard_delete_shots_with_panels(
  p_actor_id uuid,
  p_shotlist_id uuid,
  p_shot_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare panel_ids uuid[]; panel_count integer; approval_count integer; shot_count integer;
begin
  if p_shot_ids is null or cardinality(p_shot_ids)=0 or cardinality(p_shot_ids)>500 then
    raise exception using errcode='22023', message='STORYBOARD_INVALID_DELETE'; end if;
  perform 1 from public.writer_shotlists where id=p_shotlist_id and owner_id=p_actor_id for update;
  if not found then raise exception using errcode='P0001', message='SHOTLIST_NOT_FOUND'; end if;
  select coalesce(array_agg(id),'{}'::uuid[]),count(*)::integer into panel_ids,panel_count
    from public.storyboard_panels where owner_id=p_actor_id and shotlist_id=p_shotlist_id and shot_id=any(p_shot_ids);
  select count(*)::integer into approval_count from public.storyboard_panel_approvals
    where owner_id=p_actor_id and panel_id=any(panel_ids);
  if panel_count>0 then perform public.storyboard_delete_panels(p_actor_id,p_shotlist_id,panel_ids); end if;
  delete from public.writer_shotlist_shots where owner_id=p_actor_id and shotlist_id=p_shotlist_id and id=any(p_shot_ids);
  get diagnostics shot_count = row_count;
  if shot_count>0 then update public.writer_shotlists set revision=revision+1,updated_at=clock_timestamp()
    where id=p_shotlist_id and owner_id=p_actor_id; end if;
  return jsonb_build_object('shots',shot_count,'panels',panel_count,'approvals',approval_count);
end
$$;

create or replace function public.writer_delete_shots(
  p_shotlist_id uuid,
  p_shot_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := (select auth.uid()); deleted_count integer;
begin
  if actor is null then raise exception using errcode='42501', message='WRITER_UNAUTHENTICATED'; end if;
  if p_shot_ids is null or cardinality(p_shot_ids)=0 or cardinality(p_shot_ids)>500 then
    raise exception using errcode='22023', message='SHOTLIST_INVALID_DELETE'; end if;
  if exists(select 1 from public.storyboard_panels
    where owner_id=actor and shotlist_id=p_shotlist_id and shot_id=any(p_shot_ids)) then
    raise exception using errcode='23503', message='SHOTLIST_STORYBOARD_DEPENDENCY'; end if;
  delete from public.writer_shotlist_shots where owner_id=actor and shotlist_id=p_shotlist_id and id=any(p_shot_ids);
  get diagnostics deleted_count = row_count;
  if deleted_count>0 then update public.writer_shotlists set revision=revision+1,updated_at=clock_timestamp()
    where id=p_shotlist_id and owner_id=actor; end if;
  return deleted_count;
end
$$;

revoke all on function public.storyboard_create_panel(uuid,uuid,uuid,uuid,jsonb,integer,uuid,text,integer,integer,text,text,integer,text),
  public.storyboard_save_panel_revision(uuid,uuid,uuid,uuid,jsonb,integer,uuid,text,integer,integer,text,text,integer,text),
  public.storyboard_reorder_panels(uuid,uuid,uuid,uuid[]),
  public.storyboard_duplicate_panel(uuid,uuid,uuid),
  public.storyboard_approve_panel(uuid,uuid,uuid),
  public.storyboard_acknowledge_panel_context(uuid,uuid,uuid,integer,text),
  public.storyboard_delete_panels(uuid,uuid,uuid[]),
  public.storyboard_delete_shots_with_panels(uuid,uuid,uuid[])
  from public, anon, authenticated;

grant execute on function public.storyboard_create_panel(uuid,uuid,uuid,uuid,jsonb,integer,uuid,text,integer,integer,text,text,integer,text),
  public.storyboard_save_panel_revision(uuid,uuid,uuid,uuid,jsonb,integer,uuid,text,integer,integer,text,text,integer,text),
  public.storyboard_reorder_panels(uuid,uuid,uuid,uuid[]),
  public.storyboard_duplicate_panel(uuid,uuid,uuid),
  public.storyboard_approve_panel(uuid,uuid,uuid),
  public.storyboard_acknowledge_panel_context(uuid,uuid,uuid,integer,text),
  public.storyboard_delete_panels(uuid,uuid,uuid[]),
  public.storyboard_delete_shots_with_panels(uuid,uuid,uuid[])
  to service_role;

commit;
