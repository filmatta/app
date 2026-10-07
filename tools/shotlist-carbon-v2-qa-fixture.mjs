// Test-only Shotlist Carbon V2 fixture. Existing QA credentials stay in the OS temp directory.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CLI, TEST_REF } from "./portfolio-test-context.mjs";

assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF, "Supabase Test opt-in required.");
const originalPath = path.join(os.tmpdir(), "filmatta-storyboard-foundation-fixture.json");
const outputPath = path.join(os.tmpdir(), "filmatta-shotlist-carbon-v2-fixture.json");
assert.ok(fs.existsSync(originalPath), "Preserved QA account is unavailable.");
const original = JSON.parse(fs.readFileSync(originalPath, "utf8"));
assert.equal(original.projectRef, TEST_REF);
assert.match(original.email, /^storyboard-preview-[0-9a-f-]+@example\.invalid$/u);
if (fs.existsSync(outputPath)) {
  const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(existing.projectRef, TEST_REF);
  assert.equal(existing.userId, original.userId);
  console.log(JSON.stringify({ reused: true, linkedPath: `/shotlists/${existing.linkedId}`, freePath: `/shotlists/${existing.freeId}` }));
  process.exit(0);
}

const keys = JSON.parse(execFileSync(SUPABASE_CLI, ["projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const anonKey = keys.find((item) => item.name === "anon")?.api_key;
const serviceKey = keys.find((item) => item.name === "service_role")?.api_key;
assert.ok(anonKey && serviceKey, "Test keys unavailable.");
assert.equal(JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url")).ref, TEST_REF);
const url = `https://${TEST_REF}.supabase.co`;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const normal = createClient(url, anonKey, options);
const admin = createClient(url, serviceKey, options);
const signed = await normal.auth.signInWithPassword({ email: original.email, password: original.password });
assert.equal(signed.error, null, "Ordinary QA login failed.");
assert.equal(signed.data.user.id, original.userId);

const sceneIds = Array.from({ length: 3 }, () => randomUUID());
const headings = ["INT. TALLER - NOCHE", "EXT. PUENTE - AMANECER", "INT. ARCHIVO - DÍA"];
const document = { type: "doc", content: sceneIds.flatMap((sceneId, index) => [
  { type: "screenplayBlock", attrs: { id: sceneId, kind: "sceneHeading" }, content: [{ type: "text", text: headings[index] }] },
  { type: "screenplayBlock", attrs: { id: randomUUID(), kind: "action" }, content: [{ type: "text", text: `La acción sintética ${index + 1} continúa.` }] },
]) };
const script = await normal.rpc("writer_create_script", { p_operation_id: randomUUID(), p_title: "Carbon V2 · Guion QA", p_schema_version: 1, p_document: document });
assert.equal(script.error, null, "Writer QA script creation failed.");
const scriptId = script.data[0].id;
const linked = await normal.rpc("writer_create_shotlist", { p_script_id: scriptId, p_title: "Carbon V2 · Vínculos QA", p_operation_id: randomUUID() });
assert.equal(linked.error, null, "Linked QA shotlist creation failed.");
const linkedId = linked.data;
const groups = await admin.from("writer_shotlist_groups").select("id,source_scene_id,position").eq("shotlist_id", linkedId).eq("owner_id", original.userId).order("position");
assert.equal(groups.error, null);
assert.equal(groups.data.length, 3);
const shots = groups.data.flatMap((group, groupIndex) => Array.from({ length: 6 }, (_, position) => ({
  id: randomUUID(), owner_id: original.userId, shotlist_id: linkedId, group_id: group.id,
  origin: "manual", shot_type: ["Plano general", "Plano medio", "Primer plano"][position % 3],
  subject: `Cobertura sintética ${groupIndex + 1}.${position + 1}`, angle: position % 2 ? "A nivel" : "Picado",
  movement: "Fijo", lens: ["35 mm", "43 mm", "50 mm", "150 mm", null, "50mm"][position],
  description: "Plano QA para validar referencias sin datos reales.", status: position % 2 ? "ready" : "pending",
  position, revision: 1, creation_operation_id: randomUUID(),
})));
const shotInsert = await admin.from("writer_shotlist_shots").insert(shots);
assert.equal(shotInsert.error, null, "Linked fixture shots failed.");

const free = await normal.rpc("writer_create_shotlist", { p_script_id: null, p_title: "Carbon V2 · Escenas vacía y única", p_operation_id: randomUUID() });
assert.equal(free.error, null, "Free QA shotlist creation failed.");
const freeId = free.data;
const oneGroup = await normal.rpc("writer_add_shotlist_group", { p_shotlist_id: freeId, p_title: "Escena con un plano", p_operation_id: randomUUID() });
assert.equal(oneGroup.error, null);
const oneShot = await normal.rpc("writer_add_shot", { p_shotlist_id: freeId, p_group_id: oneGroup.data, p_origin: "manual", p_operation_id: randomUUID() });
assert.equal(oneShot.error, null);

fs.writeFileSync(outputPath, JSON.stringify({ projectRef: TEST_REF, userId: original.userId, scriptId, linkedId, freeId, sceneIds, groups: groups.data.map((group) => group.id), shotIds: shots.map((shot) => shot.id), oneShotId: oneShot.data }));
console.log(JSON.stringify({ created: true, linkedPath: `/shotlists/${linkedId}`, freePath: `/shotlists/${freeId}`, linkedShots: shots.length, linkedScenes: groups.data.length }));
