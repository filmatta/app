import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const shotlist = "33333333-3333-4333-8333-333333333333";
const group = "44444444-4444-4444-8444-444444444444";
const shot = "55555555-5555-4555-8555-555555555555";
const createOperation = "66666666-6666-4666-8666-666666666666";

const emptyDocument = JSON.stringify({ schemaVersion: 1, frame: { width: 1600, height: 900 }, reference: null, objects: [] });
const drawingDocument = JSON.stringify({ schemaVersion: 1, frame: { width: 1600, height: 900 }, reference: null, objects: [{ id: "77777777-7777-4777-8777-777777777777", type: "stroke", color: "#ffffff", opacity: 1, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 8, points: [{ x: 1, y: 1 }, { x: 10, y: 10 }] }] });

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table public.writer_scripts(id uuid primary key,owner_id uuid not null references auth.users(id),title text not null,document jsonb not null,revision bigint not null default 1);
    create table public.plan_entitlements(plan_code text not null,entitlement_key text not null,access_value boolean,allowance_value numeric,allowance_unit text,unlimited boolean not null default false,fair_use boolean not null default false,primary key(plan_code,entitlement_key));
    grant usage on schema public,auth,storage,private to anon,authenticated,service_role;
    alter table writer_scripts enable row level security; grant select on writer_scripts to authenticated;
    create policy writer_owner on writer_scripts for select to authenticated using(owner_id=auth.uid());
    insert into auth.users values('${owner}'),('${other}');
  `);
  await db.exec(fs.readFileSync("supabase/migrations/20261002010000_writer_breakdown_shotlist_v1.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/20261002230000_storyboard_sketcher_foundation_v1.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/20261002231000_storyboard_conflict_sqlstate.sql", "utf8"));
  await db.exec(`
    insert into writer_shotlists(id,owner_id,title,creation_operation_id) values('${shotlist}','${owner}','Libre','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    insert into writer_shotlist_groups(id,owner_id,shotlist_id,title,position,source_status,creation_operation_id) values('${group}','${owner}','${shotlist}','Escena manual',0,'manual','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    insert into writer_shotlist_shots(id,owner_id,shotlist_id,group_id,origin,position,creation_operation_id) values('${shot}','${owner}','${shotlist}','${group}','manual',0,'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  `);
});

after(() => db.close());

async function as(role: "postgres" | "service_role" | "authenticated", uid = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}

async function createPanel(operation = createOperation) {
  const result = await db.query(`select * from storyboard_create_panel($1,$2,$3,$4,$5::jsonb,1,null,null,1600,900,'empty',$6,1,$7)`, [owner, shotlist, shot, operation, emptyDocument, "a".repeat(64), "b".repeat(64)]);
  return result.rows[0] as { panel_id: string; revision_id: string; revision_number: number; no_op: boolean };
}

test("panel creation is atomic and idempotent", async () => {
  await as("service_role");
  const first = await createPanel();
  const second = await createPanel();
  assert.equal(first.panel_id, second.panel_id);
  assert.equal(first.revision_id, second.revision_id);
  assert.equal(((await db.query("select count(*)::int count from storyboard_panel_revisions")).rows[0] as { count: number }).count, 1);
});

test("autosave advances the head with compare-and-swap and keeps no-op idempotent", async () => {
  await as("service_role");
  const current = (await db.query("select id,current_revision_id from storyboard_panels limit 1")).rows[0] as { id: string; current_revision_id: string };
  const operation = "88888888-8888-4888-8888-888888888888";
  const saved = await db.query(`select * from storyboard_save_panel_revision($1,$2,$3,$4,$5::jsonb,1,null,null,1600,900,'drawing',$6,1,$7)`, [owner, current.id, current.current_revision_id, operation, drawingDocument, "c".repeat(64), "b".repeat(64)]);
  const next = saved.rows[0] as { revision_id: string; revision_number: number };
  assert.equal(next.revision_number, 2);
  const duplicate = await db.query(`select * from storyboard_save_panel_revision($1,$2,$3,$4,$5::jsonb,1,null,null,1600,900,'drawing',$6,1,$7)`, [owner, current.id, current.current_revision_id, operation, drawingDocument, "c".repeat(64), "b".repeat(64)]);
  assert.equal((duplicate.rows[0] as { revision_id: string }).revision_id, next.revision_id);
  await assert.rejects(db.query(`select * from storyboard_save_panel_revision($1,$2,$3,$4,$5::jsonb,1,null,null,1600,900,'drawing',$6,1,$7)`, [owner, current.id, current.current_revision_id, "99999999-9999-4999-8999-999999999999", drawingDocument, "d".repeat(64), "b".repeat(64)]), /STORYBOARD_REVISION_CONFLICT/u);
});

test("approval targets exactly the confirmed non-empty revision", async () => {
  await as("service_role");
  const panel = (await db.query("select id,current_revision_id from storyboard_panels limit 1")).rows[0] as { id: string; current_revision_id: string };
  const approval = await db.query("select storyboard_approve_panel($1,$2,$3) id", [owner, panel.id, panel.current_revision_id]);
  assert.ok((approval.rows[0] as { id: string }).id);
  const duplicate = await db.query("select * from storyboard_duplicate_panel($1,$2,$3)", [owner, panel.id, "aaaaaaaa-0000-4000-8000-000000000001"]);
  const copy = duplicate.rows[0] as { panel_id: string; revision_id: string };
  assert.notEqual(copy.panel_id, panel.id);
  assert.equal(((await db.query("select count(*)::int count from storyboard_panel_approvals where panel_id=$1", [copy.panel_id])).rows[0] as { count: number }).count, 0);
});

test("legacy shot deletion is blocked while storyboard dependencies exist", async () => {
  await as("authenticated", owner);
  await assert.rejects(db.query("select writer_delete_shots($1,$2::uuid[])", [shotlist, [shot]]), /SHOTLIST_STORYBOARD_DEPENDENCY/u);
});

test("RLS prevents user B from reading or mutating user A storyboard", async () => {
  await as("authenticated", other);
  assert.equal(((await db.query("select count(*)::int count from storyboard_panels")).rows[0] as { count: number }).count, 0);
  await assert.rejects(db.query("delete from storyboard_panels"), /permission denied/u);
  await assert.rejects(db.query(`select * from storyboard_create_panel($1,$2,$3,$4,$5::jsonb,1,null,null,1600,900,'empty',$6,1,$7)`, [other, shotlist, shot, "aaaaaaaa-0000-4000-8000-000000000002", emptyDocument, "a".repeat(64), "b".repeat(64)]), /permission denied/u);
});
