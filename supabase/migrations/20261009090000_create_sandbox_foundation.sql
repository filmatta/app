-- Crear / Creative Sandbox: private conversational sessions and structured idea state.
begin;

create table public.create_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  converted_writer_id uuid,
  title text not null,
  premise text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint create_sessions_id_owner_unique unique (id, owner_id),
  constraint create_sessions_project_owner_fk
    foreign key (project_id, owner_id)
    references public.projects(id, owner_id)
    on delete set null (project_id)
    deferrable initially deferred,
  constraint create_sessions_converted_writer_fk
    foreign key (converted_writer_id, owner_id, project_id)
    references public.writer_scripts(id, owner_id, project_id)
    on delete set null (converted_writer_id)
    deferrable initially deferred,
  constraint create_sessions_conversion_project_required
    check (converted_writer_id is null or project_id is not null),
  constraint create_sessions_title_length
    check (char_length(btrim(title)) between 1 and 160),
  constraint create_sessions_premise_length
    check (premise is null or char_length(btrim(premise)) between 1 and 12000),
  constraint create_sessions_timestamps_check
    check (isfinite(created_at) and isfinite(updated_at) and updated_at >= created_at)
);

create table public.create_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  owner_id uuid not null,
  role text not null,
  content text not null,
  parent_message_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint create_messages_session_owner_fk
    foreign key (session_id, owner_id)
    references public.create_sessions(id, owner_id)
    on delete cascade,
  constraint create_messages_session_owner_id_unique unique (session_id, owner_id, id),
  constraint create_messages_parent_session_fk
    foreign key (session_id, owner_id, parent_message_id)
    references public.create_messages(session_id, owner_id, id)
    on delete set null (parent_message_id)
    deferrable initially deferred,
  constraint create_messages_role_check check (role in ('user', 'assistant')),
  constraint create_messages_content_length
    check (char_length(btrim(content)) between 1 and 50000),
  constraint create_messages_parent_not_self
    check (parent_message_id is null or parent_message_id <> id),
  constraint create_messages_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint create_messages_metadata_size
    check (octet_length(metadata::text) <= 65536),
  constraint create_messages_created_at_finite check (isfinite(created_at))
);

create table public.create_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  owner_id uuid not null,
  type text not null,
  suggested_type text,
  title text,
  content text not null,
  state text not null default 'active',
  source_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint create_items_session_owner_fk
    foreign key (session_id, owner_id)
    references public.create_sessions(id, owner_id)
    on delete cascade,
  constraint create_items_source_message_session_fk
    foreign key (session_id, owner_id, source_message_id)
    references public.create_messages(session_id, owner_id, id)
    on delete set null (source_message_id)
    deferrable initially deferred,
  constraint create_items_type_check
    check (type in ('premise', 'character', 'world', 'theme', 'pending')),
  constraint create_items_suggested_type_check
    check (suggested_type is null or suggested_type in ('premise', 'character', 'world', 'theme', 'pending')),
  constraint create_items_title_length
    check (title is null or char_length(btrim(title)) between 1 and 160),
  constraint create_items_content_length
    check (char_length(btrim(content)) between 1 and 12000),
  constraint create_items_state_check
    check (state in ('active', 'canon', 'maybe', 'discarded')),
  constraint create_items_timestamps_check
    check (isfinite(created_at) and isfinite(updated_at) and updated_at >= created_at)
);

create table public.create_signals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  owner_id uuid not null,
  message_id uuid,
  signal_type text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint create_signals_session_owner_fk
    foreign key (session_id, owner_id)
    references public.create_sessions(id, owner_id)
    on delete cascade,
  constraint create_signals_message_session_fk
    foreign key (session_id, owner_id, message_id)
    references public.create_messages(session_id, owner_id, id)
    on delete set null (message_id)
    deferrable initially deferred,
  constraint create_signals_type_format
    check (signal_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint create_signals_value_size
    check (octet_length(value::text) <= 65536),
  constraint create_signals_created_at_finite check (isfinite(created_at))
);

create index create_sessions_owner_updated_idx
  on public.create_sessions(owner_id, updated_at desc, id);
create index create_sessions_owner_project_idx
  on public.create_sessions(owner_id, project_id)
  where project_id is not null;
create index create_sessions_owner_writer_idx
  on public.create_sessions(owner_id, converted_writer_id)
  where converted_writer_id is not null;

create index create_messages_session_created_idx
  on public.create_messages(session_id, owner_id, created_at, id);
create index create_messages_parent_idx
  on public.create_messages(session_id, owner_id, parent_message_id)
  where parent_message_id is not null;

