import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const attemptsUser = "44444444-4444-4444-8444-444444444444";
const historicalUser = "33333333-3333-4333-8333-333333333334";
const historicalOperation = "33333333-3333-4333-8333-333333333335";
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
    insert into auth.users values('${owner}'),('${other}'),('${attemptsUser}'),('${historicalUser}');
  `);
  await db.exec(fs.readFileSync("supabase/migrations/20260930020000_writer_assisted_imports.sql", "utf8"));
  await db.query(`insert into writer_assisted_imports(
    id,owner_id,source_hash,options_hash,source_format,title,status,source_words,source_tokens,source_bytes,actual_cost_microusd
  ) values($1,$2,$3,$4,'pasted','Historical','failed',1,1,1,1234)`, [
    historicalOperation, historicalUser, "7".repeat(64), optionsHash,
  ]);
  await db.exec(fs.readFileSync("supabase/migrations/20260930030000_writer_assisted_import_operation_budgets.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/20260930031000_writer_assisted_import_budget_status.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/20260930032000_writer_assisted_import_ordinary_budget.sql", "utf8"));
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
  await assert.rejects(db.query("update writer_assisted_imports set operation_budget_microusd=600000"), /permission denied/u);
  await assert.rejects(db.query("select writer_grant_assisted_import_qa_budget($1,$2,$3,clock_timestamp()+interval '1 hour')", [
    other, "dddddddd-dddd-4ddd-8ddd-dddddddddddc", "6".repeat(64),
  ]), /permission denied/u);
  await assert.rejects(db.query("select writer_assisted_import_qa_budget_status($1)", [other]), /permission denied/u);
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

test("historical operations retain their spend and ordinary budget after migration", async () => {
  await as("postgres");
  const row = (await db.query(
    "select actual_cost_microusd,reserved_cost_microusd,operation_budget_microusd from writer_assisted_imports where id=$1",
    [historicalOperation],
  )).rows[0] as { actual_cost_microusd: number; reserved_cost_microusd: number; operation_budget_microusd: number };
  assert.deepEqual(row, { actual_cost_microusd: 1234, reserved_cost_microusd: 0, operation_budget_microusd: 200_000 });
});

test("a theoretical 361620 plan with a 124104 Terra base creates an ordinary 200000 operation", async () => {
  const user = "10000000-1000-4000-8000-100000000000";
  const id = "10000000-1000-4000-8000-100000000001";
  const hash = "0".repeat(64);
  const theoreticalMaximum = 361_620;
  const baseReservation = 124_104;
  await as("postgres");
  await db.query("insert into auth.users(id) values($1)", [user]);
  await as("service_role");
  const authorization = ((await db.query(
    "select writer_assisted_import_authorized_budget($1,$2,$3) value", [user, id, hash],
  )).rows[0] as { value: RpcValue & { authorized_budget_microusd: number; authorization: string } }).value;
  assert.deepEqual(authorization, { authorized_budget_microusd: 200_000, authorization: "ordinary" });
  assert.ok(theoreticalMaximum > authorization.authorized_budget_microusd);
  const value = ((await db.query(
    "select writer_reserve_assisted_import($1,$2,$3,$4,'pasted','Ordinary base',1,1,1,'gpt-5.6-terra+gpt-5.6-sol',$5) value",
    [user, id, hash, optionsHash, baseReservation],
  )).rows[0] as { value: RpcValue & { operation_budget_microusd: number } }).value;
  assert.equal(value.operation_budget_microusd, 200_000);
  await db.query("select writer_fail_assisted_import($1,$2,'failed','qa_cleanup')", [user, id]);
});

test("ordinary over-budget base and client-like 600000 requests do not create operations or calls", async () => {
  const user = "10000000-1000-4000-8000-100000000010";
  const hash = "a".repeat(64);
  await as("postgres");
  await db.query("insert into auth.users(id) values($1)", [user]);
  await as("service_role");
  for (const [id, requested] of [
    ["10000000-1000-4000-8000-100000000011", 210_000],
    ["10000000-1000-4000-8000-100000000012", 600_000],
  ] as const) {
    await assert.rejects(db.query(
      "select writer_reserve_assisted_import($1,$2,$3,$4,'pasted','Over budget',1,1,1,'gpt-5.6-terra+gpt-5.6-sol',$5)",
      [user, id, hash, optionsHash, requested],
    ), /WRITER_IMPORT_BUDGET/u);
  }
  assert.equal(((await db.query(
    "select count(*)::int count from writer_assisted_imports where owner_id=$1", [user],
  )).rows[0] as { count: number }).count, 0);
  assert.equal(((await db.query(
    "select count(*)::int count from writer_assisted_import_batches where operation_id in ($1,$2)",
    ["10000000-1000-4000-8000-100000000011", "10000000-1000-4000-8000-100000000012"],
  )).rows[0] as { count: number }).count, 0);
});

test("legacy callers and ordinary operations remain capped at 200000 microdollars", async () => {
  const user = "10101010-1010-4010-8010-101010101010";
  const id = "10101010-1010-4010-8010-101010101011";
  await as("postgres");
  await db.query("insert into auth.users(id) values($1)", [user]);
  await as("service_role");
  const value = ((await db.query(
    "select writer_reserve_assisted_import($1,$2,$3,$4,'pasted','Ordinary',1,1,1,'gpt-5.6-terra') value",
    [user, id, "1".repeat(64), optionsHash],
  )).rows[0] as { value: RpcValue & { operation_budget_microusd: number } }).value;
  assert.equal(value.operation_budget_microusd, 200_000);
  await assert.rejects(db.query("select writer_reserve_assisted_import_call($1,$2,0,$3,200001)", [
    user, id, "2".repeat(64),
  ]), /WRITER_IMPORT_BUDGET/u);
  await db.query("select writer_fail_assisted_import($1,$2,'failed','qa_cleanup')", [user, id]);
});

test("one exact QA grant persists a 600000 budget and cannot be reused", async () => {
  const user = "20202020-2020-4020-8020-202020202020";
  const id = "20202020-2020-4020-8020-202020202021";
  const otherId = "20202020-2020-4020-8020-202020202022";
  const hash = "2".repeat(64);
  await as("postgres");
  await db.query("insert into auth.users(id) values($1)", [user]);
  await as("service_role");
  await db.query("select writer_grant_assisted_import_qa_budget($1,$2,$3,clock_timestamp()+interval '1 hour')", [user, id, hash]);
  const authorization = ((await db.query(
    "select writer_assisted_import_authorized_budget($1,$2,$3) value", [user, id, hash],
  )).rows[0] as { value: RpcValue & { authorized_budget_microusd: number; authorization: string } }).value;
  assert.deepEqual(authorization, { authorized_budget_microusd: 600_000, authorization: "qa_grant" });
  const value = ((await db.query(
    "select writer_reserve_assisted_import($1,$2,$3,$4,'pasted','QA budget',1,1,1,'gpt-5.6-terra+gpt-5.6-sol',541152) value",
    [user, id, hash, optionsHash],
  )).rows[0] as { value: RpcValue & { operation_budget_microusd: number } }).value;
  assert.equal(value.operation_budget_microusd, 600_000);
  const grants = ((await db.query(
    "select writer_assisted_import_qa_budget_status($1) value", [user],
  )).rows[0] as { value: Array<{ operation_id: string; status: string; budget_microusd: number }> }).value;
  assert.deepEqual(grants.map((grant) => ({
    operation_id: grant.operation_id,status: grant.status,budget_microusd: grant.budget_microusd,
  })), [{ operation_id: id, status: "consumed", budget_microusd: 600_000 }]);
  await as("postgres");
  assert.equal(((await db.query(
    "select status from private.writer_assisted_import_budget_grants where operation_id=$1", [id],
  )).rows[0] as { status: string }).status, "consumed");
  await as("service_role");
  await assert.rejects(db.query(
    "select writer_reserve_assisted_import($1,$2,$3,$4,'pasted','Other operation',1,1,1,'gpt-5.6-terra+gpt-5.6-sol',541152)",
    [user, otherId, hash, optionsHash],
  ), /WRITER_IMPORT_(?:ACTIVE|BUDGET_AUTHORIZATION)/u);
  await db.query("select writer_reserve_assisted_import_call($1,$2,0,$3,600000)", [user, id, "3".repeat(64)]);
  await assert.rejects(db.query("select writer_reserve_assisted_import_call($1,$2,1,$3,1)", [
    user, id, "4".repeat(64),
  ]), /WRITER_IMPORT_BUDGET/u);
  await db.query("select writer_fail_assisted_import($1,$2,'failed','qa_cleanup')", [user, id]);
  await db.query("select writer_revoke_assisted_import_qa_budget($1,$2)", [user, id]);
});

test("a QA grant cannot authorize another account, hash, or plan above 600000", async () => {
  const user = "30303030-3030-4030-8030-303030303030";
  const anotherUser = "30303030-3030-4030-8030-303030303031";
  const id = "30303030-3030-4030-8030-303030303032";
  const hash = "3".repeat(64);
  await as("postgres");
  await db.query("insert into auth.users(id) values($1),($2)", [user, anotherUser]);
  await as("service_role");
  await db.query("select writer_grant_assisted_import_qa_budget($1,$2,$3,clock_timestamp()+interval '1 hour')", [user, id, hash]);
  await assert.rejects(db.query(
    "select writer_assisted_import_authorized_budget($1,$2,$3)", [anotherUser, id, hash],
  ), /WRITER_IMPORT_BUDGET_AUTHORIZATION/u);
  await assert.rejects(db.query(
    "select writer_assisted_import_authorized_budget($1,$2,$3)", [user, id, "4".repeat(64)],
  ), /WRITER_IMPORT_BUDGET_AUTHORIZATION/u);
  await assert.rejects(db.query(
    "select writer_reserve_assisted_import($1,$2,$3,$4,'pasted','Wrong owner',1,1,1,'gpt-5.6-terra+gpt-5.6-sol',541152)",
    [anotherUser, id, hash, optionsHash],
  ), /WRITER_IMPORT_BUDGET_AUTHORIZATION/u);
  await assert.rejects(db.query(
    "select writer_reserve_assisted_import($1,$2,$3,$4,'pasted','Wrong hash',1,1,1,'gpt-5.6-terra+gpt-5.6-sol',541152)",
    [user, id, "4".repeat(64), optionsHash],
  ), /WRITER_IMPORT_BUDGET_AUTHORIZATION/u);
  await assert.rejects(db.query(
    "select writer_reserve_assisted_import($1,$2,$3,$4,'pasted','Too expensive',1,1,1,'gpt-5.6-terra+gpt-5.6-sol',600001)",
    [user, id, hash, optionsHash],
  ), /WRITER_IMPORT_INVALID/u);
  await db.query("select writer_revoke_assisted_import_qa_budget($1,$2)", [user, id]);
});

test("concurrent-looking reservations cannot exceed the persisted operation budget", async () => {
  const user = "40404040-4040-4040-8040-404040404040";
  const id = "40404040-4040-4040-8040-404040404041";
  const hash = "4".repeat(64);
  await as("postgres");
  await db.query("insert into auth.users(id) values($1)", [user]);
  await as("service_role");
  await db.query("select writer_grant_assisted_import_qa_budget($1,$2,$3,clock_timestamp()+interval '1 hour')", [user, id, hash]);
  await db.query(
    "select writer_reserve_assisted_import($1,$2,$3,$4,'pasted','Concurrent',1,1,1,'gpt-5.6-terra+gpt-5.6-sol',541152)",
    [user, id, hash, optionsHash],
  );
  const reservations = await Promise.allSettled([
    db.query("select writer_reserve_assisted_import_call($1,$2,0,$3,350000)", [user, id, "5".repeat(64)]),
    db.query("select writer_reserve_assisted_import_call($1,$2,1,$3,350000)", [user, id, "6".repeat(64)]),
  ]);
  assert.equal(reservations.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(reservations.filter((item) => item.status === "rejected").length, 1);
  const row = (await db.query(
    "select actual_cost_microusd,reserved_cost_microusd,operation_budget_microusd from writer_assisted_imports where id=$1", [id],
  )).rows[0] as { actual_cost_microusd: number; reserved_cost_microusd: number; operation_budget_microusd: number };
  assert.equal(row.actual_cost_microusd + row.reserved_cost_microusd, 350_000);
  assert.equal(row.operation_budget_microusd, 600_000);
  await db.query("select writer_fail_assisted_import($1,$2,'failed','qa_cleanup')", [user, id]);
  await db.query("select writer_revoke_assisted_import_qa_budget($1,$2)", [user, id]);
});

test("an idempotent retry preserves the granted budget instead of increasing it", async () => {
  const user = "50505050-5050-4050-8050-505050505050";
  const id = "50505050-5050-4050-8050-505050505051";
  const hash = "5".repeat(64);
  const args = [user, id, hash, optionsHash, "pasted", "Retry QA", 1, 1, 1, "gpt-5.6-terra+gpt-5.6-sol", 541152];
  await as("postgres");
  await db.query("insert into auth.users(id) values($1)", [user]);
  await as("service_role");
  await db.query("select writer_grant_assisted_import_qa_budget($1,$2,$3,clock_timestamp()+interval '1 hour')", [user, id, hash]);
  await db.query("select writer_reserve_assisted_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", args);
  await db.query("select writer_fail_assisted_import($1,$2,'failed','synthetic')", [user, id]);
  const persistedAuthorization = ((await db.query(
    "select writer_assisted_import_authorized_budget($1,$2,$3) value", [user, id, hash],
  )).rows[0] as { value: RpcValue & { authorized_budget_microusd: number; authorization: string } }).value;
  assert.deepEqual(persistedAuthorization, { authorized_budget_microusd: 600_000, authorization: "persisted_operation" });
  const resumed = ((await db.query(
    "select writer_reserve_assisted_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) value", args,
  )).rows[0] as { value: RpcValue & { resumed: boolean; operation_budget_microusd: number } }).value;
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.operation_budget_microusd, 600_000);
  await as("postgres");
  assert.equal(((await db.query(
    "select status from private.writer_assisted_import_budget_grants where operation_id=$1", [id],
  )).rows[0] as { status: string }).status, "consumed");
  await as("service_role");
  await db.query("select writer_fail_assisted_import($1,$2,'failed','qa_cleanup')", [user, id]);
  await db.query("select writer_revoke_assisted_import_qa_budget($1,$2)", [user, id]);
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
