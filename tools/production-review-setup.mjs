// Persistent, idempotent human-review fixtures for Production Assistant V1.
// The ordinary account credentials live only in the OS temporary directory.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CLI, TEST_REF } from "./portfolio-test-context.mjs";

assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF, "Supabase Test opt-in required.");
const manifestPath = path.join(os.tmpdir(), "filmatta-production-review-v1.json");
const email = "production-review-v1@example.invalid";
const keys = JSON.parse(execFileSync(SUPABASE_CLI, ["projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const publishableKey = keys.find((item) => item.name === "anon")?.api_key;
const serviceKey = keys.find((item) => item.name === "service_role")?.api_key;
assert.ok(publishableKey && serviceKey, "Supabase Test keys unavailable.");
assert.equal(JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url")).ref, TEST_REF, "Refusing a non-Test service key.");
const url = `https://${TEST_REF}.supabase.co`;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceKey, options);

function stableUuid(label) {
  const bytes = Buffer.from(createHash("sha256").update(`filmatta:production-review-v1:${label}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const id = (label) => stableUuid(label);
async function insertMissing(table, rows) {
  if (!rows.length) return;
  const existing = await admin.from(table).select("id").in("id", rows.map((row) => row.id));
  assert.equal(existing.error, null, `${table}: existing-row lookup failed.`);
  const present = new Set((existing.data ?? []).map((row) => row.id));
  const missing = rows.filter((row) => !present.has(row.id));
  if (!missing.length) return;
  const result = await admin.from(table).insert(missing);
  assert.equal(result.error, null, `${table}: ${result.error?.message ?? "insert failed"}`);
}

let manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
assert.ok(!manifest.projectRef || manifest.projectRef === TEST_REF, "Review manifest belongs to another project.");
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
assert.equal(listed.error, null, "Could not list Test users.");
let user = listed.data.users.find((candidate) => candidate.email === email);
let password = manifest.password;
if (!password) password = `${randomBytes(24).toString("base64url")}aA1!`;
if (!user) {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Production Review V1" } });
  assert.equal(created.error, null, "Review user creation failed.");
  user = created.data.user;
} else if (!manifest.password || manifest.userId !== user.id) {
  const updated = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true, user_metadata: { full_name: "Production Review V1" } });
  assert.equal(updated.error, null, "Review password reset failed.");
}
const userId = user.id;
const normal = createClient(url, publishableKey, options);
const signed = await normal.auth.signInWithPassword({ email, password });
assert.equal(signed.error, null, "Ordinary Test sign-in failed.");

const sceneIds = [id("scene-1"), id("scene-2"), id("scene-3")];
const blockIds = [id("block-1"), id("block-2"), id("block-3")];
const headings = ["EXT. CASA PRINCIPAL - NOCHE", "INT. SALA - NOCHE", "EXT. JARDÍN - AMANECER"];
const actions = ["Mara llega y se detiene frente a la puerta.", "Mara encuentra a Diego junto a la mesa.", "El equipo prepara el último plano antes del amanecer."];
const document = { type: "doc", content: sceneIds.flatMap((sceneId, index) => [
  { type: "screenplayBlock", attrs: { id: sceneId, kind: "sceneHeading" }, content: [{ type: "text", text: headings[index] }] },
  { type: "screenplayBlock", attrs: { id: blockIds[index], kind: "action" }, content: [{ type: "text", text: actions[index] }] },
]) };
const scriptOperationId = id("script-operation");
const shotlistId = id("shotlist");
const scriptResult = await normal.rpc("writer_create_script", { p_operation_id: scriptOperationId, p_title: "QA REVIEW · LA FRECUENCIA · Guion sintético", p_document: document, p_schema_version: 1 });
assert.equal(scriptResult.error, null, `Review script creation failed: ${scriptResult.error?.message ?? "unknown"}`);
const scriptId = scriptResult.data?.[0]?.id;
assert.ok(scriptId, "Review script ID unavailable.");
await insertMissing("writer_shotlists", [{ id: shotlistId, owner_id: userId, script_id: scriptId, title: "QA REVIEW · LA FRECUENCIA · Shotlist sintética", source_revision: 1, creation_operation_id: id("shotlist-operation") }]);
const groups = sceneIds.map((sceneId, position) => ({ id: id(`group-${position}`), owner_id: userId, shotlist_id: shotlistId, source_scene_id: sceneId, source_scene_title: headings[position], title: headings[position], position, source_status: "linked", creation_operation_id: id(`group-operation-${position}`) }));
await insertMissing("writer_shotlist_groups", groups);
const shots = groups.flatMap((group, groupIndex) => Array.from({ length: 3 }, (_, position) => ({ id: id(`shot-${groupIndex}-${position}`), owner_id: userId, shotlist_id: shotlistId, group_id: group.id, origin: "manual", shot_type: ["General", "Plano medio", "Primer plano"][position], subject: ["Entrada a locación", "Acción principal", "Reacción"][position], angle: "A nivel", movement: position === 1 ? "Dolly in" : "Fijo", lens: ["24 mm", "35 mm", "50 mm"][position], duration_seconds: 18 + groupIndex * 4 + position * 3, status: "ready", position, creation_operation_id: id(`shot-operation-${groupIndex}-${position}`), source_revision: 1 })));
await insertMissing("writer_shotlist_shots", shots);

const elementSpecs = [
  ["character", "Mara", "MARA", 0, "present"], ["character", "Diego", "DIEGO", 1, "present"],
  ["location", "Casa principal", "CASA PRINCIPAL", 0, "used"], ["prop", "Llaves", "LLAVES", 0, "used"],
];
const elements = elementSpecs.map((spec, index) => ({ id: id(`element-${index}`), owner_id: userId, script_id: scriptId, category: spec[0], name: spec[1], normalized_name: spec[1].toLocaleUpperCase("es-MX"), status: "confirmed", source: "user", canonical_identity_key: spec[2], fingerprint: createHash("sha256").update(`${scriptId}:${spec[2]}`).digest("hex").slice(0, 32), revision: 1 }));
await insertMissing("writer_breakdown_elements", elements);
await insertMissing("writer_breakdown_appearances", elements.map((element, index) => ({ id: id(`appearance-${index}`), owner_id: userId, script_id: scriptId, element_id: element.id, scene_id: sceneIds[elementSpecs[index][3]], block_id: blockIds[elementSpecs[index][3]], excerpt: elementSpecs[index][1], nature: elementSpecs[index][4], from_offset: 0, to_offset: elementSpecs[index][1].length, source_revision: 1, source_hash: createHash("sha256").update(`${element.id}:appearance`).digest("hex"), stale: false })));

const emptyProductionId = id("production-empty");
const populatedProductionId = id("production-populated");
await insertMissing("production_plans", [
  { id: emptyProductionId, owner_id: userId, name: "QA REVIEW · Production vacía", timezone: "America/Mexico_City", creation_operation_id: id("production-empty-operation") },
  { id: populatedProductionId, owner_id: userId, name: "LA FRECUENCIA — Production QA", timezone: "America/Mexico_City", script_id: scriptId, shotlist_id: shotlistId, source_script_revision: 1, source_shotlist_revision: 1, creation_operation_id: id("production-populated-operation") },
]);
const days = [
  { id: id("day-1"), owner_id: userId, production_id: populatedProductionId, position: 0, name: "Día 1 · Casa principal", shoot_date: "2026-10-08", call_time: "18:00", wrap_time: "02:00", wrap_next_day: true, notes: "QA REVIEW · Jornada nocturna que cruza medianoche." },
  { id: id("day-2"), owner_id: userId, production_id: populatedProductionId, position: 1, name: "Día 2 · Jardín", shoot_date: "2026-10-09", call_time: "05:00", wrap_time: "11:00", wrap_next_day: false, notes: "QA REVIEW · Amanecer y exterior." },
];
await insertMissing("production_days", days);
const schedule = [
  ...shots.slice(0, 3).map((shot, position) => ({ id: id(`schedule-a-${position}`), owner_id: userId, production_id: populatedProductionId, day_id: days[0].id, position, item_type: "shot", title: `${shot.shot_type} · ${shot.subject}`, source_scene_id: sceneIds[0], source_group_id: groups[0].id, source_shot_id: shot.id, source_label: groups[0].title, source_revision: 1, shoot_minutes: [35, 50, 25][position], start_time: ["19:00", "19:40", "20:35"][position], end_time: ["19:35", "20:30", "21:00"][position] })),
  { id: id("schedule-meal"), owner_id: userId, production_id: populatedProductionId, day_id: days[0].id, position: 3, item_type: "logistics", logistics_type: "meal", title: "Comida", start_time: "22:30", end_time: "23:00", shoot_minutes: 30 },
  ...shots.slice(6, 8).map((shot, position) => ({ id: id(`schedule-b-${position}`), owner_id: userId, production_id: populatedProductionId, day_id: days[1].id, position, item_type: "shot", title: `${shot.shot_type} · ${shot.subject}`, source_scene_id: sceneIds[2], source_group_id: groups[2].id, source_shot_id: shot.id, source_label: groups[2].title, source_revision: 1, shoot_minutes: 40 + position * 15, start_time: position ? "06:05" : "05:15", end_time: position ? "07:00" : "05:55" })),
];
await insertMissing("production_schedule_items", schedule);
const requirements = elements.map((element, index) => ({ id: id(`requirement-${index}`), owner_id: userId, production_id: populatedProductionId, category: elementSpecs[index][0] === "character" ? "talent" : elementSpecs[index][0], name: elementSpecs[index][1], origin: "breakdown", source_element_id: element.id, source_script_id: scriptId, source_identity_key: `${elementSpecs[index][0]}:${elementSpecs[index][2]}`, source_label: elementSpecs[index][1], source_revision: 1 }));
await insertMissing("production_requirements", requirements);
await insertMissing("production_requirement_scenes", requirements.map((requirement, index) => ({ id: id(`requirement-scene-${index}`), owner_id: userId, production_id: populatedProductionId, requirement_id: requirement.id, source_scene_id: sceneIds[elementSpecs[index][3]] })));
const resources = [
  { id: id("resource-person"), owner_id: userId, production_id: populatedProductionId, name: "Elena Ruiz · QA REVIEW", resource_type: "person", contact: "Contacto sintético para revisión", availability_notes: "Disponible en Día 1; no disponible en Día 2." },
  { id: id("resource-location"), owner_id: userId, production_id: populatedProductionId, name: "Casa principal · QA REVIEW", resource_type: "location", address: "Ubicación sintética · Supabase Test", availability_notes: "Acceso confirmado para Día 1." },
  { id: id("resource-vehicle"), owner_id: userId, production_id: populatedProductionId, name: "Camioneta · QA REVIEW", resource_type: "vehicle", availability_notes: "Tentativa para traslados." },
];
await insertMissing("production_resources", resources);
await insertMissing("production_coverages", [
  { id: id("coverage-mara-day1"), owner_id: userId, production_id: populatedProductionId, requirement_id: requirements[0].id, day_id: days[0].id, resource_id: resources[0].id, status: "confirmed", required_time: "18:30", arrival_time: "18:15", confirmed_for_date: days[0].shoot_date },
  { id: id("coverage-mara-day2"), owner_id: userId, production_id: populatedProductionId, requirement_id: requirements[0].id, day_id: days[1].id, resource_id: resources[0].id, status: "unavailable", notes: "QA REVIEW · La misma persona no está disponible en esta jornada." },
  { id: id("coverage-location-day1"), owner_id: userId, production_id: populatedProductionId, requirement_id: requirements[2].id, day_id: days[0].id, resource_id: resources[1].id, status: "confirmed", required_time: "17:00", arrival_time: "16:45", confirmed_for_date: days[0].shoot_date },
]);
await insertMissing("production_tasks", [
  { id: id("task-pending"), owner_id: userId, production_id: populatedProductionId, title: "Confirmar llegada de vehículo", status: "pending", priority: "high", assignee_text: "Producción", due_date: "2026-10-07", day_id: days[0].id },
  { id: id("task-progress"), owner_id: userId, production_id: populatedProductionId, title: "Revisar continuidad de llaves", status: "in_progress", priority: "medium", assignee_text: "Arte", due_date: "2026-10-08" },
  { id: id("task-done"), owner_id: userId, production_id: populatedProductionId, title: "Cerrar permisos de jardín", status: "done", priority: "low", assignee_text: "Locaciones", due_date: "2026-10-06", day_id: days[1].id },
]);

manifest = { projectRef: TEST_REF, userId, email, password, emptyProductionId, populatedProductionId, scriptId, shotlistId, dayIds: days.map((day) => day.id), requirementIds: requirements.map((requirement) => requirement.id), createdAt: manifest.createdAt ?? new Date().toISOString(), verifiedAt: new Date().toISOString() };
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ reviewReady: true, project: TEST_REF, ordinaryLoginVerified: true, emptyPath: `/production/${emptyProductionId}`, populatedPath: `/production/${populatedProductionId}`, credentialsStoredInTemporaryManifest: true }));
