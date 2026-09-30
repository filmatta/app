import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";

async function as(role, uid = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}

const projectPayload = (title = "Videoclip — Los Astros") => ({
  title,
  slug: "videoclip-los-astros",
  summary: "Producción musical independiente",
  description: "Un videoclip nocturno en Ciudad de México.",
  project_type: "Videoclip",
  client_name: "Los Astros",
  share_client_name: true,
  client_type: "Artista",
  city: "Ciudad de México",
  work_area: "Centro",
  shooting_schedule: "night",
  economic_mode: "paid",
  date_window: "Octubre 2026",
  starts_on: "2026-10-10",
  ends_on: "2026-10-11",
  dates_confirmed: false,
  roles: ["Dirección de fotografía"],
  requirements: { themes: [], participation: [], conditions: [] },
  operational_status: "active",
  lifecycle_status: "draft",
  visibility: "private",
});

const opportunityPayload = (title = "Buscamos directora de fotografía") => ({
  title,
  project_id: null,
  summary: "Crew para videoclip",
  description: "Buscamos experiencia visual para un videoclip independiente.",
  category: "crew",
  discipline: "Dirección de fotografía",
  city: "Ciudad de México",
  work_mode: "on_site",
  compensation_type: "paid",
  compensation_min: 5000,
  compensation_max: null,
  compensation_currency: "MXN",
  starts_on: "2026-10-10",
  ends_on: "2026-10-11",
  application_deadline: null,
  opportunity_type: "opportunity",
  deliverables: null,
});

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function private.is_admin() returns boolean language sql stable as $$ select false $$;
    create function private.project_requirements_valid(jsonb) returns boolean language sql immutable as $$ select true $$;
    grant usage on schema public to anon, authenticated;
    grant usage on schema auth, private to authenticated;
    grant execute on function private.project_requirements_valid(jsonb) to authenticated;

    create table public.projects (
      id uuid primary key default gen_random_uuid(), owner_id uuid not null, title text not null,
      slug text not null unique, summary text, status text not null default 'draft', published_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      networking_private boolean not null default false, project_type text not null default 'Otro',
      client_name text not null default '', share_client_name boolean not null default false,
      client_type text not null default 'Otro', city text not null default '', work_area text not null default '',
      shooting_schedule text not null default 'day', economic_mode text not null default 'undecided',
      date_window text not null default '', roles text[] not null default '{}',
      requirements jsonb not null default '{"themes":[],"participation":[],"conditions":[]}',
      operational_status text not null default 'active',
      constraint projects_id_owner_unique unique(id,owner_id),
      constraint projects_v0_fields check (
        project_type in ('Cortometraje','Largometraje','Series','Documental','Publicidad','Videoclip','Contenido digital','Eventos','Fotografía','Live session','Otro')
        and client_type in ('Artista','Marca','Agencia','Productora','Proyecto personal','Institución','Otro')
        and length(client_name)<=120 and length(city)<=80 and length(work_area)<=80 and length(date_window)<=100
        and shooting_schedule in ('day','night','mixed') and economic_mode in ('paid','collaboration','undecided')
        and cardinality(roles)<=16
      )
    );
    create table public.opportunities (
      id uuid primary key default gen_random_uuid(), project_id uuid not null, owner_id uuid not null,
      title text not null, slug text not null unique, summary text, description text, category text not null,
      discipline text, city text, work_mode text not null default 'on_site', compensation_type text not null default 'unspecified',
      compensation_min numeric(12,2), compensation_max numeric(12,2), compensation_currency text,
      starts_on date, ends_on date, application_deadline timestamptz, status text not null default 'draft',
      published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      opportunity_type text not null default 'opportunity', deliverables text,
      constraint opportunities_project_owner_fk foreign key(project_id,owner_id)
        references public.projects(id,owner_id) on update restrict on delete cascade
    );
    alter table public.projects enable row level security;
    alter table public.opportunities enable row level security;
    grant select,insert,update,delete on public.projects,public.opportunities to authenticated;
    grant select on public.projects,public.opportunities to anon;
    create policy projects_public_read on public.projects for select to anon,authenticated using(status='published' and not networking_private);
    create policy projects_owner_read on public.projects for select to authenticated using(auth.uid()=owner_id);
    create policy projects_owner_insert on public.projects for insert to authenticated with check(auth.uid()=owner_id);
    create policy projects_owner_update on public.projects for update to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
    create policy projects_owner_delete on public.projects for delete to authenticated using(auth.uid()=owner_id);
    create policy opportunities_public_read on public.opportunities for select to anon,authenticated using(status='published' and exists(select 1 from public.projects p where p.id=project_id and p.status='published'));
    create policy opportunities_owner_read on public.opportunities for select to authenticated using(auth.uid()=owner_id);
    create policy opportunities_owner_insert on public.opportunities for insert to authenticated with check(auth.uid()=owner_id and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid()));
    create policy opportunities_owner_update on public.opportunities for update to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid()));
    create policy opportunities_owner_delete on public.opportunities for delete to authenticated using(auth.uid()=owner_id);
    insert into auth.users(id) values
      ('11111111-1111-4111-8111-111111111111'),
      ('22222222-2222-4222-8222-222222222222');
  `);
  for (const file of [
    "20260930100000_projects_v1_5_schema.sql",
    "20260930102000_projects_opportunities_v1_5_functions.sql",
  ]) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
});

after(async () => db.close());

test("Projects keep lifecycle and public visibility independent", async () => {
  await as("authenticated", owner);
  const id = (
    await db.query("select save_my_project_v15(null,$1) id", [projectPayload()])
  ).rows[0].id;
  const originalSlug = (
    await db.query("select slug from projects where id=$1", [id])
  ).rows[0].slug;
  await db.query("select save_my_project_v15($1,$2)", [
    id,
    projectPayload("Videoclip editado"),
  ]);
  assert.equal(
    (await db.query("select slug from projects where id=$1", [id])).rows[0].slug,
    originalSlug,
  );
  await as("authenticated", stranger);
  await assert.rejects(
    db.query("select save_my_project_v15($1,$2)", [id, projectPayload("Ajeno")]),
    /Project unavailable/,
  );
  await as("anon");
  assert.equal((await db.query("select id from projects where id=$1", [id])).rows.length, 0);

  await as("authenticated", owner);
  await db.query("select save_my_project_v15($1,$2)", [
    id,
    { ...projectPayload(), lifecycle_status: "active", visibility: "public" },
  ]);
  await as("anon");
  const published = (await db.query("select status,lifecycle_status,visibility from projects where id=$1", [id])).rows[0];
  assert.deepEqual(published, { status: "published", lifecycle_status: "active", visibility: "public" });

  await as("authenticated", owner);
  await db.query("select save_my_project_v15($1,$2)", [
    id,
    { ...projectPayload("Videoclip editado"), lifecycle_status: "active", visibility: "private" },
  ]);
  await as("anon");
  assert.equal((await db.query("select id from projects where id=$1", [id])).rows.length, 0);

  await as("authenticated", owner);
  await db.query("select save_my_project_v15($1,$2)", [
    id,
    { ...projectPayload("Videoclip editado"), lifecycle_status: "archived", visibility: "private" },
  ]);
  assert.equal(
    (await db.query("select status,lifecycle_status,visibility from projects where id=$1", [id])).rows[0].status,
    "archived",
  );
});

test("independent and linked Opportunities enforce common ownership", async () => {
  await as("authenticated", owner);
  const independent = (
    await db.query("select save_my_opportunity(null,$1,null,'published') id", [opportunityPayload()])
  ).rows[0].id;
  const project = (
    await db.query("select save_my_project_v15(null,$1) id", [projectPayload("Segundo proyecto")])
  ).rows[0].id;
  const linked = opportunityPayload("Casting protagonista");
  linked.project_id = project;
  await db.query("select save_my_opportunity(null,$1,null,'draft')", [linked]);
  await db.query("select save_my_opportunity(null,$1,null,'published')", [
    { ...linked, title: "Buscamos maquillista" },
  ]);
  assert.equal(
    (await db.query("select count(*)::int n from opportunities where project_id=$1", [project])).rows[0].n,
    2,
  );

  await as("authenticated", stranger);
  await assert.rejects(
    db.query("select save_my_opportunity(null,$1,null,'draft')", [linked]),
    /Project unavailable/,
  );
  await as("anon");
  assert.equal((await db.query("select id from opportunities where id=$1", [independent])).rows.length, 1);
});

test("conversion keeps the Opportunity and returns the same Project on retries", async () => {
  await as("authenticated", owner);
  const opportunity = (
    await db.query("select save_my_opportunity(null,$1,null,'draft') id", [
      opportunityPayload("Buscamos maquillista"),
    ])
  ).rows[0].id;
  const first = (
    await db.query("select convert_my_opportunity_to_project($1) id", [opportunity])
  ).rows[0].id;
  const second = (
    await db.query("select convert_my_opportunity_to_project($1) id", [opportunity])
  ).rows[0].id;
  assert.equal(first, second);
  const row = (
    await db.query("select project_id,status from opportunities where id=$1", [opportunity])
  ).rows[0];
  assert.equal(row.project_id, first);
  assert.equal(row.status, "draft");
  assert.equal((await db.query("select count(*)::int n from projects where id=$1", [first])).rows[0].n, 1);
  await assert.rejects(db.query("delete from projects where id=$1", [first]), /foreign key/);
});
