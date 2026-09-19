import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("actual core RLS and Storage require admin + aal2; public reads survive", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true)) $$;
      grant usage on schema auth,storage to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to authenticated;
    `);
    await db.exec(fs.readFileSync("supabase/production/0001_core_learn_prerequisites.sql", "utf8"));
    await db.exec(fs.readFileSync("supabase/migrations/20260918010000_admin_mfa.sql", "utf8"));
    const user = "11111111-1111-4111-8111-111111111111";
    const admin = "22222222-2222-4222-8222-222222222222";
    await db.exec(`insert into auth.users values('${user}'),('${admin}'); update public.profiles set role='admin' where id='${admin}';`);
    for (const [id, aal, allowed] of [[user,"aal1",false],[user,"aal2",false],[admin,"aal1",false],[admin,"aal2",true]]) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false)",[id,aal]);
      await db.exec("set role authenticated");
      assert.equal((await db.query("select private.is_admin() ok")).rows[0].ok, allowed);
      const write = () => db.query("insert into storage.objects(bucket_id,name) values('course-covers','qa.jpg')");
      if (allowed) await write(); else await assert.rejects(write(), /row-level security/);
      const courseWrite = () => db.query("insert into courses(title,slug,status) values('QA course','qa-course','published')");
      if (allowed) await courseWrite(); else await assert.rejects(courseWrite(), /row-level security/);
    }
    await db.exec("reset role; set role anon");
    assert.equal((await db.query("select * from courses where status='published'")).rows.length,1);
  } finally { await db.close(); }
});
