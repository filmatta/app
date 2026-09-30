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
const version = "assistant-core-v1";

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
    alter table public.writer_scripts enable row level security;
    grant select on public.writer_scripts to authenticated;
    create policy writer_owner on public.writer_scripts for select to authenticated using(owner_id=auth.uid());
    insert into auth.users values('${owner}'),('${other}');
    insert into writer_scripts values('${script}','${owner}','QA','{"type":"doc","content":[]}',1,1,now(),now());
  `);
  await db.exec(fs.readFileSync("supabase/migrations/20260930110000_writer_script_assistant_core.sql", "utf8"));
});

after(() => db.close());

async function as(role: "postgres" | "service_role" | "authenticated", uid = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [uid, role]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}

async function reserve(operation: string, sourceHash = hash) {
  return (await db.query("select writer_reserve_scene_analysis($1,$2,$3,$4,$5,$6,'gpt-5.6-terra',$7,20000,10000000) value", [
    owner, operation, script, scene, sourceHash, version, sourceHash,
  ])).rows[0] as { value: { status: string; cached: boolean; operation_id?: string } };
}

test("same user/script/scene/hash/version is one logical provider operation across tabs", async () => {
  await as("service_role");
  const firstOperation = "55555555-5555-4555-8555-555555555551";
  const secondOperation = "55555555-5555-4555-8555-555555555552";
  const [first, second] = await Promise.all([reserve(firstOperation), reserve(secondOperation)]);
  assert.deepEqual([first.value.status, second.value.status].sort(), ["analyzing", "reserved"]);
  await as("postgres");
  assert.equal(((await db.query("select count(*)::int count from writer_scene_analysis_operations")).rows[0] as { count: number }).count, 1);
  const operationId = first.value.operation_id ?? second.value.operation_id ?? firstOperation;
  const payload = {
    objective: { value: "Abrir la puerta.", confidence: "high", evidence: [{ blockId: scene }] },
    obstacle: { value: null, confidence: "low", evidence: [] },
    change: { value: null, confidence: "low", evidence: [] }, observations: [],
  };
  await as("service_role");
  await db.query("select writer_settle_scene_analysis($1,$2,'completed',$3,null,1000,0,200,0,4300)", [owner, operationId, JSON.stringify(payload)]);
  const cached = await reserve("55555555-5555-4555-8555-555555555553");
  assert.equal(cached.value.status, "fresh");
  assert.equal(cached.value.cached, true);
  await as("postgres");
  assert.equal(((await db.query("select count(*)::int count from writer_scene_analysis_operations")).rows[0] as { count: number }).count, 1);
});

test("overrides survive a new hash and dismissals are exact-hash scoped", async () => {
  await as("service_role");
  await db.query("select writer_save_scene_analysis_override($1,$2,$3,'objective','Definido por la autora')", [owner, script, scene]);
  await db.query("select writer_set_scene_observation_dismissed($1,$2,$3,$4,$5,'obs-1',true)", [owner, script, scene, hash, version]);
  const nextHash = "b".repeat(64);
  await reserve("66666666-6666-4666-8666-666666666666", nextHash);
  await as("postgres");
  const override = (await db.query("select objective from writer_scene_analysis_overrides where owner_id=$1 and script_id=$2 and scene_id=$3", [owner, script, scene])).rows[0] as { objective: string };
  assert.equal(override.objective, "Definido por la autora");
  assert.equal(((await db.query("select count(*)::int count from writer_scene_observation_dismissals where source_hash=$1", [hash])).rows[0] as { count: number }).count, 1);
  assert.equal(((await db.query("select count(*)::int count from writer_scene_observation_dismissals where source_hash=$1", [nextHash])).rows[0] as { count: number }).count, 0);
});

test("owner RLS exposes structured analysis but never the operation ledger or cross-account rows", async () => {
  await as("authenticated", owner);
  assert.equal(((await db.query("select count(*)::int count from writer_scene_analyses")).rows[0] as { count: number }).count, 2);
  await assert.rejects(db.query("select * from writer_scene_analysis_operations"), /permission denied/u);
  await assert.rejects(db.query("update writer_scene_analyses set status='fresh'"), /permission denied/u);
  await as("authenticated", other);
  assert.equal(((await db.query("select count(*)::int count from writer_scene_analyses")).rows[0] as { count: number }).count, 0);
  assert.equal(((await db.query("select count(*)::int count from writer_scene_analysis_overrides")).rows[0] as { count: number }).count, 0);
});

test("ledger preserves exact reservation and actual settlement", async () => {
  await as("postgres");
  const row = (await db.query("select reserved_cost_microusd,actual_cost_microusd,input_tokens,output_tokens,status from writer_scene_analysis_operations where source_hash=$1", [hash])).rows[0] as Record<string, unknown>;
  assert.deepEqual(row, { reserved_cost_microusd: 20_000, actual_cost_microusd: 4_300, input_tokens: 1_000, output_tokens: 200, status: "completed" });
});
