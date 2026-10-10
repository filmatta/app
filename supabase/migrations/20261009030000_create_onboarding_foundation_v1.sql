begin;

create table public.create_onboarding_states (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'not_started',
  intention text,
  project_id uuid,
  writer_id uuid,
  current_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint create_onboarding_status_check check (status in (
    'not_started','intention_selected','in_progress','project_guided',
    'writer_opened','completed','skipped'
  )),
  constraint create_onboarding_intention_check check (
    intention is null or intention in ('idea','new_script','existing_script')
  )
);

create table public.create_idea_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  idea text not null default '',
  answers jsonb not null default '{}'::jsonb,
  current_question_id text,
  current_step text not null default 'capture',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint create_idea_drafts_idea_length check (char_length(idea) <= 10000),
  constraint create_idea_drafts_answers_object check (jsonb_typeof(answers) = 'object'),
  constraint create_idea_drafts_step_check check (current_step in ('capture','detail','ready'))
);

create unique index create_idea_drafts_one_active_per_owner on public.create_idea_drafts(owner_id);
create index create_onboarding_states_project_idx on public.create_onboarding_states(project_id) where project_id is not null;

alter table public.create_onboarding_states enable row level security;
alter table public.create_idea_drafts enable row level security;

create policy create_onboarding_owner_select on public.create_onboarding_states for select to authenticated using (owner_id = (select auth.uid()));
create policy create_onboarding_owner_insert on public.create_onboarding_states for insert to authenticated with check (owner_id = (select auth.uid()));
create policy create_onboarding_owner_update on public.create_onboarding_states for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy create_idea_drafts_owner_select on public.create_idea_drafts for select to authenticated using (owner_id = (select auth.uid()));
create policy create_idea_drafts_owner_insert on public.create_idea_drafts for insert to authenticated with check (owner_id = (select auth.uid()));
create policy create_idea_drafts_owner_update on public.create_idea_drafts for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy create_idea_drafts_owner_delete on public.create_idea_drafts for delete to authenticated using (owner_id = (select auth.uid()));

-- Project Writer creation is idempotent at the Project level. An existing
-- Writer is always reused, including after a retry with a different operation
-- id. Project creation must not be blocked by the legacy standalone quota.
create or replace function public.writer_create_project_script_v1(
  p_project_id uuid,
  p_operation_id uuid,
  p_title text,
  p_document jsonb,
  p_schema_version integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
  fingerprint text;
  existing_operation public.writer_operations%rowtype;
  existing_script_id uuid;
  created_id uuid;
begin
  if actor is null then raise exception using errcode='42501', message='WRITER_UNAUTHENTICATED'; end if;
  if p_project_id is null or p_operation_id is null then raise exception using errcode='22023', message='WRITER_OPERATION_REQUIRED'; end if;
  perform private.writer_validate_payload(p_title, p_document, p_schema_version);
  perform 1 from public.projects where id=p_project_id and owner_id=actor and lifecycle_status<>'archived' for share;
  if not found then raise exception using errcode='42501', message='PROJECT_UNAVAILABLE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_project_id::text, 8741));
  select id into existing_script_id from public.writer_scripts
    where owner_id=actor and project_id=p_project_id order by created_at asc limit 1;
  if existing_script_id is not null then return existing_script_id; end if;
  fingerprint := md5('create-project-v1|' || p_project_id::text || '|' || btrim(p_title) || '|' || p_schema_version::text || '|' || p_document::text);
  select * into existing_operation from public.writer_operations where user_id=actor and operation_id=p_operation_id;
  if found then
    if existing_operation.operation_kind<>'create' or existing_operation.request_hash<>fingerprint then
      raise exception using errcode='22023', message='WRITER_OPERATION_REUSED';
    end if;
    return existing_operation.script_id;
  end if;
  insert into public.writer_scripts(owner_id,project_id,title,document,schema_version)
    values(actor,p_project_id,btrim(p_title),p_document,p_schema_version) returning id into created_id;
  insert into public.writer_operations(user_id,operation_id,operation_kind,request_hash,script_id,result_revision)
    values(actor,p_operation_id,'create',fingerprint,created_id,1);
  return created_id;
end;
$$;

revoke all on function public.writer_create_project_script_v1(uuid,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.writer_create_project_script_v1(uuid,uuid,text,jsonb,integer) to authenticated;

commit;
