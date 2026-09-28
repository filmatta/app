import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const attemptsUser = "44444444-4444-4444-8444-444444444444";
const operation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceHash = "a".repeat(64);
const optionsHash = "b".repeat(64);
let createdScriptId = "";

type RpcValue = {
  id: string;
  reused: boolean;
  status: string;
};

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant usage on schema private to service_role;
    create table public.writer_scripts(
      id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
      title text not null, document jsonb not null, schema_version integer not null default 1,
      revision bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    alter table public.writer_scripts enable row level security;
    grant select on public.writer_scripts to authenticated;
    create policy writer_owner on public.writer_scripts for select to authenticated using(owner_id=auth.uid());
    create function private.writer_validate_payload(p_title text,p_document jsonb,p_schema_version integer) returns void
      language plpgsql set search_path='' as $$begin
        if p_schema_version<>1 or p_document->>'type' is distinct from 'doc' or jsonb_typeof(p_document->'content') is distinct from 'array' then
          raise exception 'WRITER_INVALID_DOCUMENT';
        end if;
      end$$;
    insert into auth.users values('${owner}'),('${other}'),('${attemptsUser}');
  `);
  await db.exec(fs.readFileSync("supabase/migrations/20260930020000_writer_assisted_imports.sql", "utf8"));
});

after(() => db.close());

async function as(role: "postgres" | "service_role" | "authenticated", uid = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}

test("reservation, provider accounting, finalization, and the lifetime Free right are atomic and idempotent", async () => {
  await as("service_role");
  const args = [owner, operation, sourceHash, optionsHash, "pasted", "QA", 10, 20, 100, "gpt-5.6-luna"];
  const first = ((await db.query("select writer_reserve_assisted_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value", args)).rows[0] as { value: RpcValue }).value;
  const replay = ((await db.query("select writer_reserve_assisted_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value", args)).rows[0] as { value: RpcValue }).value;
  assert.equal(first.id, operation);
  assert.equal(replay.id, operation);
  assert.equal(first.reused, false);
  assert.equal(replay.reused, true);
  await assert.rejects(db.query(
    "select writer_reserve_assisted_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [owner, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "c".repeat(64), optionsHash, "pasted", "QA", 10, 20, 100, "gpt-5.6-luna"],
  ), /WRITER_IMPORT_ACTIVE/u);

  const requestHash = "d".repeat(64);
  await db.query("select writer_reserve_assisted_import_call($1,$2,0,$3,5000)", [owner, operation, requestHash]);
  const reservedReplay = ((await db.query("select writer_reserve_assisted_import_call($1,$2,0,$3,5000) value", [owner, operation, requestHash])).rows[0] as { value: RpcValue }).value;
  assert.equal(reservedReplay.status, "reserved");
  await db.query("select writer_settle_assisted_import_call($1,$2,0,'completed',$3,100,20,40,0,70)", [owner, operation, JSON.stringify({ classifications: [], evidence: [], observations: [] })]);

  const document = { type: "doc", content: [{ type: "screenplayBlock", attrs: { id: "33333333-3333-4333-8333-333333333333", kind: "action" }, content: [{ type: "text", text: "Texto íntegro." }] }] };
  const finalizeArgs = [owner, operation, "QA", JSON.stringify(document), 1, "writer-import-ai-v1", "gpt-5.6-luna", "[]", "[]", "[]"];
  const finished = ((await db.query("select writer_finalize_assisted_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value", finalizeArgs)).rows[0] as { value: RpcValue }).value;
  const finishedReplay = ((await db.query("select writer_finalize_assisted_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value", finalizeArgs)).rows[0] as { value: RpcValue }).value;
  assert.equal(finished.id, finishedReplay.id);
  createdScriptId = finished.id;
  assert.equal(finishedReplay.reused, true);
  await as("postgres");
  assert.equal(((await db.query("select count(*)::int count from writer_scripts where owner_id=$1", [owner])).rows[0] as { count: number }).count, 1);
  assert.equal(((await db.query("select actual_cost_microusd from writer_assisted_imports where id=$1", [operation])).rows[0] as { actual_cost_microusd: number }).actual_cost_microusd, 70);

});

test("analysis and decisions remain owner-isolated while service accounting is not client-editable", async () => {
  await as("authenticated", other);
  assert.equal(((await db.query("select count(*)::int count from writer_import_analyses")).rows[0] as { count: number }).count, 0);
  await assert.rejects(db.query("select * from writer_assisted_imports"), /permission denied/u);
  await assert.rejects(db.query("update writer_assisted_imports set actual_cost_microusd=0"), /permission denied/u);
  await assert.rejects(db.query("select writer_reserve_assisted_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [
    other, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "f".repeat(64), optionsHash, "pasted", "QA other", 10, 20, 100, "gpt-5.6-luna",
  ]), /permission denied/u);
});

test("three failed starts remain counted for 24 hours and a fourth attempt is rejected", async () => {
  await as("service_role");
  for (let index = 0; index < 3; index += 1) {
    const id = `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`;
    await db.query("select writer_reserve_assisted_import($1,$2,$3,$4,'pasted',$5,10,20,100,'gpt-5.6-luna')", [
      attemptsUser, id, String(index).padStart(64, "a"), optionsHash, `Attempt ${index}`,
    ]);
    await db.query("select writer_fail_assisted_import($1,$2,'failed','synthetic')", [attemptsUser, id]);
  }
  await assert.rejects(db.query("select writer_reserve_assisted_import($1,$2,$3,$4,'pasted','Fourth',10,20,100,'gpt-5.6-luna')", [
    attemptsUser, "66666666-6666-4666-8666-666666666666", "9".repeat(64), optionsHash,
  ]), /WRITER_IMPORT_ATTEMPTS/u);
});

test("an explicit retry resumes one operation and preserves completed batch checkpoints", async () => {
  await as("service_role");
  const resumeUser = "55555555-5555-4555-8555-555555555555";
  await as("postgres");
  await db.query("insert into auth.users(id) values($1)", [resumeUser]);
  await as("service_role");
  const resumeOperation = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const reserveArgs = [resumeUser, resumeOperation, "1".repeat(64), optionsHash, "pasted", "Resume", 10, 20, 100, "gpt-5.6-luna"];
  await db.query("select writer_reserve_assisted_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", reserveArgs);
  await db.query("select writer_reserve_assisted_import_call($1,$2,0,$3,5000)", [resumeUser, resumeOperation, "2".repeat(64)]);
  await db.query("select writer_settle_assisted_import_call($1,$2,0,'completed',$3,100,0,40,0,70)", [resumeUser, resumeOperation, JSON.stringify({ classifications: [], evidence: [], observations: [] })]);
  await db.query("select writer_reserve_assisted_import_call($1,$2,1,$3,5000)", [resumeUser, resumeOperation, "3".repeat(64)]);
  await db.query("select writer_settle_assisted_import_call($1,$2,1,'failed',null,50,0,0,0,10)", [resumeUser, resumeOperation]);
  await db.query("select writer_fail_assisted_import($1,$2,'failed','provider_invalid_output')", [resumeUser, resumeOperation]);

  const resumed = ((await db.query("select writer_reserve_assisted_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value", reserveArgs)).rows[0] as { value: RpcValue & { resumed: boolean } }).value;
  assert.equal(resumed.reused, false);
  assert.equal(resumed.resumed, true);
  const completed = ((await db.query("select writer_reserve_assisted_import_call($1,$2,0,$3,5000) value", [resumeUser, resumeOperation, "2".repeat(64)])).rows[0] as { value: RpcValue }).value;
  assert.equal(completed.status, "completed");
  await db.query("select writer_reserve_assisted_import_call($1,$2,1,$3,5000)", [resumeUser, resumeOperation, "3".repeat(64)]);
  const counts = (await db.query("select provider_calls,actual_cost_microusd,reserved_cost_microusd from writer_assisted_imports where id=$1", [resumeOperation])).rows[0] as {
    provider_calls: number; actual_cost_microusd: number; reserved_cost_microusd: number;
  };
  assert.deepEqual(counts, { provider_calls: 3, actual_cost_microusd: 80, reserved_cost_microusd: 5000 });
  await db.query("select writer_fail_assisted_import($1,$2,'failed','qa_cleanup')", [resumeUser, resumeOperation]);
});

test("deleting an imported document does not restore the completed Free entitlement", async () => {
  await as("postgres");
  await db.query("delete from writer_scripts where id=$1", [createdScriptId]);
  await as("service_role");
  await assert.rejects(db.query(
    "select writer_reserve_assisted_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [owner, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "e".repeat(64), optionsHash, "pasted", "QA 2", 10, 20, 100, "gpt-5.6-luna"],
  ), /WRITER_IMPORT_FREE_USED/u);
});

test("the global two-dollar ledger blocks another provider reservation", async () => {
  await as("postgres");
  for (let index = 0; index < 10; index += 1) {
    const user = `77777777-7777-4777-8777-${String(index).padStart(12, "0")}`;
    const id = `88888888-8888-4888-8888-${String(index).padStart(12, "0")}`;
    await db.query("insert into auth.users(id) values($1)", [user]);
    await db.query(`insert into writer_assisted_imports(
      id,owner_id,source_hash,options_hash,source_format,title,status,source_words,source_tokens,source_bytes,actual_cost_microusd
    ) values($1,$2,$3,$4,'pasted','Budget','failed',1,1,1,$5)`, [
      id, user, String(index).padStart(64, "b"), optionsHash, index === 9 ? 199_930 : 200_000,
    ]);
  }
  const budgetUser = "99999999-9999-4999-8999-999999999999";
  const budgetOperation = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  await db.query("insert into auth.users(id) values($1)", [budgetUser]);
  await as("service_role");
  await db.query("select writer_reserve_assisted_import($1,$2,$3,$4,'pasted','Budget gate',1,1,1,'gpt-5.6-luna')", [
    budgetUser, budgetOperation, "f".repeat(64), optionsHash,
  ]);
  await assert.rejects(db.query("select writer_reserve_assisted_import_call($1,$2,0,$3,1)", [
    budgetUser, budgetOperation, "e".repeat(64),
  ]), /WRITER_IMPORT_GLOBAL_BUDGET/u);
});
