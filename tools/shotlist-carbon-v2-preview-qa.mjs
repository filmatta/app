// Test-only browser audit of an immutable Vercel Preview and synthetic Supabase Test data.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { TEST_REF } from "./portfolio-test-context.mjs";

assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF, "Supabase Test opt-in required.");
const preview = process.env.FILMATTA_SHOTLIST_V2_PREVIEW;
assert.match(preview ?? "", /^https:\/\/app-[a-z0-9]+-filmatta\.vercel\.app$/u, "Immutable Preview required.");
const original = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "filmatta-storyboard-foundation-fixture.json"), "utf8"));
const fixture = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "filmatta-shotlist-carbon-v2-fixture.json"), "utf8"));
const share = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "filmatta-shotlist-carbon-v2-preview-share.json"), "utf8"));
assert.equal(original.projectRef, TEST_REF);
assert.equal(fixture.projectRef, TEST_REF);
assert.equal(original.userId, fixture.userId);
assert.equal(share.preview, preview);
const out = path.resolve("output/screenshots/shotlist-carbon-ux-v2");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const metrics = { preview, login: false, initialShots: 0, emptyLensFilter: false, writerSourceSelector: false, sourceUpdated: false, preservedShots: false, missingReference: false, restoredReference: false, sameRevisionIdempotent: false, errorRetry: false, viewports: {} };

