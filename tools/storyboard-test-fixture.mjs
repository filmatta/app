import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { TEST_REF, testConfiguration } from "../tests/integration/test-project.mjs";

const BUCKET = "writer-production-assets";
const manifestPath = path.join(os.tmpdir(), "filmatta-storyboard-foundation-fixture.json");
const config = testConfiguration();
const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (process.argv[2] === "cleanup") {
  assert.ok(fs.existsSync(manifestPath), "No Storyboard fixture manifest exists.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.projectRef, TEST_REF);
  assert.match(manifest.email, /^storyboard-preview-[0-9a-f-]+@example\.invalid$/u);
  const assetRows = await admin.from("writer_production_assets").select("storage_path,original_storage_path").eq("owner_id", manifest.userId);
  assert.equal(assetRows.error, null, "Fixture asset inventory failed.");
  const storagePaths = [...new Set((assetRows.data ?? []).flatMap((row) => [row.storage_path, row.original_storage_path].filter(Boolean)))];
  if (storagePaths.length) {
    const storage = await admin.storage.from(BUCKET).remove(storagePaths);
    assert.equal(storage.error, null, "Fixture storage cleanup failed.");
  }
  const removed = await admin.auth.admin.deleteUser(manifest.userId);
  assert.equal(removed.error, null, "Fixture user cleanup failed.");
  fs.rmSync(manifestPath);
  console.log("Storyboard Preview fixture removed from Supabase Test.");
  process.exit(0);
}

assert.equal(process.argv[2] ?? "setup", "setup");
assert.equal(fs.existsSync(manifestPath), false, "Clean up the earlier Storyboard fixture first.");

const email = `storyboard-preview-${randomUUID()}@example.invalid`;
const password = `${randomBytes(24).toString("base64url")}aA1!`;
const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Storyboard Foundation QA" },
});
assert.equal(created.error, null, "Fixture user creation failed.");
const userId = created.data.user.id;
const manifest = { projectRef: TEST_REF, userId, email, password, storagePaths: [] };
fs.writeFileSync(manifestPath, JSON.stringify(manifest));