create index create_items_session_state_type_idx
  on public.create_items(session_id, owner_id, state, type, updated_at desc, id);
create index create_items_source_message_idx
  on public.create_items(session_id, owner_id, source_message_id)
  where source_message_id is not null;

create index create_signals_session_created_idx
  on public.create_signals(session_id, owner_id, created_at desc, id);
create index create_signals_message_idx
  on public.create_signals(session_id, owner_id, message_id, created_at desc)
  where message_id is not null;

create function private.set_create_sandbox_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_create_sandbox_updated_at()
  from public, anon, authenticated;

create trigger create_sessions_set_updated_at
before update on public.create_sessions
for each row execute function private.set_create_sandbox_updated_at();

create trigger create_items_set_updated_at
before update on public.create_items
for each row execute function private.set_create_sandbox_updated_at();

alter table public.create_sessions enable row level security;
alter table public.create_messages enable row level security;
alter table public.create_items enable row level security;
alter table public.create_signals enable row level security;

revoke all on public.create_sessions, public.create_messages,
  public.create_items, public.create_signals
  from public, anon, authenticated;

grant select, insert, update, delete on public.create_sessions,
  public.create_messages, public.create_items
  to authenticated;
grant select, insert on public.create_signals to authenticated;

create policy create_sessions_owner_read
  on public.create_sessions for select to authenticated
  using (owner_id = (select auth.uid()));

create policy create_sessions_owner_insert
  on public.create_sessions for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy create_sessions_owner_update
  on public.create_sessions for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy create_sessions_owner_delete
  on public.create_sessions for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy create_messages_owner_read
  on public.create_messages for select to authenticated
  using (owner_id = (select auth.uid()));

create policy create_messages_owner_insert
  on public.create_messages for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy create_messages_owner_update
  on public.create_messages for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy create_messages_owner_delete
  on public.create_messages for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy create_items_owner_read
  on public.create_items for select to authenticated
  using (owner_id = (select auth.uid()));

create policy create_items_owner_insert
  on public.create_items for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy create_items_owner_update
  on public.create_items for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy create_items_owner_delete
  on public.create_items for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy create_signals_owner_read
  on public.create_signals for select to authenticated
  using (owner_id = (select auth.uid()));

create policy create_signals_owner_insert
  on public.create_signals for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- Recover the exact Writer created by this Crear session when Writer creation
-- committed but the subsequent session link did not. The caller can only
-- recover its own session and its own create operation.
create function public.create_recover_writer_conversion_v1(p_session_id uuid)
returns table (project_id uuid, writer_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  session_project_id uuid;
  session_writer_id uuid;
  recovered_project_id uuid;
  recovered_writer_id uuid;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'CREATE_UNAUTHENTICATED';
  end if;
  if p_session_id is null then
    raise exception using errcode = '22023', message = 'CREATE_SESSION_REQUIRED';
  end if;

  select s.project_id, s.converted_writer_id
    into session_project_id, session_writer_id
  from public.create_sessions s
  where s.id = p_session_id and s.owner_id = actor
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'CREATE_SESSION_NOT_FOUND';
  end if;

  if session_writer_id is not null then
    return query select session_project_id, session_writer_id;
    return;
  end if;

  select w.project_id, w.id
    into recovered_project_id, recovered_writer_id
  from public.writer_operations o
  join public.writer_scripts w
    on w.id = o.script_id and w.owner_id = o.user_id
  where o.user_id = actor
    and o.operation_id = p_session_id
    and o.operation_kind = 'create';
  if not found then
    return;
  end if;
  if recovered_project_id is null then
    raise exception using errcode = 'P0001', message = 'CREATE_WRITER_PROJECT_MISSING';
  end if;
  if session_project_id is not null and session_project_id is distinct from recovered_project_id then
    raise exception using errcode = '23514', message = 'CREATE_WRITER_PROJECT_MISMATCH';
  end if;

  update public.create_sessions
  set project_id = recovered_project_id,
      converted_writer_id = recovered_writer_id
  where id = p_session_id and owner_id = actor;

  return query select recovered_project_id, recovered_writer_id;
end;
$$;

revoke all on function public.create_recover_writer_conversion_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.create_recover_writer_conversion_v1(uuid)
  to authenticated;

comment on table public.create_sessions is
  'Private Crear workspaces owned by one authenticated user.';
comment on table public.create_messages is
  'Conversational Crear messages; replies are constrained to the same session.';
comment on table public.create_items is
  'User-controlled structured story elements and creative states.';
comment on table public.create_signals is
  'Interaction signals kept separate from project content for future personalization and evals.';

commit;
