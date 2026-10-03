import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const script = "33333333-3333-4333-8333-333333333333";
const scene = "44444444-4444-4444-8444-444444444444";
const block = "55555555-5555-4555-8555-555555555555";
const operation = "66666666-6666-4666-8666-666666666666";

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
    insert into writer_scripts values('${script}','${owner}','LA FRECUENCIA',$doc$${JSON.stringify({ type: "doc", content: [
      { type: "screenplayBlock", attrs: { id: scene, kind: "sceneHeading" }, content: [{ type: "text", text: "INT. RADIO K-17 - NOCHE" }] },
      { type: "screenplayBlock", attrs: { id: block, kind: "action" }, content: [{ type: "text", text: "Mara sostiene una pistola." }] },
    ] })}$doc$::jsonb,1);
  `);
  await db.exec(fs.readFileSync("supabase/migrations/20261002010000_writer_breakdown_shotlist_v1.sql", "utf8"));
});

after(() => db.close());

async function as(role: "postgres" | "service_role" | "authenticated", uid = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}

test("shotlist creation is idempotent and derives groups from canonical scene IDs", async () => {
  await as("authenticated", owner);
  const first = await db.query("select writer_create_shotlist($1,'LA FRECUENCIA — Shotlist',$2) id", [script, operation]);
  const second = await db.query("select writer_create_shotlist($1,'Otro título',$2) id", [script, operation]);
  assert.equal((first.rows[0] as { id: string }).id, (second.rows[0] as { id: string }).id);
  assert.deepEqual((await db.query("select source_scene_id,title,source_status from writer_shotlist_groups")).rows[0], { source_scene_id: scene, title: "INT. RADIO K-17 - NOCHE", source_status: "linked" });
});

test("manual groups and shots work without screenplay scene IDs", async () => {
  await as("authenticated", owner);
  const listId = (await db.query("select writer_create_shotlist(null,'Libre',$1) id", ["77777777-7777-4777-8777-777777777777"])).rows[0] as { id: string };
  const groupId = (await db.query("select id from writer_shotlist_groups where shotlist_id=$1", [listId.id])).rows[0] as { id: string };
  const first = await db.query("select writer_add_shot($1,$2,$3,'manual') id", [listId.id, groupId.id, "88888888-8888-4888-8888-888888888888"]);
  const second = await db.query("select writer_add_shot($1,$2,$3,'manual') id", [listId.id, groupId.id, "88888888-8888-4888-8888-888888888888"]);
  assert.equal((first.rows[0] as { id: string }).id, (second.rows[0] as { id: string }).id);
});

test("owner A reads only own data and authenticated users cannot bypass server mutations", async () => {
  await as("authenticated", owner);
  assert.equal(((await db.query("select count(*)::int count from writer_shotlists")).rows[0] as { count: number }).count, 2);
  await assert.rejects(db.query("update writer_shotlists set title='Bypass'"), /permission denied/u);
  await assert.rejects(db.query("select * from writer_production_operations"), /permission denied/u);
  await as("authenticated", other);
  assert.equal(((await db.query("select count(*)::int count from writer_shotlists")).rows[0] as { count: number }).count, 0);
  await assert.rejects(db.query("select writer_add_shotlist_group($1,'Ataque',$2)", ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]), /SHOTLIST_NOT_FOUND/u);
});

test("service role can persist evidence but does not expose it across owner RLS", async () => {
  await as("service_role");
  const element = (await db.query("insert into writer_breakdown_elements(owner_id,script_id,category,name,normalized_name,status,source,fingerprint) values($1,$2,'prop','Pistola','PISTOLA','suggested','rule','prop:pistola:scene:block:used') returning id", [owner, script])).rows[0] as { id: string };
  await db.query("insert into writer_breakdown_appearances(owner_id,script_id,element_id,scene_id,block_id,excerpt,nature,source_revision,source_hash) values($1,$2,$3,$4,$5,'Mara sostiene una pistola.','used',1,$6)", [owner, script, element.id, scene, block, "a".repeat(64)]);
  await as("authenticated", owner);
  assert.equal(((await db.query("select count(*)::int count from writer_breakdown_appearances")).rows[0] as { count: number }).count, 1);
  await as("authenticated", other);
  assert.equal(((await db.query("select count(*)::int count from writer_breakdown_appearances")).rows[0] as { count: number }).count, 0);
});

test("private bucket and entitlement-ready keys are installed", async () => {
  await as("postgres");
  assert.deepEqual((await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='writer-production-assets'")).rows[0], { public: false, file_size_limit: 5_000_000, allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] });
  assert.equal(((await db.query("select count(*)::int count from plan_entitlements where entitlement_key in ('writer.breakdown','writer.shotlist') and access_value=true")).rows[0] as { count: number }).count, 2);
});