try {
  const normal = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await normal.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null, "Ordinary QA sign-in failed.");

  const sceneIds = Array.from({ length: 3 }, () => randomUUID());
  const scriptDocument = {
      type: "doc",
      content: sceneIds.flatMap((sceneId, index) => [
        { type: "sceneHeading", attrs: { id: sceneId }, content: [{ type: "text", text: `INT. ESTUDIO ${index + 1} - NOCHE` }] },
        { type: "action", attrs: { id: randomUUID() }, content: [{ type: "text", text: `La acción visual de prueba ${index + 1} avanza frente a cámara.` }] },
      ]),
  };
  const script = await normal.rpc("writer_create_script", {
    p_operation_id: randomUUID(),
    p_title: "Storyboard QA · Guion vinculado",
    p_schema_version: 1,
    p_document: scriptDocument,
  });
  assert.equal(script.error, null, "Fixture script creation failed.");
  const scriptId = script.data[0].id;

  const linkedId = randomUUID();
  const freeId = randomUUID();
  const stressId = randomUUID();
  const lists = await admin.from("writer_shotlists").insert([
    { id: linkedId, owner_id: userId, script_id: scriptId, title: "QA Storyboard · Vinculada", source_revision: 1, creation_operation_id: randomUUID() },
    { id: freeId, owner_id: userId, script_id: null, title: "QA Storyboard · Libre", source_revision: null, creation_operation_id: randomUUID() },
    { id: stressId, owner_id: userId, script_id: null, title: "QA Storyboard · Estrés 3000", source_revision: null, creation_operation_id: randomUUID() },
  ]);
  assert.equal(lists.error, null, "Fixture shotlists failed.");

  const groups = [];
  for (let index = 0; index < 3; index += 1) {
    groups.push({ id: randomUUID(), owner_id: userId, shotlist_id: linkedId, source_scene_id: sceneIds[index], source_scene_title: `INT. ESTUDIO ${index + 1} - NOCHE`, title: `INT. ESTUDIO ${index + 1} - NOCHE`, position: index, source_status: "linked", creation_operation_id: randomUUID() });
    groups.push({ id: randomUUID(), owner_id: userId, shotlist_id: freeId, source_scene_id: null, source_scene_title: null, title: `Grupo manual ${index + 1}`, position: index, source_status: "manual", creation_operation_id: randomUUID() });
  }
  for (let index = 0; index < 100; index += 1) {
    groups.push({ id: randomUUID(), owner_id: userId, shotlist_id: stressId, source_scene_id: null, source_scene_title: null, title: `Secuencia de estrés ${String(index + 1).padStart(3, "0")}`, position: index, source_status: "manual", creation_operation_id: randomUUID() });
  }
  await insertBatches("writer_shotlist_groups", groups, 250);

  const linkedGroups = groups.filter((group) => group.shotlist_id === linkedId);
  const freeGroups = groups.filter((group) => group.shotlist_id === freeId);
  const stressGroups = groups.filter((group) => group.shotlist_id === stressId);
  const shots = [];
  for (const [groupIndex, group] of [...linkedGroups, ...freeGroups].entries()) {
    for (let position = 0; position < 6; position += 1) shots.push(shotRow(group, position, groupIndex));
  }
  for (const [groupIndex, group] of stressGroups.entries()) {
    for (let position = 0; position < 30; position += 1) shots.push(shotRow(group, position, groupIndex + 20));
  }
  await insertBatches("writer_shotlist_shots", shots, 300);

  const sourceAsset = await createSourceAsset();
  const fixtureShots = shots.filter((shot) => shot.shotlist_id === linkedId).slice(0, 5);
  const documents = [drawingDocument(), drawingDocument("#b51f38"), mixedDocument(sourceAsset.id), referenceDocument(sourceAsset.id), drawingDocument("#1f80b5")];
  const panelIds = [];
  for (let index = 0; index < documents.length; index += 1) {
    const shot = index < 3 ? fixtureShots[0] : fixtureShots[index - 2];
    const document = documents[index];
    const note = ["Mano entra a cuadro", "El casete llega al reproductor", "Pulsa PLAY", "Referencia de encuadre", "Reacción contenida"][index];
    const panel = await admin.rpc("storyboard_create_panel", {
      p_actor_id: userId,
      p_shotlist_id: linkedId,
      p_shot_id: shot.id,
      p_operation_id: randomUUID(),
      p_document: document,
      p_schema_version: 1,
      p_base_asset_id: document.reference?.assetId ?? null,
      p_visual_note: note,
      p_logical_width: document.frame.width,
      p_logical_height: document.frame.height,
      p_content_kind: document.reference ? document.objects.length ? "mixed" : "reference" : document.objects.length ? "drawing" : "empty",
      p_content_hash: sha(stableStringify({ document, visualNote: note })),
      p_source_shot_revision: 1,
      p_source_context_hash: shotContextHash(shot),
    });
    assert.equal(panel.error, null, "Fixture panel failed.");
    const panelId = panel.data[0].panel_id;
    const revisionId = panel.data[0].revision_id;
    panelIds.push(panelId);
    await createPreview(panelId, revisionId, index);
    if (index === 0) {
      const approval = await admin.rpc("storyboard_approve_panel", { p_actor_id: userId, p_panel_id: panelId, p_revision_id: revisionId });
      assert.equal(approval.error, null, "Fixture approval failed.");
    }
  }

  Object.assign(manifest, { scriptId, linkedId, freeId, stressId, panelIds });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(JSON.stringify({
    fixture: true,
    email,
    password,
    linkedPath: `/shotlists/${linkedId}/storyboard`,
    freePath: `/shotlists/${freeId}/storyboard`,
    stressPath: `/shotlists/${stressId}/storyboard`,
    stressShots: 3000,
  }));
} catch (error) {
  if (manifest.storagePaths.length) await admin.storage.from(BUCKET).remove(manifest.storagePaths);
  await admin.auth.admin.deleteUser(userId);
  fs.rmSync(manifestPath, { force: true });
  throw error;
}

function shotRow(group, position, seed) {
  const types = ["Plano general", "Plano medio", "Primer plano", "Plano detalle", "OTS", "POV"];
  const movements = ["Fijo", "Pan", "Dolly in", "Seguimiento"];
  return {
    id: randomUUID(), owner_id: userId, shotlist_id: group.shotlist_id, group_id: group.id,
    origin: "manual", shot_type: types[(position + seed) % types.length], composition: position % 2 ? "Regla de tercios" : null,
    subject: `Acción ${position + 1}: el sujeto cruza el encuadre`, angle: position % 3 ? "A nivel" : "Picado",
    movement: movements[(position + seed) % movements.length], lens: `${[24, 35, 50, 85][(position + seed) % 4]} mm`,
    description: "Beat visual breve para comprobar el tablero.", intention: "Mantener claridad espacial y ritmo.", notes: position % 4 ? null : "Revisar continuidad de mirada.",
    status: "ready", position, creation_operation_id: randomUUID(), revision: 1,
  };
}

