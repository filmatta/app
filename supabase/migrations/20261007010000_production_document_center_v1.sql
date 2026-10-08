begin;

alter table public.production_resources
  add column role text check (role is null or char_length(role) <= 120),
  add column phone text check (phone is null or char_length(phone) <= 60),
  add column include_in_call_sheet boolean not null default false;

create table public.production_document_exports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  production_id uuid not null,
  document_key text not null check (char_length(document_key) between 1 and 100),
  version_major integer not null default 1 check (version_major between 1 and 999),
  version_minor integer not null default 0 check (version_minor between 0 and 999),
  generated_at timestamptz not null default clock_timestamp(),
  generated_by uuid not null references auth.users(id),
  source_updated_at timestamptz not null,
  source_fingerprint text not null check (char_length(source_fingerprint) between 8 and 80),
  revision integer not null default 1 check (revision > 0),
  foreign key (production_id, owner_id)
    references public.production_plans(id, owner_id) on delete cascade,
  unique (production_id, document_key)
);

create index production_document_exports_owner_idx
  on public.production_document_exports(owner_id, production_id);

alter table public.production_document_exports enable row level security;
revoke all on public.production_document_exports from public, anon, authenticated;
grant select, insert, update on public.production_document_exports to authenticated;
grant all on public.production_document_exports to service_role;

create policy production_document_exports_owner_all on public.production_document_exports
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

commit;