async function api(route, init) {
  return page.evaluate(async ([route, init]) => {
    const response = await fetch(route, { credentials: "same-origin", cache: "no-store", ...init });
    return { status: response.status, body: await response.json() };
  }, [route, init]);
}
async function saveDocument(edit) {
  const current = await api(`/api/writer/scripts/${fixture.scriptId}`);
  assert.equal(current.status, 200, "Writer source must be readable by its owner.");
  const script = current.body.script;
  const next = structuredClone(script.document);
  edit(next);
  const saved = await api(`/api/writer/scripts/${fixture.scriptId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationId: crypto.randomUUID(), expectedRevision: script.revision, title: script.title, document: next, schemaVersion: 1 }) });
  assert.equal(saved.status, 200, `Writer save failed: ${saved.body.error ?? saved.status}`);
  return { before: script, after: next };
}
async function shotlist(id) {
  const result = await api(`/api/shotlists/${id}`);
  assert.equal(result.status, 200, `Shotlist GET failed: ${result.body.error ?? result.status}`);
  return result.body;
}
async function screenshot(name) { await page.screenshot({ path: path.join(out, name), fullPage: false }); }

try {
  await page.goto(share.shareUrl);
  await page.goto(`${preview}/login?next=${encodeURIComponent(`/shotlists/${fixture.linkedId}`)}`);
  await page.locator("#email").fill(original.email);
  await page.locator("#password").fill(original.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("heading", { name: "Lista de planos" }).waitFor({ timeout: 30000 });
  assert.equal(new URL(page.url()).hostname, new URL(preview).hostname);
  metrics.login = true;
  const example = await shotlist(fixture.linkedId);
  metrics.initialShots = example.shotlist.groups.reduce((sum, group) => sum + group.shots.length, 0);
  assert.equal(example.shotlist.groups.length, 3);
  assert.equal(metrics.initialShots, 18);
  await screenshot("07-preview-qa-workspace-1440.png");
  await page.getByRole("button", { name: /Filtros/u }).click();
  const lensFilter = page.getByRole("dialog", { name: "Filtrar planos" });
  await lensFilter.getByLabel("Columna").selectOption("lens");
  await lensFilter.getByRole("checkbox", { name: /Seleccionar todos/u }).uncheck();
  await lensFilter.getByRole("checkbox", { name: /Sin especificar/u }).check();
  await lensFilter.getByRole("button", { name: "Aplicar" }).click();
  await page.getByText("3 de 18").waitFor();
  metrics.emptyLensFilter = true;
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await page.setViewportSize({ width: 834, height: 900 });
  await page.getByRole("button", { name: /Importar/u }).click();
  const sourceDialog = page.getByRole("dialog", { name: "Importar a Shotlist" });
  const sourceApi = await api(`/api/shotlists/${fixture.linkedId}/import?scriptId=${fixture.scriptId}`);
  assert.equal(sourceApi.status, 200);
  assert.equal(sourceApi.body.scenes.length, 3);
  await sourceDialog.locator(".shotlist-import-scenes").waitFor({ timeout: 10000 });
  await sourceDialog.getByLabel("Guion propio").selectOption(fixture.scriptId);
  await screenshot("09-preview-qa-selector-writer-834.png");
  await sourceDialog.locator(".shotlist-import-scenes").waitFor({ timeout: 10000 });
  const sourceBounds = await sourceDialog.boundingBox();
  assert.ok(sourceBounds && sourceBounds.x >= 0 && sourceBounds.x + sourceBounds.width <= 834);
  await screenshot("09-preview-qa-selector-writer-834.png");
  metrics.writerSourceSelector = true;
  await sourceDialog.getByRole("button", { name: "Cancelar" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const width of [1440, 1920, 1024, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const visible = await page.locator(".shotlist-row").evaluateAll((nodes) => nodes.filter((node) => { const box = node.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; }).length);
    const horizontal = await page.locator(".shotlist-grid-scroll").evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
    metrics.viewports[width] = { fullRowsInViewport: visible, horizontal };
    if (width !== 1440) await screenshot(`07-preview-qa-workspace-${width}.png`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Asistido" }).click();
  await page.getByText("Añadir lo detectado").waitFor();
  await screenshot("08-preview-qa-asistido.png");
  await page.getByRole("button", { name: "Libre" }).click();

  const currentSource = await api(`/api/writer/scripts/${fixture.scriptId}`);
  assert.equal(currentSource.status, 200);
  const presentIds = new Set(currentSource.body.script.document.content.filter((block) => block.attrs?.kind === "sceneHeading").map((block) => block.attrs?.id));
  if (fixture.sceneIds.some((id) => !presentIds.has(id))) await saveDocument((document) => {
    for (const [index, id] of fixture.sceneIds.entries()) if (!presentIds.has(id)) document.content.push(
      { type: "screenplayBlock", attrs: { id, kind: "sceneHeading" }, content: [{ type: "text", text: ["INT. TALLER - NOCHE", "EXT. PUENTE - AMANECER", "INT. ARCHIVO - DÍA"][index] }] },
      { type: "screenplayBlock", attrs: { id: crypto.randomUUID(), kind: "action" }, content: [{ type: "text", text: `La acción sintética ${index + 1} continúa.` }] },
    );
  });
  let initial = await shotlist(fixture.linkedId);
  const sourceAtStart = (await api(`/api/writer/scripts/${fixture.scriptId}`)).body.script;
  if (initial.shotlist.sourceRevision !== sourceAtStart.revision || initial.shotlist.groups.some((group) => group.sourceStatus === "missing")) {
    const baseline = await api(`/api/shotlists/${fixture.linkedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "syncSource", expectedRevision: initial.shotlist.revision }) });
    assert.equal(baseline.status, 200);
    initial = await shotlist(fixture.linkedId);
  }
  const initialIds = initial.shotlist.groups.flatMap((group) => group.shots.map((shot) => shot.id));
  const initialPositions = initial.shotlist.groups.map((group) => group.position);
  await page.goto(`${preview}/shotlists/${fixture.linkedId}`);
  await page.getByRole("heading", { name: "Lista de planos" }).waitFor();
  const nextHeading = sourceAtStart.document.content[0].content[0].text === "INT. TALLER RENOMBRADO - NOCHE" ? "INT. TALLER QA - NOCHE" : "INT. TALLER RENOMBRADO - NOCHE";
  const changed = await saveDocument((document) => { document.content[0].content[0].text = nextHeading; });
  await page.reload();
  const updateButton = page.getByRole("button", { name: "Actualizar vínculos" });
  await updateButton.waitFor();
  await screenshot("05-actualizar-vinculos-antes.png");
  await updateButton.click();
  await page.getByText(/1 vínculo\(s\) actualizado\(s\)/u).waitFor();
  await screenshot("05-actualizar-vinculos-despues.png");
  const updated = await shotlist(fixture.linkedId);
  assert.equal(updated.shotlist.groups[0].sourceSceneTitle, nextHeading);
  assert.deepEqual(updated.shotlist.groups.map((group) => group.position), initialPositions);
  assert.deepEqual(updated.shotlist.groups.flatMap((group) => group.shots.map((shot) => shot.id)), initialIds);
  assert.equal(updated.shotlist.sourceRevision, changed.before.revision + 1);
  metrics.sourceUpdated = true;
  metrics.preservedShots = true;
  const repeat = await api(`/api/shotlists/${fixture.linkedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "syncSource", expectedRevision: updated.shotlist.revision }) });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.updatedGroups, 0);
  metrics.sameRevisionIdempotent = true;

  await saveDocument((document) => { document.content[2].content[0].text = "EXT. PUENTE QA - AMANECER"; });
  await page.reload();
  const failSync = async (route) => { if (route.request().method() === "PATCH") await route.abort("failed"); else await route.continue(); };
  await page.route(`**/api/shotlists/${fixture.linkedId}`, failSync);
  await page.getByRole("button", { name: "Actualizar vínculos" }).click();
  await page.locator(".shotlist-error").waitFor();
  await page.unroute(`**/api/shotlists/${fixture.linkedId}`, failSync);
  await page.getByRole("button", { name: "Reintentar vínculos" }).click();
  await page.locator(".shotlist-notice").getByText(/vínculo\(s\) actualizado\(s\)/u).waitFor();
  metrics.errorRetry = true;

  await saveDocument((document) => { document.content = document.content.filter((block) => block.attrs?.id !== fixture.sceneIds[1] && block.content?.[0]?.text !== "La acción sintética 2 continúa."); });
  await page.reload();
  await page.getByRole("button", { name: "Actualizar vínculos" }).click();
  await page.locator(".shotlist-notice").getByText(/referencia\(s\) no disponible\(s\)/u).waitFor();
  const missing = await shotlist(fixture.linkedId);
  assert.equal(missing.shotlist.groups[1].sourceStatus, "missing");
  assert.deepEqual(missing.shotlist.groups.flatMap((group) => group.shots.map((shot) => shot.id)), initialIds);
  metrics.missingReference = true;
  await screenshot("05-actualizar-vinculos-parcial.png");

  await saveDocument((document) => { document.content = changed.after.content; });
  await page.reload();
  await page.getByRole("button", { name: "Actualizar vínculos" }).click();
  await page.locator(".shotlist-notice").waitFor();
  const restored = await shotlist(fixture.linkedId);
  assert.equal(restored.shotlist.groups[1].sourceStatus, "linked");
  metrics.restoredReference = true;

  await page.goto(`${preview}/shotlists/${fixture.freeId}`);
  await page.getByRole("heading", { name: "Lista de planos" }).waitFor();
  const freeBefore = await shotlist(fixture.freeId);
  const emptyIndex = freeBefore.shotlist.groups.findIndex((group) => group.shots.length === 0);
  assert.ok(emptyIndex >= 0, "An empty scene must remain in the QA fixture.");
  const emptySection = page.locator(".shotlist-group").nth(emptyIndex);
  if (!await emptySection.getByText("Esta escena aún no tiene planos.").isVisible()) await emptySection.locator(".shotlist-group-toggle").click();
  await emptySection.getByText("Esta escena aún no tiene planos.").waitFor();
  await screenshot("02-preview-qa-escena-vacia.png");
  if (freeBefore.shotlist.groups.length === 2) {
    const footer = emptySection.locator(".shotlist-group-footer button");
    await footer.click();
    const freeAfter = await shotlist(fixture.freeId);
    assert.equal(freeAfter.shotlist.groups[emptyIndex].shots.length, 1);
    await page.reload();
    assert.equal((await shotlist(fixture.freeId)).shotlist.groups[emptyIndex].shots.length, 1);
    await page.getByRole("button", { name: /Nueva escena/u }).first().click();
    const emptyName = `Escena vacía para revisión ${Date.now()}`;
    await page.getByRole("dialog", { name: /Nueva escena/u }).getByRole("textbox").fill(emptyName);
    await page.getByRole("dialog", { name: /Nueva escena/u }).getByRole("button", { name: /Crear/u }).click();
    assert.ok((await shotlist(fixture.freeId)).shotlist.groups.some((group) => group.title === emptyName && group.shots.length === 0));
  }

  console.log(JSON.stringify(metrics));
} finally {
  await context.close();
  await browser.close();
}
