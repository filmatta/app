begin;

create table public.production_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  timezone text not null default 'America/Mexico_City'
    check (char_length(btrim(timezone)) between 1 and 80),
  script_id uuid,
  shotlist_id uuid,
  source_script_revision bigint check (source_script_revision is null or source_script_revision > 0),
  source_shotlist_revision integer check (source_shotlist_revision is null or source_shotlist_revision > 0),
  creation_operation_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (owner_id, creation_operation_id),
  unique (id, owner_id)
);

comment on column public.production_plans.script_id is
  'Soft reference to writer_scripts. Validated by the application; intentionally has no FK so source deletion preserves the plan.';
comment on column public.production_plans.shotlist_id is
  'Soft reference to writer_shotlists. Validated by the application; intentionally has no FK so source deletion preserves the plan.';

create table public.production_days (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  production_id uuid not null,
  position integer not null check (position >= 0),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  shoot_date date,
  call_time time,
  wrap_time time,
  wrap_next_day boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 4000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (production_id, owner_id)
    references public.production_plans(id, owner_id) on delete cascade,
  unique (production_id, position),
  unique (id, owner_id, production_id)
);

create table public.production_schedule_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  production_id uuid not null,
  day_id uuid,
  position integer not null check (position >= 0),
  item_type text not null check (item_type in ('scene', 'shot', 'manual', 'logistics')),
  logistics_type text check (
    (item_type = 'logistics' and logistics_type in ('call', 'meal', 'transfer', 'break', 'other'))
    or (item_type <> 'logistics' and logistics_type is null)
  ),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 4000),
  source_scene_id uuid,
  source_group_id uuid,
  source_shot_id uuid,
  source_label text check (source_label is null or char_length(source_label) <= 240),
  source_revision bigint check (source_revision is null or source_revision > 0),
  shoot_minutes integer check (shoot_minutes is null or shoot_minutes between 1 and 1440),
  start_time time,
  end_time time,
  end_next_day boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (production_id, owner_id)
    references public.production_plans(id, owner_id) on delete cascade,
  foreign key (day_id, owner_id, production_id)
    references public.production_days(id, owner_id, production_id)
    on delete set null (day_id),
  unique (id, owner_id, production_id),
  check (source_shot_id is null or item_type = 'shot'),
  check (item_type not in ('scene', 'shot') or source_scene_id is not null or source_group_id is not null),
  check (start_time is not null or end_time is null),
  check (start_time is not null or end_next_day = false)
);

create unique index production_schedule_shot_once_idx
  on public.production_schedule_items(production_id, source_shot_id)
  where source_shot_id is not null;
create unique index production_schedule_scene_once_idx
  on public.production_schedule_items(production_id, source_scene_id)
  where item_type = 'scene' and source_scene_id is not null and source_shot_id is null;

create table public.production_requirements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  production_id uuid not null,
  category text not null check (category in (
    'talent', 'crew', 'location', 'prop', 'wardrobe', 'vehicle', 'animal',
    'makeup', 'practical_effect', 'visual_effect', 'stunt', 'sound_music',
    'equipment', 'service', 'other'
  )),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  origin text not null check (origin in ('breakdown', 'manual')),
  source_element_id uuid,
  source_script_id uuid,
  source_identity_key text check (source_identity_key is null or char_length(source_identity_key) <= 240),
  source_label text check (source_label is null or char_length(source_label) <= 240),
  source_revision bigint check (source_revision is null or source_revision > 0),
  notes text check (notes is null or char_length(notes) <= 4000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (production_id, owner_id)
    references public.production_plans(id, owner_id) on delete cascade,
  unique (id, owner_id, production_id),
  check ((origin = 'breakdown' and source_element_id is not null and source_script_id is not null)
    or (origin = 'manual' and source_element_id is null))
);

create unique index production_requirement_source_once_idx
  on public.production_requirements(production_id, source_element_id)
  where source_element_id is not null;
create unique index production_requirement_identity_once_idx
  on public.production_requirements(production_id, category, source_identity_key)
  where source_identity_key is not null;