function drawingDocument(color = "#202020") {
  return { schemaVersion: 1, frame: { width: 1600, height: 900 }, reference: null, objects: [
    { id: randomUUID(), type: "stroke", color, opacity: 1, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 10, points: [{ x: 180, y: 620 }, { x: 420, y: 360 }, { x: 760, y: 480 }, { x: 1280, y: 250 }] },
    { id: randomUUID(), type: "rectangle", color, opacity: 1, x: 520, y: 260, rotation: 0, scaleX: 1, scaleY: 1, width: 520, height: 340, strokeWidth: 8, fill: null },
    { id: randomUUID(), type: "arrow", color: "#b51f38", opacity: 1, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 8, points: [260, 720, 740, 510] },
    { id: randomUUID(), type: "text", color, opacity: 1, x: 1060, y: 650, rotation: 0, scaleX: 1, scaleY: 1, text: "PLAY", width: 300, fontSize: 72, fontFamily: "Arial", align: "left" },
  ] };
}

function referenceDocument(assetId) {
  return { schemaVersion: 1, frame: { width: 1600, height: 900 }, reference: { assetId, x: 0, y: 0, width: 1600, height: 900, rotation: 0, opacity: 1 }, objects: [] };
}

function mixedDocument(assetId) {
  const document = drawingDocument("#f4f4f4");
  document.reference = { assetId, x: 0, y: 0, width: 1600, height: 900, rotation: 0, opacity: 0.75 };
  return document;
}

async function createSourceAsset() {
  const id = randomUUID();
  const originalPath = `${userId}/storyboard/originals/${id}.png`;
  const displayPath = `${userId}/storyboard/display/${id}.webp`;
  const svg = Buffer.from(`<svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1600" height="900" fill="#172029"/><circle cx="800" cy="410" r="260" fill="#8d2334"/><rect x="300" y="650" width="1000" height="30" fill="#e9e2d4"/><text x="800" y="440" text-anchor="middle" fill="#fff" font-family="Arial" font-size="88">REFERENCE</text></svg>`);
  const original = await sharp(svg).png().toBuffer();
  const display = await sharp(svg).webp({ quality: 90 }).toBuffer();
  await upload(originalPath, original, "image/png");
  await upload(displayPath, display, "image/webp");
  const row = await admin.from("writer_production_assets").insert({
    id, owner_id: userId, storage_path: displayPath, mime_type: "image/webp", size_bytes: display.byteLength, width: 1600, height: 900,
    original_storage_path: originalPath, original_mime_type: "image/png", original_size_bytes: original.byteLength, original_width: 1600, original_height: 900, asset_purpose: "source",
  });
  assert.equal(row.error, null, "Source asset registration failed.");
  return { id };
}

async function createPreview(panelId, revisionId, index) {
  const id = randomUUID();
  const storagePath = `${userId}/storyboard/previews/${revisionId}/${id}.webp`;
  const colors = ["#201c20", "#1f282f", "#55202b", "#27353b", "#1f2637"];
  const svg = Buffer.from(`<svg width="960" height="540" xmlns="http://www.w3.org/2000/svg"><rect width="960" height="540" fill="${colors[index]}"/><rect x="200" y="125" width="560" height="290" fill="none" stroke="#f2eee8" stroke-width="8"/><path d="M120 450 L480 260 L820 120" fill="none" stroke="#b51f38" stroke-width="14"/><text x="48" y="72" fill="#f2eee8" font-family="Arial" font-size="38">PANEL ${index + 1}</text></svg>`);
  const image = await sharp(svg).webp({ quality: 82 }).toBuffer();
  await upload(storagePath, image, "image/webp");
  const asset = await admin.from("writer_production_assets").insert({ id, owner_id: userId, storage_path: storagePath, mime_type: "image/webp", size_bytes: image.byteLength, width: 960, height: 540, asset_purpose: "storyboard_preview" });
  assert.equal(asset.error, null, "Preview asset registration failed.");
  const render = await admin.from("storyboard_panel_renders").insert({ owner_id: userId, panel_id: panelId, revision_id: revisionId, kind: "thumbnail", status: "ready", asset_id: id, operation_id: randomUUID() });
  assert.equal(render.error, null, "Preview render registration failed.");
}

async function upload(storagePath, bytes, contentType) {
  const result = await admin.storage.from(BUCKET).upload(storagePath, bytes, { contentType, upsert: false });
  assert.equal(result.error, null, `Fixture upload failed: ${storagePath}`);
  manifest.storagePaths.push(storagePath);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
}

async function insertBatches(table, rows, size) {
  for (let index = 0; index < rows.length; index += size) {
    const result = await admin.from(table).insert(rows.slice(index, index + size));
    assert.equal(result.error, null, `Fixture insert failed: ${table} batch ${index / size + 1}`);
  }
}

function shotContextHash(shot) {
  return sha(stableStringify({
    subject: shot.subject.trim(), shotType: shot.shot_type.trim(), composition: shot.composition?.trim() || null,
    angle: shot.angle.trim(), movement: shot.movement.trim(), lens: shot.lens?.trim() || null,
    description: shot.description?.trim() || null, intention: shot.intention?.trim() || null,
    notes: shot.notes?.trim() || null, assetId: shot.asset_id ?? null,
  }));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}
