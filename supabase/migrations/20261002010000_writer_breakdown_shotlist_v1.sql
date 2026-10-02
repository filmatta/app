begin;

alter table public.writer_scripts
  add constraint writer_scripts_id_owner_unique unique (id, owner_id);

create table public.writer_production_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 5000000),
  width integer not null check (width between 1 and 12000),
  height integer not null check (height between 1 and 12000),
  status text not null default 'ready' check (status in ('ready', 'deleting', 'delete_failed')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (owner_id, storage_path),
  unique (id, owner_id)
);

create table public.writer_breakdown_elements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null,
  category text not null check (category in (
    'character', 'prop', 'location', 'wardrobe', 'vehicle', 'animal', 'extra',
    'makeup', 'practical_effect', 'visual_effect', 'stunt', 'sound_music', 'other'
  )),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  normalized_name text not null check (char_length(normalized_name) between 1 and 180),
  status text not null check (status in ('suggested', 'confirmed', 'dismissed')),
  source text not null check (source in ('rule', 'ai', 'user', 'character_identity')),
  canonical_identity_key text,
  note text check (note is null or char_length(note) <= 2000),
  asset_id uuid,
  fingerprint text not null check (char_length(fingerprint) between 8 and 160),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (script_id, owner_id) references public.writer_scripts(id, owner_id) on delete cascade,
  foreign key (asset_id, owner_id) references public.writer_production_assets(id, owner_id) on delete set null (asset_id),
  unique (owner_id, script_id, fingerprint),
  unique (id, owner_id),
  unique (id, owner_id, script_id)
);

create table public.writer_breakdown_appearances (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null,
  element_id uuid not null,
  scene_id uuid,
  block_id uuid,
  excerpt text not null check (char_length(excerpt) between 1 and 500),
  nature text not null check (nature in ('present', 'used', 'mentioned', 'inferred')),
  from_offset integer check (from_offset is null or from_offset >= 0),
  to_offset integer check (to_offset is null or to_offset >= coalesce(from_offset, 0)),
  source_revision bigint not null check (source_revision > 0),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  stale boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (script_id, owner_id) references public.writer_scripts(id, owner_id) on delete cascade,
  foreign key (element_id, owner_id, script_id)
    references public.writer_breakdown_elements(id, owner_id, script_id) on delete cascade,
  unique (element_id, block_id, from_offset, nature),
  unique (id, owner_id)
);

create table public.writer_breakdown_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null,
  fingerprint text not null check (char_length(fingerprint) between 8 and 160),
  decision text not null check (decision in ('confirmed', 'dismissed', 'restored', 'merged')),
  target_element_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  decided_at timestamptz not null default clock_timestamp(),
  foreign key (script_id, owner_id) references public.writer_scripts(id, owner_id) on delete cascade,
  foreign key (target_element_id, owner_id, script_id)
    references public.writer_breakdown_elements(id, owner_id, script_id) on delete set null (target_element_id),
  unique (owner_id, script_id, fingerprint)
);

create table public.writer_shotlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  source_revision bigint check (source_revision is null or source_revision > 0),
  creation_operation_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (script_id, owner_id) references public.writer_scripts(id, owner_id) on delete set null (script_id),
  unique (owner_id, creation_operation_id),
  unique (id, owner_id)
);

create table public.writer_shotlist_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  shotlist_id uuid not null,
  source_scene_id uuid,
  source_scene_title text,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  position integer not null check (position >= 0),
  source_status text not null check (source_status in ('linked', 'missing', 'manual')),
  creation_operation_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (shotlist_id, owner_id) references public.writer_shotlists(id, owner_id) on delete cascade,
  unique (owner_id, shotlist_id, creation_operation_id),
  unique (shotlist_id, position),
  unique (id, owner_id),
  unique (id, owner_id, shotlist_id)
);