create table public.production_requirement_scenes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  production_id uuid not null,
  requirement_id uuid not null,
  source_scene_id uuid not null,
  source_group_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (production_id, owner_id)
    references public.production_plans(id, owner_id) on delete cascade,
  foreign key (requirement_id, owner_id, production_id)
    references public.production_requirements(id, owner_id, production_id) on delete cascade,
  unique (requirement_id, source_scene_id),
  unique (id, owner_id, production_id)
);

create table public.production_resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  production_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  resource_type text not null check (resource_type in (
    'person', 'location', 'prop', 'wardrobe', 'vehicle', 'equipment', 'service', 'other'
  )),
  contact text check (contact is null or char_length(contact) <= 500),
  address text check (address is null or char_length(address) <= 1000),
  notes text check (notes is null or char_length(notes) <= 4000),
  availability_notes text check (availability_notes is null or char_length(availability_notes) <= 2000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (production_id, owner_id)
    references public.production_plans(id, owner_id) on delete cascade,
  unique (id, owner_id, production_id)
);

create table public.production_coverages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  production_id uuid not null,
  requirement_id uuid not null,
  day_id uuid not null,
  resource_id uuid,
  status text not null default 'unassigned'
    check (status in ('unassigned', 'tentative', 'confirmed', 'unavailable')),
  required_time time,
  arrival_time time,
  notes text check (notes is null or char_length(notes) <= 2000),
  confirmed_for_date date,
  needs_reconfirmation boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (production_id, owner_id)
    references public.production_plans(id, owner_id) on delete cascade,
  foreign key (requirement_id, owner_id, production_id)
    references public.production_requirements(id, owner_id, production_id) on delete cascade,
  foreign key (day_id, owner_id, production_id)
    references public.production_days(id, owner_id, production_id) on delete cascade,
  foreign key (resource_id, owner_id, production_id)
    references public.production_resources(id, owner_id, production_id) on delete set null (resource_id),
  unique (requirement_id, day_id),
  unique (id, owner_id, production_id),
  check (status = 'unassigned' or resource_id is not null),
  check (status <> 'confirmed' or needs_reconfirmation = false)
);

create table public.production_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  production_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assignee_text text check (assignee_text is null or char_length(assignee_text) <= 160),
  assignee_resource_id uuid,
  due_date date,
  department text check (department is null or char_length(department) <= 120),
  notes text check (notes is null or char_length(notes) <= 4000),
  day_id uuid,
  schedule_item_id uuid,
  requirement_id uuid,
  resource_id uuid,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (production_id, owner_id)
    references public.production_plans(id, owner_id) on delete cascade,
  foreign key (assignee_resource_id, owner_id, production_id)
    references public.production_resources(id, owner_id, production_id) on delete set null (assignee_resource_id),
  foreign key (day_id, owner_id, production_id)
    references public.production_days(id, owner_id, production_id) on delete set null (day_id),
  foreign key (schedule_item_id, owner_id, production_id)
    references public.production_schedule_items(id, owner_id, production_id) on delete set null (schedule_item_id),
  foreign key (requirement_id, owner_id, production_id)
    references public.production_requirements(id, owner_id, production_id) on delete set null (requirement_id),
  foreign key (resource_id, owner_id, production_id)
    references public.production_resources(id, owner_id, production_id) on delete set null (resource_id),
  unique (id, owner_id, production_id),
  check (num_nonnulls(day_id, schedule_item_id, requirement_id, resource_id) <= 1)
);

create index production_plans_owner_updated_idx on public.production_plans(owner_id, updated_at desc);
create index production_days_order_idx on public.production_days(owner_id, production_id, position);
create index production_schedule_order_idx on public.production_schedule_items(owner_id, production_id, day_id, position);
create index production_requirements_idx on public.production_requirements(owner_id, production_id, category, name);
create index production_requirement_scenes_idx on public.production_requirement_scenes(owner_id, production_id, source_scene_id);
create index production_resources_idx on public.production_resources(owner_id, production_id, resource_type, name);
create index production_coverages_day_idx on public.production_coverages(owner_id, production_id, day_id, status);
create index production_tasks_idx on public.production_tasks(owner_id, production_id, status, priority, due_date);

