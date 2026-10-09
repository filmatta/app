import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";

async function as(role, uid = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema private;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    create table public.projects (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references auth.users(id),
      constraint projects_id_owner_unique unique (id, owner_id)
    );
    create table public.writer_scripts (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null,
      project_id uuid,
      constraint writer_scripts_id_owner_project_unique unique (id, owner_id, project_id)
    );
    insert into auth.users(id) values
      ('11111111-1111-4111-8111-111111111111'),
      ('22222222-2222-4222-8222-222222222222');
  `);
  await db.exec(fs.readFileSync(
    "supabase/migrations/20261009090000_create_sandbox_foundation.sql",
    "utf8",
  ));
});

after(async () => db.close());

test("sessions and their creative data remain private across owners", async () => {
  await as("authenticated", owner);
  const first = (await db.query(
    "insert into create_sessions(owner_id,title) values ($1,'ARCA') returning id",
    [owner],
  )).rows[0].id;
  const second = (await db.query(
    "insert into create_sessions(owner_id,title) values ($1,'Otra idea') returning id",
    [owner],
  )).rows[0].id;
  const message = (await db.query(
    "insert into create_messages(session_id,owner_id,role,content) values ($1,$2,'user','Una premisa') returning id",
    [first, owner],
  )).rows[0].id;
  await db.query(
    "insert into create_items(session_id,owner_id,type,content,state,source_message_id) values ($1,$2,'premise','Una premisa','canon',$3)",
    [first, owner, message],
  );
  await db.query(
    "insert into create_signals(session_id,owner_id,message_id,signal_type,value) values ($1,$2,$3,'reaction',$4)",
    [first, owner, message, { emoji: "💡", active: true }],
  );
  assert.equal((await db.query("select id from create_sessions")).rows.length, 2);
  assert.equal((await db.query("select id from create_messages where session_id=$1", [second])).rows.length, 0);

  await as("authenticated", stranger);
  for (const table of ["create_sessions", "create_messages", "create_items", "create_signals"]) {
    assert.equal((await db.query(`select id from ${table}`)).rows.length, 0);
  }
  assert.equal((await db.query(
    "update create_sessions set title='Robada' where id=$1 returning id", [first],
  )).rows.length, 0);
  await assert.rejects(db.query(
    "insert into create_messages(session_id,owner_id,role,content) values ($1,$2,'user','Intrusión')",
    [first, stranger],
  ), /foreign key|violates row-level security/i);

  await as("anon");
  await assert.rejects(db.query("select id from create_sessions"), /permission denied/i);
});

test("reply, source and signal references cannot cross sessions", async () => {
  await as("authenticated", owner);
  const typed = await db.query(
    "update create_items set suggested_type='world' where owner_id=$1 returning suggested_type",
    [owner],
  );
  assert.equal(typed.rows[0].suggested_type, "world");
  await assert.rejects(db.query(
    "update create_items set suggested_type='unsupported' where owner_id=$1",
    [owner],
  ), /check constraint/i);
  const sessions = (await db.query("select id from create_sessions order by title")).rows;
  const firstMessage = (await db.query(
    "select session_id,id from create_messages limit 1",
  )).rows[0];
  const other = sessions.find((row) => row.id !== firstMessage.session_id).id;
  assert.equal(sessions.length, 2);
  await assert.rejects(db.query(
    "insert into create_messages(session_id,owner_id,role,content,parent_message_id) values ($1,$2,'user','Respuesta',$3)",
    [other, owner, firstMessage.id],
  ), /foreign key/i);
  await assert.rejects(db.query(
    "insert into create_items(session_id,owner_id,type,content,source_message_id) values ($1,$2,'world','Regla',$3)",
    [other, owner, firstMessage.id],
  ), /foreign key/i);
  await assert.rejects(db.query(
    "insert into create_signals(session_id,owner_id,message_id,signal_type) values ($1,$2,$3,'reply')",
    [other, owner, firstMessage.id],
  ), /foreign key/i);
});

test("signals are append-only and conversion links the owner's Writer project", async () => {
  await as("authenticated", owner);
  await assert.rejects(db.query("update create_signals set signal_type='changed'"), /permission denied/i);
  await assert.rejects(db.query("delete from create_signals"), /permission denied/i);
  await as("postgres");
  const project = (await db.query(
    "insert into projects(owner_id) values ($1) returning id", [owner],
  )).rows[0].id;
  const writer = (await db.query(
    "insert into writer_scripts(owner_id,project_id) values ($1,$2) returning id",
    [owner, project],
  )).rows[0].id;
  await as("authenticated", owner);
  const session = (await db.query("select id from create_sessions limit 1")).rows[0].id;
  await db.query(
    "update create_sessions set project_id=$1,converted_writer_id=$2 where id=$3",
    [project, writer, session],
  );
  assert.deepEqual((await db.query(
    "select project_id,converted_writer_id from create_sessions where id=$1", [session],
  )).rows[0], { project_id: project, converted_writer_id: writer });
});
