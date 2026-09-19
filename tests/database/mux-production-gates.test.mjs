import assert from "node:assert/strict";
import fs from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = fs.readFileSync(
  "supabase/migrations/20260918010000_mux_production_gates.sql",
  "utf8",
);

before(async () => {
  await db.exec(`
    create role service_role;
    create role authenticated;

    create table public.courses (
      id uuid primary key,
      status text not null,
      sort_order integer not null default 0
    );

    create table public.lesson_videos (
      id uuid primary key,
      mux_asset_id text,
      mux_playback_id text,
      status text not null default 'preparing'
    );

    alter table public.lesson_videos enable row level security;
    create policy lesson_videos_admin_all
      on public.lesson_videos
      for all
      to authenticated
      using (true)
      with check (true);

    insert into public.courses (id, status)
    values ('00000000-0000-4000-8000-000000000001', 'published');

    insert into public.lesson_videos (
      id,
      mux_asset_id,
      mux_playback_id,
      status
    ) values (
      '00000000-0000-4000-8000-000000000002',
      'legacy-development-asset',
      'legacy-development-playback',
      'ready'
    );
  `);

  await db.exec(migration);
});

after(async () => db.close());

test("listing defaults to true and the public catalog index is partial", async () => {
  const existing = await db.query(
    "select is_listed from public.courses where id='00000000-0000-4000-8000-000000000001'",
  );
  assert.equal(existing.rows[0].is_listed, true);

  await db.query(
    "insert into public.courses (id,status) values ($1,'draft')",
    ["00000000-0000-4000-8000-000000000003"],
  );
  const created = await db.query(
    "select is_listed from public.courses where id=$1",
    ["00000000-0000-4000-8000-000000000003"],
  );
  assert.equal(created.rows[0].is_listed, true);

  const index = await db.query(
    "select indexdef from pg_indexes where indexname='courses_public_catalog_order_idx'",
  );
  assert.match(index.rows[0].indexdef, /status = 'published'.*is_listed/i);
});

test("legacy provenance remains unset until a validated reconciliation", async () => {
  const legacy = await db.query(
    "select mux_environment_id,mux_environment_type from public.lesson_videos where id=$1",
    ["00000000-0000-4000-8000-000000000002"],
  );
  assert.equal(legacy.rows[0].mux_environment_id, null);
  assert.equal(legacy.rows[0].mux_environment_type, null);

  const constraints = await db.query(
    "select conname,convalidated from pg_constraint where conname like 'lesson_videos_mux_%_check' order by conname",
  );
  assert.equal(constraints.rows.length, 2);
  assert.deepEqual(
    constraints.rows,
    [
      {
        conname: "lesson_videos_mux_environment_pair_check",
        convalidated: true,
      },
      {
        conname: "lesson_videos_mux_references_require_environment_check",
        convalidated: false,
      },
    ],
  );
});

test("new Mux references require a complete valid environment pair", async () => {
  await assert.rejects(
    db.query(
      "insert into public.lesson_videos (id,mux_asset_id,mux_playback_id,status) values ($1,'asset','playback','ready')",
      ["00000000-0000-4000-8000-000000000004"],
    ),
    /lesson_videos_mux_references_require_environment_check/,
  );

  await assert.rejects(
    db.query(
      "insert into public.lesson_videos (id,mux_environment_id,mux_environment_type) values ($1,'env','staging')",
      ["00000000-0000-4000-8000-000000000005"],
    ),
    /lesson_videos_mux_environment_pair_check/,
  );

  await db.query(
    `insert into public.lesson_videos (
      id,mux_asset_id,mux_playback_id,mux_environment_id,mux_environment_type,status
    ) values ($1,'asset','playback','kospfo','development','ready')`,
    ["00000000-0000-4000-8000-000000000006"],
  );
});

test("RLS, admin policy and least-privilege service role grants remain intact", async () => {
  const relation = await db.query(
    "select relrowsecurity from pg_class where oid='public.lesson_videos'::regclass",
  );
  assert.equal(relation.rows[0].relrowsecurity, true);

  const policy = await db.query(
    "select policyname from pg_policies where tablename='lesson_videos' and policyname='lesson_videos_admin_all'",
  );
  assert.equal(policy.rows.length, 1);

  const privileges = await db.query(`
    select
      has_column_privilege('service_role','public.lesson_videos','mux_environment_id','SELECT') as can_select,
      has_column_privilege('service_role','public.lesson_videos','mux_environment_id','UPDATE') as can_update,
      has_table_privilege('service_role','public.lesson_videos','INSERT') as can_insert
  `);
  assert.deepEqual(privileges.rows[0], {
    can_select: true,
    can_update: true,
    can_insert: false,
  });
});
