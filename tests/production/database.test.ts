import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const production = "33333333-3333-4333-8333-333333333333";
const day = "44444444-4444-4444-8444-444444444444";
const requirement = "55555555-5555-4555-8555-555555555555";
const resource = "66666666-6666-4666-8666-666666666666";

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to anon,authenticated,service_role;
    insert into auth.users values('${owner}'),('${other}');
  `);
  await db.exec(fs.readFileSync("supabase/migrations/20261003010000_production_assistant_foundation_v1.sql", "utf8"));
});

after(() => db.close());

async function as(role: "postgres" | "service_role" | "authenticated", uid = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}

test("manual production persists a day, overnight schedule, requirements, resources and tasks", async () => {
  await as("authenticated", owner);
  await db.query("insert into production_plans(id,owner_id,name,timezone,creation_operation_id) values($1,$2,'LA FRECUENCIA','America/Mexico_City',$3)", [production, owner, "77777777-7777-4777-8777-777777777777"]);
  await db.query("insert into production_days(id,owner_id,production_id,position,name,shoot_date,call_time,wrap_time,wrap_next_day) values($1,$2,$3,0,'Día 1','2026-10-03','22:00','02:00',true)", [day, owner, production]);
  await db.query("insert into production_schedule_items(owner_id,production_id,day_id,position,item_type,title,shoot_minutes,start_time,end_time,end_next_day) values($1,$2,$3,0,'manual','EXT. CASA — NOCHE',90,'23:00','00:30',true)", [owner, production, day]);
  await db.query("insert into production_requirements(id,owner_id,production_id,category,name,origin) values($1,$2,$3,'talent','Mara','manual')", [requirement, owner, production]);
  await db.query("insert into production_resources(id,owner_id,production_id,name,resource_type) values($1,$2,$3,'Elena Ruiz','person')", [resource, owner, production]);
  await db.query("insert into production_coverages(owner_id,production_id,requirement_id,day_id,resource_id,status,confirmed_for_date,arrival_time) values($1,$2,$3,$4,$5,'confirmed','2026-10-03','21:00')", [owner, production, requirement, day, resource]);
  await db.query("insert into production_tasks(owner_id,production_id,title,status,priority,day_id) values($1,$2,'Confirmar transporte','pending','high',$3)", [owner, production, day]);
  assert.deepEqual((await db.query("select call_time::text,wrap_time::text,wrap_next_day from production_days where id=$1", [day])).rows[0], { call_time: "22:00:00", wrap_time: "02:00:00", wrap_next_day: true });
  assert.equal(((await db.query("select count(*)::int count from production_tasks")).rows[0] as { count: number }).count, 1);
});

test("the same source shot cannot be scheduled twice in one production", async () => {
  await as("authenticated", owner);
  const shot = "88888888-8888-4888-8888-888888888888";
  await db.query("insert into production_schedule_items(owner_id,production_id,day_id,position,item_type,title,source_group_id,source_shot_id) values($1,$2,$3,1,'shot','Plano general',$4,$5)", [owner, production, day, "99999999-9999-4999-8999-999999999999", shot]);
  await assert.rejects(db.query("insert into production_schedule_items(owner_id,production_id,day_id,position,item_type,title,source_group_id,source_shot_id) values($1,$2,$3,2,'shot','Duplicado',$4,$5)", [owner, production, day, "99999999-9999-4999-8999-999999999999", shot]), /duplicate key/u);
});

test("changing the date makes confirmed coverage tentative and requires reconfirmation", async () => {
  await as("authenticated", owner);
  await db.query("update production_days set shoot_date='2026-10-04' where id=$1", [day]);
  assert.deepEqual((await db.query("select status,confirmed_for_date,needs_reconfirmation from production_coverages where requirement_id=$1", [requirement])).rows[0], {
    status: "tentative", confirmed_for_date: null, needs_reconfirmation: true,
  });
});

test("deleting a day returns schedule items to unscheduled and removes only day coverage", async () => {
  await as("authenticated", owner);
  await db.query("delete from production_days where id=$1", [day]);
  assert.equal(((await db.query("select count(*)::int count from production_schedule_items where day_id is null")).rows[0] as { count: number }).count, 2);
  assert.equal(((await db.query("select count(*)::int count from production_coverages")).rows[0] as { count: number }).count, 0);
  assert.equal(((await db.query("select count(*)::int count from production_requirements")).rows[0] as { count: number }).count, 1);
  assert.equal(((await db.query("select count(*)::int count from production_resources")).rows[0] as { count: number }).count, 1);
});

test("RLS rejects cross-account reads and forged ownership", async () => {
  await as("authenticated", other);
  assert.equal(((await db.query("select count(*)::int count from production_plans")).rows[0] as { count: number }).count, 0);
  await assert.rejects(db.query("insert into production_tasks(owner_id,production_id,title) values($1,$2,'Ataque')", [owner, production]), /row-level security/u);
});

test("same-production foreign keys reject cross-plan coverage", async () => {
  await as("authenticated", owner);
  const second = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const secondDay = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await db.query("insert into production_plans(id,owner_id,name,timezone,creation_operation_id) values($1,$2,'Otra','Europe/Madrid',$3)", [second, owner, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"]);
  await db.query("insert into production_days(id,owner_id,production_id,position,name) values($1,$2,$3,0,'Día 1')", [secondDay, owner, second]);
  await assert.rejects(db.query("insert into production_coverages(owner_id,production_id,requirement_id,day_id,status) values($1,$2,$3,$4,'unassigned')", [owner, production, requirement, secondDay]), /foreign key/u);
});