create table public.writer_shotlist_shots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  shotlist_id uuid not null,
  group_id uuid not null,
  source_block_id uuid,
  origin text not null check (origin in ('manual', 'assisted', 'suggested')),
  shot_type text not null default 'General' check (char_length(shot_type) between 1 and 80),
  composition text check (composition is null or char_length(composition) <= 80),
  subject text not null default '' check (char_length(subject) <= 500),
  angle text not null default 'A nivel' check (char_length(angle) between 1 and 80),
  movement text not null default 'Fijo' check (char_length(movement) between 1 and 80),
  support text check (support is null or char_length(support) <= 80),
  lens text check (lens is null or char_length(lens) <= 40),
  setup text check (setup is null or char_length(setup) <= 40),
  duration_seconds numeric(8,2) check (duration_seconds is null or duration_seconds between 0 and 86400),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  description text check (description is null or char_length(description) <= 4000),
  intention text check (intention is null or char_length(intention) <= 2000),
  notes text check (notes is null or char_length(notes) <= 4000),
  asset_id uuid,
  position integer not null check (position >= 0),
  creation_operation_id uuid not null,
  proposal_operation_id uuid,
  source_revision bigint check (source_revision is null or source_revision > 0),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (shotlist_id, owner_id) references public.writer_shotlists(id, owner_id) on delete cascade,
  foreign key (group_id, owner_id, shotlist_id)
    references public.writer_shotlist_groups(id, owner_id, shotlist_id) on delete cascade,
  foreign key (asset_id, owner_id) references public.writer_production_assets(id, owner_id) on delete set null (asset_id),
  unique (owner_id, shotlist_id, creation_operation_id),
  unique (group_id, position),
  unique (id, owner_id),
  unique (id, owner_id, shotlist_id)
);

create table public.writer_production_operations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid,
  shotlist_id uuid,
  kind text not null check (kind in ('breakdown_detect', 'shotlist_assisted', 'shotlist_suggested')),
  scope text not null check (scope in ('scene', 'changed', 'selected', 'document', 'briefing')),
  source_revision bigint,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  model text not null,
  status text not null check (status in ('reserved', 'processing', 'completed', 'partial', 'failed', 'uncertain', 'cancelled')),
  reserved_cost_microusd bigint not null default 0 check (reserved_cost_microusd between 0 and 3000000),
  actual_cost_microusd bigint not null default 0 check (actual_cost_microusd between 0 and 3000000),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz,
  foreign key (script_id, owner_id) references public.writer_scripts(id, owner_id) on delete cascade,
  foreign key (shotlist_id, owner_id) references public.writer_shotlists(id, owner_id) on delete cascade,
  unique (owner_id, request_hash)
);

create table public.writer_shotlist_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  shotlist_id uuid not null,
  group_id uuid not null,
  operation_id uuid not null references public.writer_production_operations(id) on delete cascade,
  source_block_id uuid,
  fingerprint text not null check (char_length(fingerprint) between 8 and 160),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed', 'stale')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (shotlist_id, owner_id) references public.writer_shotlists(id, owner_id) on delete cascade,
  foreign key (group_id, owner_id, shotlist_id)
    references public.writer_shotlist_groups(id, owner_id, shotlist_id) on delete cascade,
  unique (owner_id, shotlist_id, fingerprint),
  unique (id, owner_id)
);

create index writer_breakdown_elements_script_category_idx
  on public.writer_breakdown_elements(owner_id, script_id, category, status, updated_at desc);
create index writer_breakdown_appearances_element_idx
  on public.writer_breakdown_appearances(owner_id, element_id, stale, created_at);
create index writer_shotlists_owner_updated_idx
  on public.writer_shotlists(owner_id, updated_at desc);
create index writer_shotlist_groups_order_idx
  on public.writer_shotlist_groups(owner_id, shotlist_id, position);
create index writer_shots_group_order_idx
  on public.writer_shotlist_shots(owner_id, group_id, position);
create index writer_operations_owner_created_idx
  on public.writer_production_operations(owner_id, created_at desc);
create index writer_proposals_shotlist_status_idx
  on public.writer_shotlist_proposals(owner_id, shotlist_id, status, created_at);

alter table public.writer_production_assets enable row level security;
alter table public.writer_breakdown_elements enable row level security;
alter table public.writer_breakdown_appearances enable row level security;
alter table public.writer_breakdown_decisions enable row level security;
alter table public.writer_shotlists enable row level security;
alter table public.writer_shotlist_groups enable row level security;
alter table public.writer_shotlist_shots enable row level security;
alter table public.writer_production_operations enable row level security;
alter table public.writer_shotlist_proposals enable row level security;

revoke all on public.writer_production_assets,
  public.writer_breakdown_elements,
  public.writer_breakdown_appearances,
  public.writer_breakdown_decisions,
  public.writer_shotlists,
  public.writer_shotlist_groups,
  public.writer_shotlist_shots,
  public.writer_production_operations,
  public.writer_shotlist_proposals
  from public, anon, authenticated;

