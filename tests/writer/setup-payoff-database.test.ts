import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const script = "33333333-3333-4333-8333-333333333333";
const sceneA = "44444444-4444-4444-8444-444444444441";
const sceneB = "44444444-4444-4444-8444-444444444442";
const blockA = "55555555-5555-4555-8555-555555555551";
const blockB = "55555555-5555-4555-8555-555555555552";
const hash = "a".repeat(64);

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
  await db.exec(fs.readFileSync("supabase/migrations/20260930110000_writer_script_assistant_core.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/20260930200000_writer_setup_payoff_v1.sql", "utf8"));
});

after(() => db.close());

async function as(role: "postgres" | "service_role" | "authenticated", uid = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [uid, role]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}

test("analysis reservation coalesces identical script hashes and records cost/latency", async () => {
  await as("service_role");
  const firstId = "66666666-6666-4666-8666-666666666661";
  const secondId = "66666666-6666-4666-8666-666666666662";
  const reserve = (id: string) => db.query("select writer_reserve_setup_payoff_analysis($1,$2,$3,$4,'setup-payoff-v1','gpt-5.6-terra',$5,80000,10000000) value", [owner, id, script, hash, hash]);
  const [first, second] = await Promise.all([reserve(firstId), reserve(secondId)]);
  const statuses = [first.rows[0], second.rows[0]].map((row) => (row as { value: { status: string } }).value.status).sort();
  assert.deepEqual(statuses, ["analyzing", "reserved"]);
  const reservedRow = [first.rows[0], second.rows[0]].map((row) => (row as { value: { status: string; operation_id?: string } }).value).find((row) => row.status === "reserved")!;
  await db.query("select writer_settle_setup_payoff_analysis($1,$2,'completed',$3,null,1200,200,400,0,7200,1800)", [owner, reservedRow.operation_id, JSON.stringify({ elements: 2, links: 1 })]);
  const cached = await reserve("66666666-6666-4666-8666-666666666663");
  assert.equal((cached.rows[0] as { value: { status: string; cached: boolean } }).value.status, "fresh");
  await as("postgres");
  const operation = (await db.query("select status,reserved_cost_microusd,actual_cost_microusd,latency_ms from writer_setup_payoff_operations")).rows[0];
  assert.deepEqual(operation, { status: "completed", reserved_cost_microusd: 80_000, actual_cost_microusd: 7_200, latency_ms: 1_800 });
});

test("manual elements support many-to-many links and confirmed state persists", async () => {
  await as("service_role");
  const setup = (await db.query("select writer_create_narrative_element($1,$2,$3,$4,'setup','Promesa','Luis promete volver') id", [owner, script, sceneA, blockA])).rows[0] as { id: string };
  const payoff = (await db.query("select writer_create_narrative_element($1,$2,$3,$4,'payoff','Regreso','Luis vuelve') id", [owner, script, sceneB, blockB])).rows[0] as { id: string };
  const link = (await db.query("select writer_create_narrative_link($1,$2,$3,$4) id", [owner, script, setup.id, payoff.id])).rows[0] as { id: string };
  await db.query("select writer_set_narrative_link_status($1,$2,$3,'confirmed')", [owner, script, link.id]);
  await as("postgres");
  assert.equal(((await db.query("select count(*)::int count from writer_narrative_elements where status='confirmed'")).rows[0] as { count: number }).count, 2);
  assert.equal(((await db.query("select count(*)::int count from writer_narrative_links where status='confirmed'")).rows[0] as { count: number }).count, 1);
});

test("dismissal is durable and scene deletion leaves a safe orphaned reference", async () => {
  await as("service_role");
  const link = (await db.query("select id from writer_narrative_links limit 1")).rows[0] as { id: string };
  await db.query("select writer_set_narrative_link_status($1,$2,$3,'dismissed')", [owner, script, link.id]);
  await as("postgres");
  await db.query("update writer_scripts set document=$1::jsonb where id=$2", [JSON.stringify({ type: "doc", content: [] }), script]);
  assert.equal(((await db.query("select count(*)::int count from writer_narrative_links where status='dismissed'")).rows[0] as { count: number }).count, 1);
  assert.equal(((await db.query("select count(*)::int count from writer_narrative_elements")).rows[0] as { count: number }).count, 2);
});

test("owner RLS exposes elements and links but not accounting or another account", async () => {
  await as("authenticated", owner);
  assert.equal(((await db.query("select count(*)::int count from writer_narrative_elements")).rows[0] as { count: number }).count, 2);
  assert.equal(((await db.query("select count(*)::int count from writer_narrative_links")).rows[0] as { count: number }).count, 1);
  await assert.rejects(db.query("select * from writer_setup_payoff_operations"), /permission denied/u);
  await assert.rejects(db.query("update writer_narrative_elements set status='confirmed'"), /permission denied/u);
  await as("authenticated", other);
  assert.equal(((await db.query("select count(*)::int count from writer_narrative_elements")).rows[0] as { count: number }).count, 0);
});

test("entitlement is prepared without a paywall or Stripe mutation", async () => {
  await as("postgres");
  const row = (await db.query("select plan_code,entitlement_key,access_value from plan_entitlements where entitlement_key='writer.setup_payoff'")).rows[0];
  assert.deepEqual(row, { plan_code: "free", entitlement_key: "writer.setup_payoff", access_value: true });
});
