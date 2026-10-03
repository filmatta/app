// Supabase Test-only QA for Production Assistant V1. Never prints credentials.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CLI, TEST_REF } from "./portfolio-test-context.mjs";

assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF, "Supabase Test opt-in required.");

const keys = JSON.parse(execFileSync(SUPABASE_CLI, [
  "projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json",
], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const publishableKey = keys.find((item) => item.name === "anon")?.api_key;
const serviceKey = keys.find((item) => item.name === "service_role")?.api_key;
assert.ok(publishableKey && serviceKey, "Supabase Test keys unavailable.");
assert.equal(JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url")).ref, TEST_REF, "Refusing a non-Test service key.");

const url = `https://${TEST_REF}.supabase.co`;
const client = (key) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const admin = client(serviceKey);
const users = [];
const checks = [];
const prefix = `production-qa-${randomUUID()}`;

try {
  for (const role of ["owner", "stranger"]) {
    const email = `${prefix}-${role}@example.invalid`;
    const password = `${randomBytes(24).toString("base64url")}aA1!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Production QA ${role}` } });
    assert.equal(created.error, null, "Test user creation failed.");
    const signedClient = client(publishableKey);
    const signed = await signedClient.auth.signInWithPassword({ email, password });
    assert.equal(signed.error, null, "Ordinary Test sign-in failed.");
    users.push({ id: created.data.user.id, email, client: signedClient });
  }

  const [owner, stranger] = users;
  const productionId = randomUUID();
  const dayId = randomUUID();
  const requirementId = randomUUID();
  const resourceId = randomUUID();
  const plan = await owner.client.from("production_plans").insert({
    id: productionId, owner_id: owner.id, name: "QA Production Assistant", timezone: "America/Mexico_City", creation_operation_id: randomUUID(),
  });
  assert.equal(plan.error, null, "Owner could not create a production.");
  const day = await owner.client.from("production_days").insert({
    id: dayId, owner_id: owner.id, production_id: productionId, position: 0, name: "Noche exterior", shoot_date: "2026-10-03", call_time: "22:00", wrap_time: "02:00", wrap_next_day: true,
  });
  assert.equal(day.error, null, "Owner could not create a day.");
  const blocks = await owner.client.from("production_schedule_items").insert([
    { owner_id: owner.id, production_id: productionId, day_id: dayId, position: 0, item_type: "manual", title: "EXT. CASA — NOCHE", shoot_minutes: 90, start_time: "23:00", end_time: "00:30", end_next_day: true },
    { owner_id: owner.id, production_id: productionId, day_id: dayId, position: 1, item_type: "logistics", logistics_type: "meal", title: "Comida", start_time: "00:30", end_time: "01:00", end_next_day: true },
  ]).select("id,position,revision").order("position");
  assert.equal(blocks.error, null, "Schedule persistence failed.");
  const requirement = await owner.client.from("production_requirements").insert({ id: requirementId, owner_id: owner.id, production_id: productionId, category: "talent", name: "Mara", origin: "manual" });
  const resource = await owner.client.from("production_resources").insert({ id: resourceId, owner_id: owner.id, production_id: productionId, resource_type: "person", name: "Elena Ruiz" });
  assert.equal(requirement.error, null);
  assert.equal(resource.error, null);
  const coverage = await owner.client.from("production_coverages").insert({ owner_id: owner.id, production_id: productionId, requirement_id: requirementId, day_id: dayId, resource_id: resourceId, status: "confirmed", confirmed_for_date: "2026-10-03", required_time: "21:30", arrival_time: "21:15" });
  const task = await owner.client.from("production_tasks").insert({ owner_id: owner.id, production_id: productionId, title: "Confirmar transporte", priority: "high", day_id: dayId });
  assert.equal(coverage.error, null);
  assert.equal(task.error, null);
  checks.push("owner CRUD and overnight times persist");

  const reordered = await owner.client.rpc("production_move_schedule_item", {
    p_production_id: productionId, p_item_id: blocks.data[1].id, p_expected_revision: blocks.data[1].revision, p_direction: -1,
  });
  assert.equal(reordered.error, null);
  assert.equal(reordered.data, true);
  const order = await owner.client.from("production_schedule_items").select("title,position").eq("production_id", productionId).order("position");
  assert.equal(order.data?.[0]?.title, "Comida");
  checks.push("atomic schedule reorder persists");

  const strangerRead = await stranger.client.from("production_plans").select("id").eq("id", productionId);
  assert.equal(strangerRead.error, null);
  assert.equal(strangerRead.data.length, 0);
  const forged = await stranger.client.from("production_tasks").insert({ owner_id: owner.id, production_id: productionId, title: "Forged" });
  assert.ok(forged.error, "Cross-account write unexpectedly succeeded.");
  checks.push("A/B RLS blocks reads and writes");

  const dateChange = await owner.client.from("production_days").update({ shoot_date: "2026-10-04" }).eq("id", dayId);
  assert.equal(dateChange.error, null);
  const reconfirmation = await owner.client.from("production_coverages").select("status,confirmed_for_date,needs_reconfirmation").eq("day_id", dayId).single();
  assert.deepEqual(reconfirmation.data, { status: "tentative", confirmed_for_date: null, needs_reconfirmation: true });
  checks.push("date changes invalidate prior confirmation");

  const deleteDay = await owner.client.from("production_days").delete().eq("id", dayId);
  assert.equal(deleteDay.error, null);
  const unscheduled = await owner.client.from("production_schedule_items").select("id").eq("production_id", productionId).is("day_id", null);
  const removedCoverage = await owner.client.from("production_coverages").select("id").eq("production_id", productionId);
  assert.equal(unscheduled.data.length, 2);
  assert.equal(removedCoverage.data.length, 0);
  checks.push("day deletion preserves sources and unschedules blocks");

  const contract = JSON.parse(execFileSync(SUPABASE_CLI, [
    "db", "query", "--linked", "--project-ref", TEST_REF,
    "select count(*)::int as tables from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'production_%' and c.relkind='r' and c.relrowsecurity;",
    "--output", "json",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).rows[0];
  assert.equal(contract.tables, 8);
  checks.push("all eight production tables have RLS enabled");

  const outputDirectory = path.join("output", "production-assistant");
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "remote-qa.json"), `${JSON.stringify({ project: TEST_REF, checks, passed: checks.length }, null, 2)}\n`);
  console.log(JSON.stringify({ project: TEST_REF, passed: checks.length, fixtureUsersRemoved: true }));
} finally {
  await Promise.all(users.map(async (user) => {
    assert.ok(user.email.startsWith(`${prefix}-`));
    const removed = await admin.auth.admin.deleteUser(user.id);
    assert.equal(removed.error, null, "Test user cleanup failed.");
  }));
}
