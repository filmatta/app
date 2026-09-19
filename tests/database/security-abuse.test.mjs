import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("Auth counters and actual catalog triggers enforce quotas across direct writes and RPCs", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const as = async (role, uid = owner) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    if (role !== "postgres") await db.exec(`set role ${role}`);
  };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal1"}'::jsonb $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant usage on schema private to authenticated,service_role;
      create table public.profiles(id uuid primary key,role text);
    `);
    const core = fs.readFileSync("supabase/production/0001_core_learn_prerequisites.sql","utf8");
    await db.exec(core.match(/create function private\.is_admin\(\)[\s\S]*?\$\$;/)[0]);
    for (const file of [
      "20260910120000_create_professional_profiles.sql",
      "20260910230000_create_locations_opportunities_foundations.sql",
      "20260916010000_public_profile_catalog.sql",
      "20260916020000_opportunity_owner_publishing.sql",
      "20260916030000_services_directory.sql",
      "20260916040000_jobs_specialization.sql",
      "20260918010000_admin_mfa.sql",
      "20260918020000_abuse_controls.sql",
    ]) await db.exec(fs.readFileSync(`supabase/migrations/${file}`,"utf8"));
    await db.exec(`insert into auth.users(id) values('${owner}'),('${other}');
      update private.publication_limits set creations_per_day=3,publications_per_day=2;`);
    await as("authenticated");
    await assert.rejects(db.query("select consume_auth_rate_limit('forged',3,60)"), /permission denied/);
    await assert.rejects(db.query("select * from private.auth_rate_buckets"), /permission denied/);
    await assert.rejects(db.query("update private.publication_limits set creations_per_day=1000"), /permission denied/);
    await as("service_role");
    for (let i=0;i<4;i++) assert.equal((await db.query("select consume_auth_rate_limit('login:A',3,60) ok")).rows[0].ok,i<3);
    assert.equal((await db.query("select consume_auth_rate_limit('login:B',3,60) ok")).rows[0].ok,true);
    await as("postgres");
    await db.exec("update private.auth_rate_buckets set starts_at=now()-interval '2 minutes'");
    await as("service_role");
    assert.equal((await db.query("select consume_auth_rate_limit('login:A',3,60) ok")).rows[0].ok,true);

    // Service RPC uses INSERT ON CONFLICT even for edits. Repeated saves must not charge twice.
    await as("authenticated");
    const payload={title:"QA service",category:"other",description:"A complete service description for quota verification.",work_mode:"remote"};
    const service=(await db.query("select save_my_service(null,$1,'published') id",[JSON.stringify(payload)])).rows[0].id;
    for(let i=0;i<5;i++) await db.query("select save_my_service($1,$2,'published')",[service,JSON.stringify(payload)]);
    await db.query("select save_my_service(null,$1,'published')",[JSON.stringify(payload)]);
    await assert.rejects(db.query("select save_my_service(null,$1,'published')",[JSON.stringify(payload)]), /PUBLICATION_LIMIT_REACHED/);
    await assert.rejects(db.query("insert into service_listings(title,slug,category,description,work_mode,status) values('Direct listing','direct-bypass','other',$1,'remote','published')",[payload.description]), /PUBLICATION_LIMIT_REACHED/);
    await as("authenticated",other);
    await db.query("select save_my_service(null,$1,'published')",[JSON.stringify(payload)]);

    await as("authenticated");
    for(let i=0;i<3;i++) await db.query("insert into locations(owner_id,title,slug,city,space_type,created_at) values($1,'QA location',$2,'México','Estudio','2000-01-01')",[owner,`quota-${i}`]);
    await db.query("delete from locations where slug='quota-0'");
    await assert.rejects(db.query("insert into locations(owner_id,title,slug,city,space_type) values($1,'QA location','quota-four','México','Estudio')",[owner]), /PUBLICATION_LIMIT_REACHED/);
    await as("authenticated",other);
    await db.query("insert into locations(owner_id,title,slug,city,space_type) values($1,'Other location','quota-other','México','Estudio')",[other]);

    // Jobs share Opportunities and their limits; project creation is bounded too.
    await as("authenticated");
    const opportunity={title:"Quota casting",category:"casting",description:"A complete description for this casting opportunity.",work_mode:"remote",compensation_type:"unpaid"};
    for(let i=0;i<2;i++) await db.query("select save_my_opportunity(null,$1,'QA project','published')",[JSON.stringify(opportunity)]);
    await assert.rejects(db.query("select save_my_opportunity(null,$1,'QA project','published')",[JSON.stringify(opportunity)]), /PUBLICATION_LIMIT_REACHED/);
    await as("postgres");
    assert.equal((await db.query("select count(*)::int n from private.publication_events where owner_id=$1 and resource='service_listings' and operation='publish'",[owner])).rows[0].n,2);
  } finally { await db.close(); }
});
