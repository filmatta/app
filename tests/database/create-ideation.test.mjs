import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const projectA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const writerA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("Ideation migration is additive and keeps guides and possibilities private", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key);
      insert into auth.users(id) values ('${ownerA}'),('${ownerB}');
      create table public.projects(id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade);
      create table public.writer_scripts(id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade, project_id uuid references public.projects(id) on delete cascade);
      alter table public.projects enable row level security;
      alter table public.writer_scripts enable row level security;
      grant select on public.projects, public.writer_scripts to authenticated;
      create policy project_owner on public.projects for select to authenticated using (owner_id = auth.uid());
      create policy writer_owner on public.writer_scripts for select to authenticated using (owner_id = auth.uid());
      insert into public.projects(id,owner_id) values ('${projectA}','${ownerA}'),('${projectB}','${ownerA}');
      insert into public.writer_scripts(id,owner_id,project_id) values ('${writerA}','${ownerA}','${projectA}');
      create table public.create_idea_drafts(
        id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
        idea text not null default '', answers jsonb not null default '{}'::jsonb, current_question_id text,
        current_step text not null default 'capture', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        constraint create_idea_drafts_step_check check (current_step in ('capture','detail','ready'))
      );
      create unique index create_idea_drafts_one_active_per_owner on public.create_idea_drafts(owner_id);
      alter table public.create_idea_drafts enable row level security;
      grant select, insert, update on public.create_idea_drafts to authenticated;
      create policy create_idea_drafts_owner_select on public.create_idea_drafts for select to authenticated using (owner_id = auth.uid());
      create policy create_idea_drafts_owner_insert on public.create_idea_drafts for insert to authenticated with check (owner_id = auth.uid());
      create policy create_idea_drafts_owner_update on public.create_idea_drafts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
    `);
    await db.exec(fs.readFileSync("supabase/migrations/20261010010000_create_ideation_mvp_v1.sql", "utf8"));
    const as = async (role, uid = "") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
      if (role !== "postgres") await db.exec(`set role ${role}`);
    };
    await as("authenticated", ownerA);
    const ideaA = "33333333-3333-4333-8333-333333333333";
    const ideaB = "44444444-4444-4444-8444-444444444444";
    assert.equal((await db.query("select public.create_start_idea_draft_v1($1) as id", [ideaA])).rows[0].id, ideaA);
    await db.query("update create_idea_drafts set idea='Idea A' where id=$1", [ideaA]);
    assert.equal((await db.query("select public.create_start_idea_draft_v1($1) as id", [ideaB])).rows[0].id, ideaB);
    assert.equal((await db.query("select public.create_start_idea_draft_v1($1) as id", [ideaB])).rows[0].id, ideaB);
    let rows = (await db.query("select id,idea,status from create_idea_drafts where owner_id=$1 order by id", [ownerA])).rows;
    assert.deepEqual(rows, [{ id: ideaA, idea: "Idea A", status: "archived" }, { id: ideaB, idea: "", status: "active" }]);
    await db.query("update create_idea_drafts set idea='Idea B', current_step='review', project_id=$2, writer_id=$3 where id=$1", [ideaB, projectA, writerA]);
    assert.deepEqual((await db.query("select idea,status from create_idea_drafts where id=$1 and owner_id=$2", [ideaB, ownerA])).rows[0], { idea: "Idea B", status: "active" });
    await db.query("insert into create_ideation_guides(owner_id,project_id,writer_id,source_draft_id,context,synthesis) values($1,$2,$3,$4,'{}','{}')", [ownerA, projectA, writerA, ideaB]);
    await db.query("insert into create_ideation_possibilities(owner_id,project_id,content) values($1,$2,'Una posibilidad')", [ownerA, projectA]);
    await db.query("update create_idea_drafts set status='converted' where id=$1", [ideaB]);
    await assert.rejects(db.query("select public.create_start_idea_draft_v1($1) as id", [ideaB]));
    assert.equal((await db.query("select count(*)::int as n from create_idea_drafts where owner_id=$1", [ownerA])).rows[0].n, 2);
    rows = (await db.query("select id,idea,status from create_idea_drafts where owner_id=$1 order by id", [ownerA])).rows;
    assert.deepEqual(rows, [{ id: ideaA, idea: "Idea A", status: "archived" }, { id: ideaB, idea: "Idea B", status: "converted" }]);
    await assert.rejects(db.query("update create_idea_drafts set status='active' where id=$1", [ideaB]));
    await assert.rejects(db.query("update create_idea_drafts set project_id=$2 where id=$1", [ideaB, projectB]));
    assert.equal((await db.query("select public.create_activate_idea_draft_v1($1) as id", [ideaA])).rows[0].id, ideaA);
    assert.equal((await db.query("select idea,status from create_idea_drafts where id=$1", [ideaA])).rows[0].status, "active");
    await assert.rejects(db.query("select public.create_activate_idea_draft_v1($1)", [ideaB]));
    await as("authenticated", ownerB);
    assert.equal((await db.query("select * from create_idea_drafts")).rows.length, 0);
    assert.equal((await db.query("select * from create_ideation_guides")).rows.length, 0);
    assert.equal((await db.query("select * from create_ideation_possibilities")).rows.length, 0);
    await assert.rejects(db.query("insert into create_ideation_possibilities(owner_id,project_id,content) values($1,$2,'Intrusión')", [ownerB, projectA]));
    await assert.rejects(db.query("insert into create_idea_drafts(owner_id,idea,project_id) values($1,'Intrusión',$2)", [ownerB, projectA]));
    await assert.rejects(db.query("select public.create_activate_idea_draft_v1($1)", [ideaA]));
    await as("postgres");
    await db.query("delete from auth.users where id=$1", [ownerA]);
    assert.equal((await db.query("select count(*)::int as n from create_ideation_guides")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from create_ideation_possibilities")).rows[0].n, 0);
  } finally { await db.close(); }
});
