// Reusable Preview fixture for Production Assistant V1 on Supabase Test.
// Credentials stay in the OS temporary directory and are never printed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CLI, TEST_REF } from "./portfolio-test-context.mjs";

assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF, "Supabase Test opt-in required.");
const manifestPath = path.join(os.tmpdir(), "filmatta-production-preview-fixture.json");

const keys = JSON.parse(execFileSync(SUPABASE_CLI, [
  "projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json",
], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const publishableKey = keys.find((item) => item.name === "anon")?.api_key;
const serviceKey = keys.find((item) => item.name === "service_role")?.api_key;
assert.ok(publishableKey && serviceKey, "Supabase Test keys unavailable.");
assert.equal(JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url")).ref, TEST_REF, "Refusing a non-Test service key.");
const url = `https://${TEST_REF}.supabase.co`;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceKey, options);

if (process.argv[2] === "cleanup") {
  assert.ok(fs.existsSync(manifestPath), "No Production Preview fixture exists.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.projectRef, TEST_REF);
  assert.match(manifest.email, /^production-preview-[0-9a-f-]+@example\.invalid$/u);
  const removed = await admin.auth.admin.deleteUser(manifest.userId);
  assert.equal(removed.error, null, "Fixture cleanup failed.");
  fs.rmSync(manifestPath);
  console.log("Production Preview fixture removed from Supabase Test.");
  process.exit(0);
}

assert.equal(process.argv[2] ?? "setup", "setup");
assert.equal(fs.existsSync(manifestPath), false, "Clean up the earlier Production Preview fixture first.");

const email = `production-preview-${randomUUID()}@example.invalid`;
const password = `${randomBytes(24).toString("base64url")}aA1!`;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Production Assistant QA" } });
assert.equal(created.error, null, "Fixture user creation failed.");
const userId = created.data.user.id;
const manifest = { projectRef: TEST_REF, userId, email, password };
fs.writeFileSync(manifestPath, JSON.stringify(manifest));

try {
  const normal = createClient(url, publishableKey, options);
  const signed = await normal.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null, "Ordinary Preview sign-in failed.");

  const sceneIds = Array.from({ length: 3 }, () => randomUUID());
  const document = {
    type: "doc",
    content: sceneIds.flatMap((sceneId, index) => [
      { type: "screenplayBlock", attrs: { id: sceneId, kind: "sceneHeading" }, content: [{ type: "text", text: ["EXT. CASA PRINCIPAL - NOCHE", "INT. SALA - NOCHE", "EXT. JARDÍN - AMANECER"][index] }] },
      { type: "screenplayBlock", attrs: { id: randomUUID(), kind: "action" }, content: [{ type: "text", text: ["Mara llega a la casa y se detiene frente a la puerta.", "Mara encuentra a Diego junto a la mesa.", "El equipo prepara el último plano antes del amanecer."][index] }] },
    ]),
  };
  const script = await normal.rpc("writer_create_script", { p_operation_id: randomUUID(), p_title: "LA FRECUENCIA · Guion QA", p_schema_version: 1, p_document: document });
  assert.equal(script.error, null, "Fixture script creation failed.");
  const scriptId = script.data[0].id;
  const shotlistId = randomUUID();
  const shotlist = await admin.from("writer_shotlists").insert({ id: shotlistId, owner_id: userId, script_id: scriptId, title: "LA FRECUENCIA · Shotlist QA", source_revision: 1, creation_operation_id: randomUUID() });
  assert.equal(shotlist.error, null, "Fixture Shotlist failed.");

  const groups = sceneIds.map((sceneId, position) => ({
    id: randomUUID(), owner_id: userId, shotlist_id: shotlistId, source_scene_id: sceneId,
    source_scene_title: document.content[position * 2].content[0].text,
    title: document.content[position * 2].content[0].text, position, source_status: "linked", creation_operation_id: randomUUID(),
  }));
  const groupInsert = await admin.from("writer_shotlist_groups").insert(groups);
  assert.equal(groupInsert.error, null, "Fixture groups failed.");
  const shots = groups.flatMap((group, groupIndex) => Array.from({ length: 3 }, (_, position) => ({
    id: randomUUID(), owner_id: userId, shotlist_id: shotlistId, group_id: group.id, origin: "manual",
    shot_type: ["General", "Plano medio", "Primer plano"][position], subject: ["Entrada a locación", "Acción principal", "Reacción"][position],
    angle: "A nivel", movement: position === 1 ? "Dolly in" : "Fijo", lens: ["24 mm", "35 mm", "50 mm"][position],
    duration_seconds: 18 + groupIndex * 4 + position * 3, status: "ready", position, creation_operation_id: randomUUID(), revision: 1,
  })));
  const shotInsert = await admin.from("writer_shotlist_shots").insert(shots);
  assert.equal(shotInsert.error, null, "Fixture shots failed.");

  const elementSpecs = [
    { category: "character", name: "Mara", identity: "character:MARA", sceneId: sceneIds[0], nature: "present" },
    { category: "character", name: "Diego", identity: "character:DIEGO", sceneId: sceneIds[1], nature: "present" },
    { category: "location", name: "Casa principal", identity: "location:CASA PRINCIPAL", sceneId: sceneIds[0], nature: "used" },
    { category: "prop", name: "Llaves", identity: "prop:LLAVES", sceneId: sceneIds[0], nature: "used" },
  ];
  const elements = elementSpecs.map((item) => ({ id: randomUUID(), owner_id: userId, script_id: scriptId, category: item.category, name: item.name, normalized_name: item.name.toLocaleUpperCase("es-MX"), status: "confirmed", source: "user", canonical_identity_key: item.identity.split(":")[1], fingerprint: createHash("sha256").update(`${scriptId}:${item.identity}`).digest("hex").slice(0, 32), revision: 1 }));
  const elementInsert = await admin.from("writer_breakdown_elements").insert(elements);
  assert.equal(elementInsert.error, null, "Fixture Breakdown elements failed.");
  const appearances = elements.map((element, index) => ({ owner_id: userId, script_id: scriptId, element_id: element.id, scene_id: elementSpecs[index].sceneId, block_id: randomUUID(), excerpt: elementSpecs[index].name, nature: elementSpecs[index].nature, from_offset: 0, to_offset: elementSpecs[index].name.length, source_revision: 1, source_hash: createHash("sha256").update(`${element.id}:appearance`).digest("hex"), stale: false }));
  const appearanceInsert = await admin.from("writer_breakdown_appearances").insert(appearances);
  assert.equal(appearanceInsert.error, null, "Fixture Breakdown appearances failed.");

  const productionId = randomUUID();
  const production = await normal.from("production_plans").insert({ id: productionId, owner_id: userId, name: "LA FRECUENCIA", timezone: "America/Mexico_City", script_id: scriptId, shotlist_id: shotlistId, source_script_revision: 1, source_shotlist_revision: 1, creation_operation_id: randomUUID() });
  assert.equal(production.error, null, "Fixture production failed.");
  const days = [
    { id: randomUUID(), owner_id: userId, production_id: productionId, position: 0, name: "Día 1 · Casa principal", shoot_date: "2026-10-08", call_time: "18:00", wrap_time: "02:00", wrap_next_day: true, notes: "Exterior noche y transición a interior." },
    { id: randomUUID(), owner_id: userId, production_id: productionId, position: 1, name: "Día 2 · Jardín", shoot_date: "2026-10-09", call_time: "05:00", wrap_time: "11:00", wrap_next_day: false, notes: "Amanecer y recursos de exterior." },
  ];
  assert.equal((await normal.from("production_days").insert(days)).error, null, "Fixture days failed.");
  const schedule = [
    ...shots.slice(0, 3).map((shot, position) => ({ owner_id: userId, production_id: productionId, day_id: days[0].id, position, item_type: "shot", title: `${shot.shot_type} · ${shot.subject}`, source_scene_id: sceneIds[0], source_group_id: groups[0].id, source_shot_id: shot.id, source_label: groups[0].title, source_revision: 1, shoot_minutes: [35, 50, 25][position], start_time: ["19:00", "19:40", "20:35"][position], end_time: ["19:35", "20:30", "21:00"][position] })),
    { owner_id: userId, production_id: productionId, day_id: days[0].id, position: 3, item_type: "logistics", logistics_type: "meal", title: "Comida", start_time: "22:30", end_time: "23:00", shoot_minutes: 30 },
    ...shots.slice(6, 8).map((shot, index) => ({ owner_id: userId, production_id: productionId, day_id: days[1].id, position: index, item_type: "shot", title: `${shot.shot_type} · ${shot.subject}`, source_scene_id: sceneIds[2], source_group_id: groups[2].id, source_shot_id: shot.id, source_label: groups[2].title, source_revision: 1, shoot_minutes: 40 + index * 15, start_time: index ? "06:05" : "05:15", end_time: index ? "07:00" : "05:55" })),
  ];
  assert.equal((await normal.from("production_schedule_items").insert(schedule)).error, null, "Fixture schedule failed.");

  const requirements = elements.map((element, index) => ({ id: randomUUID(), owner_id: userId, production_id: productionId, category: elementSpecs[index].category === "character" ? "talent" : elementSpecs[index].category, name: elementSpecs[index].name, origin: "breakdown", source_element_id: element.id, source_script_id: scriptId, source_identity_key: elementSpecs[index].identity, source_label: elementSpecs[index].name, source_revision: 1 }));
  assert.equal((await normal.from("production_requirements").insert(requirements)).error, null, "Fixture requirements failed.");
  assert.equal((await normal.from("production_requirement_scenes").insert(requirements.map((requirement, index) => ({ owner_id: userId, production_id: productionId, requirement_id: requirement.id, source_scene_id: elementSpecs[index].sceneId })))).error, null, "Fixture requirement scenes failed.");
  const resources = [
    { id: randomUUID(), owner_id: userId, production_id: productionId, name: "Elena Ruiz", resource_type: "person", contact: "Producción — contacto de QA", availability_notes: "Disponible desde call." },
    { id: randomUUID(), owner_id: userId, production_id: productionId, name: "Casa principal", resource_type: "location", address: "Ubicación de prueba · Supabase Test", availability_notes: "Acceso confirmado para Día 1." },
    { id: randomUUID(), owner_id: userId, production_id: productionId, name: "Camioneta de producción", resource_type: "vehicle", availability_notes: "Tentativa para traslados." },
  ];
  assert.equal((await normal.from("production_resources").insert(resources)).error, null, "Fixture resources failed.");
  assert.equal((await normal.from("production_coverages").insert([
    { owner_id: userId, production_id: productionId, requirement_id: requirements[0].id, day_id: days[0].id, resource_id: resources[0].id, status: "confirmed", required_time: "18:30", arrival_time: "18:15", confirmed_for_date: days[0].shoot_date },
    { owner_id: userId, production_id: productionId, requirement_id: requirements[2].id, day_id: days[0].id, resource_id: resources[1].id, status: "confirmed", required_time: "17:00", arrival_time: "16:45", confirmed_for_date: days[0].shoot_date },
  ])).error, null, "Fixture coverage failed.");
  assert.equal((await normal.from("production_tasks").insert([
    { owner_id: userId, production_id: productionId, title: "Confirmar llegada de vehículo", status: "pending", priority: "high", assignee_text: "Producción", due_date: "2026-10-07", day_id: days[0].id },
    { owner_id: userId, production_id: productionId, title: "Revisar continuidad de utilería", status: "in_progress", priority: "medium", assignee_text: "Arte", due_date: "2026-10-08" },
    { owner_id: userId, production_id: productionId, title: "Cerrar permisos de jardín", status: "done", priority: "low", assignee_text: "Locaciones", due_date: "2026-10-06", day_id: days[1].id },
  ])).error, null, "Fixture tasks failed.");

  Object.assign(manifest, { productionId, scriptId, shotlistId });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(JSON.stringify({ fixture: true, project: TEST_REF, productionPath: `/production/${productionId}`, credentialsStoredInTemporaryManifest: true }));
} catch (error) {
  await admin.auth.admin.deleteUser(userId);
  fs.rmSync(manifestPath, { force: true });
  throw error;
}
