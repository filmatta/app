import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const projectA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const projectC = "99999999-9999-4999-8999-999999999999";
const turnA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const turnB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const writerA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

test("Sandbox migration, quota, retry, decisions, handoff and owner isolation", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key);
      insert into auth.users(id) values ('${ownerA}'),('${ownerB}');
      create table public.projects(id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
        unique(id,owner_id));
      create table public.writer_scripts(id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
        project_id uuid references public.projects(id) on delete cascade);
      insert into public.projects values ('${projectA}','${ownerA}'),('${projectB}','${ownerB}'),('${projectC}','${ownerA}');
      insert into public.writer_scripts values ('${writerA}','${ownerA}','${projectA}');
      alter table public.projects enable row level security;
      alter table public.writer_scripts enable row level security;
      grant select on public.projects, public.writer_scripts to authenticated;
      create policy projects_owner_read on public.projects for select to authenticated using (owner_id=auth.uid());
      create policy writer_owner_read on public.writer_scripts for select to authenticated using (owner_id=auth.uid());
      create table public.create_idea_drafts(id uuid primary key default gen_random_uuid(),
        owner_id uuid not null references auth.users(id) on delete cascade,
        idea text not null default '', answers jsonb not null default '{}'::jsonb,
        current_question_id text, current_step text not null default 'capture',
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        constraint create_idea_drafts_step_check check (current_step in ('capture','detail','ready')));
      create unique index create_idea_drafts_one_active_per_owner on public.create_idea_drafts(owner_id);
      alter table public.create_idea_drafts enable row level security;
      grant select, insert, update, delete on public.create_idea_drafts to authenticated;
      create policy create_idea_drafts_owner_select on public.create_idea_drafts for select to authenticated using (owner_id=auth.uid());
      create policy create_idea_drafts_owner_insert on public.create_idea_drafts for insert to authenticated with check (owner_id=auth.uid());
      create policy create_idea_drafts_owner_update on public.create_idea_drafts for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
      create policy create_idea_drafts_owner_delete on public.create_idea_drafts for delete to authenticated using (owner_id=auth.uid());
    `);
    await db.exec(fs.readFileSync("supabase/migrations/20261010010000_create_ideation_mvp_v1.sql", "utf8"));
    await db.exec(fs.readFileSync("supabase/migrations/20261011010000_sandbox_mvp_v1.sql", "utf8"));
    const as = async (uid) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
      await db.exec("set role authenticated");
    };
    const reserve = async (project, session, turn, content, mode = "divergence") =>
      (await db.query("select public.sandbox_reserve_turn_v1($1,$2,$3,$4,$5) as result",
        [project, session, turn, content, mode])).rows[0].result;
    const quota = async () => (await db.query("select public.sandbox_quota_v1() as result")).rows[0].result;

    await as(ownerA);
    const first = await reserve(projectA, null, turnA, "Una historia de memoria prestada");
    assert.equal(first.status, "reserved");
    assert.equal(first.limit, 3);
    assert.equal((await reserve(projectA, first.sessionId, turnA, "Una historia de memoria prestada")).status, "pending");
    await assert.rejects(reserve(projectA, first.sessionId, turnA, "Otra historia"));
    assert.equal((await quota()).used, 0);
    assert.equal((await db.query("select public.sandbox_fail_turn_v1($1,$2) as result", [turnA,"provider"])).rows[0].result, true);
    assert.equal((await reserve(projectA, first.sessionId, turnA, "Una historia de memoria prestada")).status, "reserved");
    const reply = { assistant_message: "Podemos abrir tres caminos.",
      possibilities: [{ title: "La memoria es ajena", content: "Cada día recuerda a otra persona.", conflicts_with_canon_id: null }],
      questions: ["¿Quién conserva la identidad?"], contradictions: [], signals: [], session_summary: "La memoria sigue abierta." };
    const usage = { model: "gpt-5.6-terra", inputTokens: 100, cachedInputTokens: 0,
      outputTokens: 50, reasoningTokens: 0, latencyMs: 1000 };
    assert.equal((await db.query("select public.sandbox_complete_turn_v1($1,$2,$3) as result", [turnA,reply,usage])).rows[0].result, true);
    assert.equal((await quota()).used, 1);
    const usageRow = (await db.query("select retry_count,input_tokens,output_tokens,quota_consumed from sandbox_turns where id=$1", [turnA])).rows[0];
    assert.equal(usageRow.retry_count, 1);
    assert.equal(usageRow.input_tokens, 100);
    assert.equal(usageRow.output_tokens, 50);
    assert.equal(usageRow.quota_consumed, true);
    assert.equal((await reserve(projectA, first.sessionId, turnA, "Una historia de memoria prestada")).status, "completed");
    const possibility = (await db.query("select id from create_ideation_possibilities where source_turn_id=$1", [turnA])).rows[0].id;
    assert.equal((await db.query("select public.sandbox_set_possibility_state_v1($1,$2,$3,$4) as result",
      [projectA,possibility,"maybe",null])).rows[0].result.state, "maybe");
    assert.equal((await db.query("select public.sandbox_set_possibility_state_v1($1,$2,$3,$4) as result",
      [projectA,possibility,"canon",null])).rows[0].result.state, "canon");
    await assert.rejects(db.query("update create_ideation_possibilities set state='discarded' where id=$1", [possibility]));
    const second = await reserve(projectA, first.sessionId, turnB, "Lo contrario también podría ocurrir");
    assert.equal(second.status, "reserved");
    const conflicting = { ...reply, possibilities: [{ title: "No hay memoria ajena", content: "Nunca recuerda a otra persona.",
      conflicts_with_canon_id: possibility }] };
    await db.query("select public.sandbox_complete_turn_v1($1,$2,$3)", [turnB,conflicting,usage]);
    const competing = (await db.query("select id from create_ideation_possibilities where source_turn_id=$1", [turnB])).rows[0].id;
    assert.equal((await db.query("select public.sandbox_set_possibility_state_v1($1,$2,$3,$4) as result",
      [projectA,competing,"canon",null])).rows[0].result.status, "conflict");
    assert.equal((await db.query("select public.sandbox_set_possibility_state_v1($1,$2,$3,$4) as result",
      [projectA,competing,"canon","replace"])).rows[0].result.state, "canon");
    assert.equal((await db.query("select state from create_ideation_possibilities where id=$1", [possibility])).rows[0].state, "maybe");
    const third = await reserve(projectA, first.sessionId, "ffffffff-ffff-4fff-8fff-ffffffffffff", "Una última exploración");
    assert.equal(third.status, "reserved");
    await db.query("select public.sandbox_complete_turn_v1($1,$2,$3)", ["ffffffff-ffff-4fff-8fff-ffffffffffff", { ...reply, possibilities: [] }, usage]);
    assert.equal((await quota()).used, 3);
    assert.equal((await reserve(projectA, first.sessionId, "99999999-9999-4999-8999-999999999999", "Cuarta respuesta")).status, "limit");
    assert.equal((await reserve(projectC, null, "77777777-7777-4777-8777-777777777777", "Otro Project")).status, "limit");
    const operation = "88888888-8888-4888-8888-888888888888";
    const handoff = async () => (await db.query(
      "select public.sandbox_apply_handoff_v1($1,$2,$3,$4,$5,$6,$7) as id",
      [projectA,operation,writerA,[competing],null,{ sandboxHandoff: { selectedIds: [competing] } }, { sections: {}, cues: [] }]
    )).rows[0].id;
    const guideId = await handoff();
    assert.equal(await handoff(), guideId);
    assert.equal((await db.query("select count(*)::int as count from sandbox_guide_versions where operation_id=$1", [operation])).rows[0].count, 1);
    await assert.rejects(db.query("select public.sandbox_apply_handoff_v1($1,$2,$3,$4,$5,$6,$7)",
      [projectA,"66666666-6666-4666-8666-666666666666",writerA,[competing],null,{},{}]));
    await db.exec("reset role");
    await db.query("insert into sandbox_entitlements(owner_id,sandbox_plan,paid_monthly_limit) values($1,'unlocked',5)", [ownerA]);
    await as(ownerA);
    assert.equal((await quota()).plan, "unlocked");
    assert.equal((await quota()).limit, 5);
    await db.exec("reset role");
    await db.query("update sandbox_entitlements set sandbox_plan='free',usage_reset_at=now() where owner_id=$1", [ownerA]);
    await as(ownerA);
    assert.equal((await quota()).used, 0);
    assert.equal((await quota()).limit, 3);
    await as(ownerB);
    assert.equal((await db.query("select * from sandbox_sessions")).rows.length, 0);
    assert.equal((await db.query("select * from sandbox_messages")).rows.length, 0);
    await assert.rejects(reserve(projectA, null, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "Intrusión"));
    await assert.rejects(db.query("select public.sandbox_set_possibility_state_v1($1,$2,$3,$4)",
      [projectA,competing,"discarded",null]));
    await assert.rejects(db.query("select public.sandbox_apply_handoff_v1($1,$2,$3,$4,$5,$6,$7)",
      [projectA,"77777777-7777-4777-8777-777777777777",writerA,[competing],null,{},{}]));
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [ownerA]);
    for (const table of ["sandbox_sessions","sandbox_turns","sandbox_messages","sandbox_decision_events",
      "sandbox_guide_versions","sandbox_entitlements","create_ideation_possibilities"]) {
      assert.equal((await db.query(`select count(*)::int as count from ${table} where owner_id=$1`, [ownerA])).rows[0].count, 0);
    }
  } finally { await db.close(); }
});