grant select on public.writer_production_assets,
  public.writer_breakdown_elements,
  public.writer_breakdown_appearances,
  public.writer_breakdown_decisions,
  public.writer_shotlists,
  public.writer_shotlist_groups,
  public.writer_shotlist_shots,
  public.writer_shotlist_proposals
  to authenticated;

grant all on public.writer_production_assets,
  public.writer_breakdown_elements,
  public.writer_breakdown_appearances,
  public.writer_breakdown_decisions,
  public.writer_shotlists,
  public.writer_shotlist_groups,
  public.writer_shotlist_shots,
  public.writer_production_operations,
  public.writer_shotlist_proposals
  to service_role;

create policy writer_production_assets_owner on public.writer_production_assets
  for select to authenticated using (owner_id = (select auth.uid()));
create policy writer_breakdown_elements_owner on public.writer_breakdown_elements
  for select to authenticated using (owner_id = (select auth.uid()));
create policy writer_breakdown_appearances_owner on public.writer_breakdown_appearances
  for select to authenticated using (owner_id = (select auth.uid()));
create policy writer_breakdown_decisions_owner on public.writer_breakdown_decisions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy writer_shotlists_owner on public.writer_shotlists
  for select to authenticated using (owner_id = (select auth.uid()));
create policy writer_shotlist_groups_owner on public.writer_shotlist_groups
  for select to authenticated using (owner_id = (select auth.uid()));
create policy writer_shotlist_shots_owner on public.writer_shotlist_shots
  for select to authenticated using (owner_id = (select auth.uid()));
create policy writer_shotlist_proposals_owner on public.writer_shotlist_proposals
  for select to authenticated using (owner_id = (select auth.uid()));

create or replace function private.writer_production_block_text(p_block jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(
    case
      when node->>'type' = 'text' then node->>'text'
      when node->>'type' = 'hardBreak' then E'\n'
      else ''
    end,
    '' order by ordinal
  ), '')
  from jsonb_array_elements(coalesce(p_block->'content', '[]'::jsonb))
    with ordinality as parts(node, ordinal)
$$;

revoke all on function private.writer_production_block_text(jsonb)
  from public, anon, authenticated;

