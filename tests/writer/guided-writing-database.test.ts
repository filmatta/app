import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const script = "33333333-3333-4333-8333-333333333333";
const scene = "44444444-4444-4444-8444-444444444444";
const hash = "a".repeat(64);
const requestHash = "b".repeat(64);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create table public.writer_scripts(
      id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,title text not null,
      document jsonb not null,schema_version integer not null default 1,revision bigint not null default 1,
      created_at timestamptz not null default now(),updated_at timestamptz not null default now()
    );
    create table public.plan_entitlements(
      plan_code text not null,entitlement_key text not null,access_value boolean,allowance_value numeric,
      allowance_unit text,unlimited boolean not null default false,fair_use boolean not null default false,
      primary key(plan_code,entitlement_key)
    );
    alter table public.writer_scripts enable row level security;
    grant select on public.writer_scripts to authenticated;
    create policy writer_owner on public.writer_scripts for select to authenticated using(owner_id=auth.uid());
    insert into auth.users values('${owner}'),('${other}');
    insert into writer_scripts values('${script}','${owner}','QA','{"type":"doc","content":[]}',1,1,now(),now());
  `);
  await db.exec(fs.readFileSync("supabase/migrations/20260930210000_writer_guided_writing_v1.sql", "utf8"));
});

after(() => db.close());

async function as(role: "postgres" | "service_role" | "authenticated", uid = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [uid, role]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}

test("reservation creates a scene-scoped session and persists only the user question/hash", async () => {
  await as("service_role");
  const operation = "55555555-5555-4555-8555-555555555551";
  const result = await db.query(
    "select writer_reserve_guided_writing($1,$2,$3,null,'scene',$4,$5,$6,'gpt-5.6-terra','Quiero que Marta mienta.',50000,10000000) value",
    [owner, operation, script, scene, hash, requestHash],
  );
  const value = (result.rows[0] as { value: { status: string; session_id: string } }).value;
  assert.equal(value.status, "reserved");
  await as("postgres");
  const session = (await db.query("select scope,scene_id from writer_guided_writing_sessions")).rows[0];
  assert.deepEqual(session, { scope: "scene", scene_id: scene });
  const message = (await db.query("select role,content,response_payload,document_hash from writer_guided_writing_messages")).rows[0];
  assert.deepEqual(message, { role: "user", content: "Quiero que Marta mienta.", response_payload: null, document_hash: hash });
});

test("settlement appends structured assistant output and records usage/cost/latency", async () => {
  await as("service_role");
  const operation = "55555555-5555-4555-8555-555555555551";
  const response = { summary: "La decisión cambia el equilibrio.", questions: [{ id: "q1" }, { id: "q2" }], options: [], references: [], warnings: [], redirectedFromWritingRequest: false };
  await db.query("select writer_settle_guided_writing($1,$2,'completed',$3,null,1200,200,500,0,8400,1900)", [owner, operation, JSON.stringify(response)]);
  await as("postgres");
  const operationRow = (await db.query("select status,actual_cost_microusd,latency_ms from writer_guided_writing_operations where id=$1", [operation])).rows[0];
  assert.deepEqual(operationRow, { status: "completed", actual_cost_microusd: 8_400, latency_ms: 1_900 });
  const roles = (await db.query("select role from writer_guided_writing_messages order by created_at,id")).rows.map((row) => (row as { role: string }).role);
  assert.deepEqual(roles, ["user", "assistant"]);
});

test("follow-up reuses the session while creating a new ledger operation", async () => {
  await as("postgres");
  const sessionId = String(((await db.query("select id from writer_guided_writing_sessions limit 1")).rows[0] as { id: string }).id);
  await as("service_role");
  const result = await db.query(
    "select writer_reserve_guided_writing($1,$2,$3,$4,'scene',$5,$6,$7,'gpt-5.6-terra','Quiero que Luis sospeche.',50000,10000000) value",
    [owner, "55555555-5555-4555-8555-555555555552", script, sessionId, scene, hash, "c".repeat(64)],
  );
  assert.equal((result.rows[0] as { value: { session_id: string } }).value.session_id, sessionId);
  await as("postgres");
  assert.equal(((await db.query("select count(*)::int count from writer_guided_writing_sessions")).rows[0] as { count: number }).count, 1);
  assert.equal(((await db.query("select count(*)::int count from writer_guided_writing_operations")).rows[0] as { count: number }).count, 2);
});

test("scope invariants reject document sessions with a scene", async () => {
  await as("service_role");
  await assert.rejects(db.query(
    "select writer_reserve_guided_writing($1,$2,$3,null,'document',$4,$5,$6,'gpt-5.6-terra','Pregunta global.',50000,10000000)",
    [owner, "55555555-5555-4555-8555-555555555553", script, scene, hash, "d".repeat(64)],
  ), /WRITER_GUIDED_INVALID/u);
});

test("owner RLS exposes sessions/messages but not ledger or another account", async () => {
  await as("authenticated", owner);
  assert.equal(((await db.query("select count(*)::int count from writer_guided_writing_sessions")).rows[0] as { count: number }).count, 1);
  assert.ok(((await db.query("select count(*)::int count from writer_guided_writing_messages")).rows[0] as { count: number }).count >= 3);
  await assert.rejects(db.query("select * from writer_guided_writing_operations"), /permission denied/u);
  await assert.rejects(db.query("delete from writer_guided_writing_messages"), /permission denied/u);
  await as("authenticated", other);
  assert.equal(((await db.query("select count(*)::int count from writer_guided_writing_sessions")).rows[0] as { count: number }).count, 0);
});

test("the entitlement is prepared without adding a paywall", async () => {
  await as("postgres");
  const row = (await db.query("select plan_code,entitlement_key,access_value from plan_entitlements where entitlement_key='writer.guided_writing'")).rows[0];
  assert.deepEqual(row, { plan_code: "free", entitlement_key: "writer.guided_writing", access_value: true });
});