alter table public.production_plans enable row level security;
alter table public.production_days enable row level security;
alter table public.production_schedule_items enable row level security;
alter table public.production_requirements enable row level security;
alter table public.production_requirement_scenes enable row level security;
alter table public.production_resources enable row level security;
alter table public.production_coverages enable row level security;
alter table public.production_tasks enable row level security;

revoke all on public.production_plans,
  public.production_days,
  public.production_schedule_items,
  public.production_requirements,
  public.production_requirement_scenes,
  public.production_resources,
  public.production_coverages,
  public.production_tasks
  from public, anon, authenticated;

grant select, insert, update, delete on public.production_plans,
  public.production_days,
  public.production_schedule_items,
  public.production_requirements,
  public.production_requirement_scenes,
  public.production_resources,
  public.production_coverages,
  public.production_tasks
  to authenticated;

grant all on public.production_plans,
  public.production_days,
  public.production_schedule_items,
  public.production_requirements,
  public.production_requirement_scenes,
  public.production_resources,
  public.production_coverages,
  public.production_tasks
  to service_role;

create policy production_plans_owner_all on public.production_plans
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy production_days_owner_all on public.production_days
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy production_schedule_owner_all on public.production_schedule_items
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy production_requirements_owner_all on public.production_requirements
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy production_requirement_scenes_owner_all on public.production_requirement_scenes
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy production_resources_owner_all on public.production_resources
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy production_coverages_owner_all on public.production_coverages
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy production_tasks_owner_all on public.production_tasks
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create or replace function public.production_move_schedule_item(
  p_production_id uuid,
  p_item_id uuid,
  p_expected_revision integer,
  p_direction integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_item public.production_schedule_items%rowtype;
  neighbor_item public.production_schedule_items%rowtype;
begin
  if actor_id is null or p_direction not in (-1, 1) then
    return false;
  end if;

  select * into target_item
  from public.production_schedule_items
  where id = p_item_id
    and production_id = p_production_id
    and owner_id = actor_id
    and revision = p_expected_revision
  for update;

  if not found then
    return false;
  end if;

  if p_direction = -1 then
    select * into neighbor_item
    from public.production_schedule_items
    where production_id = target_item.production_id
      and owner_id = target_item.owner_id
      and day_id is not distinct from target_item.day_id
      and position < target_item.position
    order by position desc, created_at desc
    limit 1
    for update;
  else
    select * into neighbor_item
    from public.production_schedule_items
    where production_id = target_item.production_id
      and owner_id = target_item.owner_id
      and day_id is not distinct from target_item.day_id
      and position > target_item.position
    order by position asc, created_at asc
    limit 1
    for update;
  end if;

  if not found then
    return true;
  end if;

  update public.production_schedule_items
    set position = neighbor_item.position,
        revision = revision + 1,
        updated_at = clock_timestamp()
    where id = target_item.id;

  update public.production_schedule_items
    set position = target_item.position,
        revision = revision + 1,
        updated_at = clock_timestamp()
    where id = neighbor_item.id;

  return true;
end;
$$;

revoke all on function public.production_move_schedule_item(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.production_move_schedule_item(uuid, uuid, integer, integer) to authenticated, service_role;

create or replace function private.production_day_date_changed()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.shoot_date is distinct from new.shoot_date then
    update public.production_coverages
      set status = case when status = 'confirmed' then 'tentative' else status end,
          confirmed_for_date = null,
          needs_reconfirmation = (status <> 'unassigned'),
          revision = revision + 1,
          updated_at = clock_timestamp()
      where day_id = new.id and owner_id = new.owner_id and production_id = new.production_id;
  end if;
  return new;
end;
$$;

revoke all on function private.production_day_date_changed() from public, anon, authenticated;

create trigger production_days_reconfirm_coverages
after update of shoot_date on public.production_days
for each row execute function private.production_day_date_changed();

commit;