create or replace function public.writer_create_shotlist(
  p_script_id uuid,
  p_title text,
  p_operation_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  source_script public.writer_scripts%rowtype;
  existing_id uuid;
  created_id uuid;
  block jsonb;
  scene_position integer := 0;
  scene_title text;
begin
  if actor is null then raise exception using errcode='42501', message='WRITER_UNAUTHENTICATED'; end if;
  if p_operation_id is null or p_title is null or char_length(btrim(p_title)) not between 1 and 160 then
    raise exception using errcode='22023', message='SHOTLIST_INVALID_CREATE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 42177));
  select id into existing_id from public.writer_shotlists
    where owner_id=actor and creation_operation_id=p_operation_id;
  if found then return existing_id; end if;

  if p_script_id is not null then
    select * into source_script from public.writer_scripts
      where id=p_script_id and owner_id=actor for share;
    if not found then raise exception using errcode='P0001', message='WRITER_NOT_FOUND'; end if;
  end if;

  insert into public.writer_shotlists(owner_id,script_id,title,source_revision,creation_operation_id)
  values(actor,p_script_id,btrim(p_title),case when p_script_id is null then null else source_script.revision end,p_operation_id)
  returning id into created_id;

  if p_script_id is not null then
    for block in select value from jsonb_array_elements(source_script.document->'content') loop
      if block->>'type'='screenplayBlock' and block#>>'{attrs,kind}'='sceneHeading' then
        scene_title := nullif(btrim(private.writer_production_block_text(block)), '');
        insert into public.writer_shotlist_groups(
          owner_id,shotlist_id,source_scene_id,source_scene_title,title,position,source_status,creation_operation_id
        ) values (
          actor,created_id,(block#>>'{attrs,id}')::uuid,scene_title,
          coalesce(scene_title,'Escena sin encabezado'),scene_position,'linked',gen_random_uuid()
        );
        scene_position := scene_position + 1;
      end if;
    end loop;
  end if;
  if scene_position=0 then
    insert into public.writer_shotlist_groups(
      owner_id,shotlist_id,title,position,source_status,creation_operation_id
    ) values(actor,created_id,'Escena manual',0,'manual',gen_random_uuid());
  end if;
  return created_id;
end
$$;

create or replace function public.writer_add_shotlist_group(
  p_shotlist_id uuid,
  p_title text,
  p_operation_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result_id uuid;
  next_position integer;
begin
  if actor is null then raise exception using errcode='42501', message='WRITER_UNAUTHENTICATED'; end if;
  if p_operation_id is null or p_title is null or char_length(btrim(p_title)) not between 1 and 180 then
    raise exception using errcode='22023', message='SHOTLIST_INVALID_GROUP';
  end if;
  perform 1 from public.writer_shotlists where id=p_shotlist_id and owner_id=actor for update;
  if not found then raise exception using errcode='P0001', message='SHOTLIST_NOT_FOUND'; end if;
  select id into result_id from public.writer_shotlist_groups
    where owner_id=actor and shotlist_id=p_shotlist_id and creation_operation_id=p_operation_id;
  if found then return result_id; end if;
  select coalesce(max(position)+1,0) into next_position from public.writer_shotlist_groups
    where owner_id=actor and shotlist_id=p_shotlist_id;
  insert into public.writer_shotlist_groups(
    owner_id,shotlist_id,title,position,source_status,creation_operation_id
  ) values(actor,p_shotlist_id,btrim(p_title),next_position,'manual',p_operation_id)
  returning id into result_id;
  update public.writer_shotlists set revision=revision+1,updated_at=clock_timestamp()
    where id=p_shotlist_id and owner_id=actor;
  return result_id;
end
$$;

create or replace function public.writer_add_shot(
  p_shotlist_id uuid,
  p_group_id uuid,
  p_operation_id uuid,
  p_origin text default 'manual'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result_id uuid;
  next_position integer;
begin
  if actor is null then raise exception using errcode='42501', message='WRITER_UNAUTHENTICATED'; end if;
  if p_operation_id is null or p_origin not in ('manual','assisted','suggested') then
    raise exception using errcode='22023', message='SHOTLIST_INVALID_SHOT';
  end if;
  perform 1 from public.writer_shotlist_groups
    where id=p_group_id and shotlist_id=p_shotlist_id and owner_id=actor for update;
  if not found then raise exception using errcode='P0001', message='SHOTLIST_GROUP_NOT_FOUND'; end if;
  select id into result_id from public.writer_shotlist_shots
    where owner_id=actor and shotlist_id=p_shotlist_id and creation_operation_id=p_operation_id;
  if found then return result_id; end if;
  select coalesce(max(position)+1,0) into next_position from public.writer_shotlist_shots
    where owner_id=actor and group_id=p_group_id;
  insert into public.writer_shotlist_shots(
    owner_id,shotlist_id,group_id,origin,position,creation_operation_id
  ) values(actor,p_shotlist_id,p_group_id,p_origin,next_position,p_operation_id)
  returning id into result_id;
  update public.writer_shotlists set revision=revision+1,updated_at=clock_timestamp()
    where id=p_shotlist_id and owner_id=actor;
  return result_id;
end
$$;

create or replace function public.writer_duplicate_shot(
  p_shotlist_id uuid,
  p_shot_id uuid,
  p_operation_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  source_shot public.writer_shotlist_shots%rowtype;
  result_id uuid;
  next_position integer;
begin
  if actor is null then raise exception using errcode='42501', message='WRITER_UNAUTHENTICATED'; end if;
  if p_operation_id is null then raise exception using errcode='22023', message='SHOTLIST_OPERATION_REQUIRED'; end if;
  select id into result_id from public.writer_shotlist_shots
    where owner_id=actor and shotlist_id=p_shotlist_id and creation_operation_id=p_operation_id;
  if found then return result_id; end if;
  select * into source_shot from public.writer_shotlist_shots
    where id=p_shot_id and shotlist_id=p_shotlist_id and owner_id=actor for update;
  if not found then raise exception using errcode='P0001', message='SHOTLIST_SHOT_NOT_FOUND'; end if;
  select coalesce(max(position)+1,0) into next_position from public.writer_shotlist_shots
    where owner_id=actor and group_id=source_shot.group_id;
  insert into public.writer_shotlist_shots(
    owner_id,shotlist_id,group_id,source_block_id,origin,shot_type,composition,subject,angle,movement,
    support,lens,setup,duration_seconds,status,description,intention,notes,asset_id,position,
    creation_operation_id,source_revision
  ) values(
    actor,p_shotlist_id,source_shot.group_id,source_shot.source_block_id,'manual',source_shot.shot_type,
    source_shot.composition,source_shot.subject,source_shot.angle,source_shot.movement,source_shot.support,
    source_shot.lens,source_shot.setup,source_shot.duration_seconds,source_shot.status,source_shot.description,
    source_shot.intention,source_shot.notes,source_shot.asset_id,next_position,p_operation_id,source_shot.source_revision
  ) returning id into result_id;
  update public.writer_shotlists set revision=revision+1,updated_at=clock_timestamp()
    where id=p_shotlist_id and owner_id=actor;
  return result_id;
end
$$;

create or replace function public.writer_reorder_shot(
  p_shotlist_id uuid,
  p_shot_id uuid,
  p_target_index integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.writer_shotlist_shots%rowtype;
  ordered_id uuid;
  cursor_position integer := 0;
  target_index integer;
begin
  if actor is null then raise exception using errcode='42501', message='WRITER_UNAUTHENTICATED'; end if;
  select * into target from public.writer_shotlist_shots
    where id=p_shot_id and shotlist_id=p_shotlist_id and owner_id=actor for update;
  if not found then raise exception using errcode='P0001', message='SHOTLIST_SHOT_NOT_FOUND'; end if;
  select greatest(0,least(coalesce(p_target_index,0),count(*)::integer-1)) into target_index
    from public.writer_shotlist_shots where owner_id=actor and group_id=target.group_id;
  update public.writer_shotlist_shots set position=position+100000
    where owner_id=actor and group_id=target.group_id;
  for ordered_id in select id from public.writer_shotlist_shots
    where owner_id=actor and group_id=target.group_id and id<>p_shot_id order by position,id
  loop
    if cursor_position=target_index then
      update public.writer_shotlist_shots set position=cursor_position,updated_at=clock_timestamp(),revision=revision+1
        where id=p_shot_id and owner_id=actor;
      cursor_position := cursor_position+1;
    end if;
    update public.writer_shotlist_shots set position=cursor_position,updated_at=clock_timestamp(),revision=revision+1
      where id=ordered_id and owner_id=actor;
    cursor_position := cursor_position+1;
  end loop;
  if cursor_position=target_index then
    update public.writer_shotlist_shots set position=cursor_position,updated_at=clock_timestamp(),revision=revision+1
      where id=p_shot_id and owner_id=actor;
  end if;
  update public.writer_shotlists set revision=revision+1,updated_at=clock_timestamp()
    where id=p_shotlist_id and owner_id=actor;
  return true;
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
declare
  actor uuid := (select auth.uid());
  deleted_count integer;
begin
  if actor is null then raise exception using errcode='42501', message='WRITER_UNAUTHENTICATED'; end if;
  if p_shot_ids is null or cardinality(p_shot_ids)=0 or cardinality(p_shot_ids)>500 then
    raise exception using errcode='22023', message='SHOTLIST_INVALID_DELETE';
  end if;
  delete from public.writer_shotlist_shots
    where owner_id=actor and shotlist_id=p_shotlist_id and id=any(p_shot_ids);
  get diagnostics deleted_count = row_count;
  if deleted_count>0 then
    update public.writer_shotlists set revision=revision+1,updated_at=clock_timestamp()
      where id=p_shotlist_id and owner_id=actor;
  end if;
  return deleted_count;
end
$$;

revoke all on function public.writer_create_shotlist(uuid,text,uuid),
  public.writer_add_shotlist_group(uuid,text,uuid),
  public.writer_add_shot(uuid,uuid,uuid,text),
  public.writer_duplicate_shot(uuid,uuid,uuid),
  public.writer_reorder_shot(uuid,uuid,integer),
  public.writer_delete_shots(uuid,uuid[])
  from public, anon, authenticated;

grant execute on function public.writer_create_shotlist(uuid,text,uuid),
  public.writer_add_shotlist_group(uuid,text,uuid),
  public.writer_add_shot(uuid,uuid,uuid,text),
  public.writer_duplicate_shot(uuid,uuid,uuid),
  public.writer_reorder_shot(uuid,uuid,integer),
  public.writer_delete_shots(uuid,uuid[])
  to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('writer-production-assets', 'writer-production-assets', false, 5000000,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Browser clients never write or read this private bucket directly. Server routes
-- validate ownership, signatures and dimensions before using the service role.

insert into public.plan_entitlements(
  plan_code, entitlement_key, access_value, allowance_value, allowance_unit, unlimited, fair_use
) values
  ('free','writer.breakdown',true,null,null,false,false),
  ('free','writer.shotlist',true,null,null,false,false)
on conflict(plan_code,entitlement_key) do nothing;

commit;
