// Browser QA and publishable evidence for the persistent Production review fixtures.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CLI, TEST_REF } from "./portfolio-test-context.mjs";

assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF, "Supabase Test opt-in required.");
const preview = new URL(process.env.FILMATTA_PRODUCTION_PREVIEW ?? "");
assert.match(preview.hostname, /^(?:app-[a-z0-9]+|production-assistant-v1)-filmatta\.vercel\.app$/u, "Unexpected Preview host.");
const share = new URL(process.env.FILMATTA_PRODUCTION_SHARE_URL ?? "", preview);
assert.equal(share.origin, preview.origin, "Shareable Link belongs to another Preview.");
assert.ok(share.searchParams.get("_vercel_share"), "Vercel Shareable Link required.");
const manifestPath = path.join(os.tmpdir(), "filmatta-production-review-v1.json");
assert.ok(fs.existsSync(manifestPath), "Persistent review manifest is missing.");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.equal(manifest.projectRef, TEST_REF);
assert.equal(manifest.email, "production-review-v1@example.invalid");

const keys = JSON.parse(execFileSync(SUPABASE_CLI, ["projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const publishableKey = keys.find((item) => item.name === "anon")?.api_key;
const serviceKey = keys.find((item) => item.name === "service_role")?.api_key;
assert.ok(publishableKey && serviceKey);
assert.equal(JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url")).ref, TEST_REF);
const dbUrl = `https://${TEST_REF}.supabase.co`;
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(dbUrl, serviceKey, clientOptions);
const ordinary = createClient(dbUrl, publishableKey, clientOptions);
assert.equal((await ordinary.auth.signInWithPassword({ email: manifest.email, password: manifest.password })).error, null);

const evidence = path.resolve(
  process.env.FILMATTA_PRODUCTION_EVIDENCE ?? path.join("public", "review", "production-assistant-v1"),
);
fs.mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1536, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const serverErrors = [];
const consoleErrors = [];
page.on("response", (response) => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("favicon")) consoleErrors.push(message.text().slice(0, 300)); });
const checks = [];
let temporaryProductionId = null;

async function selectSection(name) {
  await page.locator(".production-sidebar nav").getByRole("button", { name }).click();
}

try {
  await page.goto(share.href, { waitUntil: "networkidle" });
  await page.goto(`${preview.origin}/login?next=${encodeURIComponent(`/production/${manifest.emptyProductionId}`)}`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(manifest.email);
  await page.locator("#password").fill(manifest.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/production/${manifest.emptyProductionId}`, { timeout: 45_000 }),
    page.getByRole("button", { name: "Iniciar sesión" }).click(),
  ]);
  await page.getByRole("heading", { name: "Production Assistant", exact: true }).waitFor();
  await page.getByText("Sin necesidades registradas. Desglose por revisar.").waitFor();
  assert.equal(await page.getByText(/listo para producción/iu).count(), 0, "Zero requirements were presented as ready.");
  await page.screenshot({ path: path.join(evidence, "01-empty-production.png"), fullPage: true });
  checks.push("empty production is not presented as ready");

  await page.goto(`${preview.origin}/production`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Nueva producción/u }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre de la producción").fill("QA REVIEW · Verificación temporal desde fuente");
  await dialog.getByLabel("Shotlist").selectOption(manifest.shotlistId);
  await Promise.all([
    page.waitForURL((url) => /^\/production\/[0-9a-f-]{36}$/u.test(url.pathname), { timeout: 45_000 }),
    dialog.getByRole("button", { name: "Crear estructura" }).click(),
  ]);
  temporaryProductionId = page.url().split("/").pop();
  assert.notEqual(temporaryProductionId, manifest.populatedProductionId);
  await page.getByText("QA REVIEW · LA FRECUENCIA · Shotlist sintética", { exact: true }).waitFor();
  checks.push("ordinary Preview session creates structure from an existing source without AI");

  await page.goto(`${preview.origin}/production/${manifest.populatedProductionId}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Production Assistant", exact: true }).waitFor();
  await page.getByText(/^\d de 9 planos$/u).waitFor();
  await page.getByText("2 pendientes").waitFor();
  await page.screenshot({ path: path.join(evidence, "02-populated-overview.png"), fullPage: true });
  checks.push("populated overview preserves two days, tasks, sources and coverage state");

  await selectSection(/Jornadas/u);
  await page.getByRole("heading", { name: "Día 1 · Casa principal" }).waitFor();
  await page.locator(".production-groups details").first().locator("summary").click();
  await page.getByText("Duración en pantalla:").first().waitFor();
  await page.locator(".production-timeline-axis").waitFor();
  await page.screenshot({ path: path.join(evidence, "03-horizontal-timeline.png"), fullPage: true });
  checks.push("horizontal day timeline distinguishes screen duration from shoot minutes and shows overnight wrap");

  const currentScheduled = await ordinary.from("production_schedule_items").select("id", { count: "exact", head: true }).eq("production_id", manifest.populatedProductionId).eq("item_type", "shot");
  const salaGroup = page.locator(".production-groups details").filter({ hasText: "INT. SALA - NOCHE" });
  await salaGroup.locator("summary").click();
  const unscheduledButton = salaGroup.getByRole("button", { name: "＋ Añadir" }).first();
  if ((currentScheduled.count ?? 0) < 6 && await unscheduledButton.count()) {
    await unscheduledButton.click();
    await page.getByText(/6\/9 programados/u).waitFor({ timeout: 30_000 });
  }
  const scheduledShotId = (await ordinary.from("production_schedule_items").select("source_shot_id").eq("production_id", manifest.populatedProductionId).eq("source_group_id", (await ordinary.from("writer_shotlist_groups").select("id").eq("shotlist_id", manifest.shotlistId).eq("position", 1).single()).data.id).limit(1).single()).data.source_shot_id;
  const duplicateCount = await ordinary.from("production_schedule_items").select("id", { count: "exact", head: true }).eq("production_id", manifest.populatedProductionId).eq("source_shot_id", scheduledShotId);
  assert.equal(duplicateCount.count, 1, "A source shot was scheduled more than once.");
  checks.push("shot scheduling persists and unique source-shot enforcement prevents duplicates");

  await selectSection(/Necesidades/u);
  await page.getByRole("button", { name: /Mara/u }).click();
  const resourceSelect = page.getByLabel("Recurso");
  await resourceSelect.waitFor();
  assert.ok(await resourceSelect.inputValue(), "Confirmed day coverage has no assigned resource.");
  assert.equal(await page.getByLabel("Estado").inputValue(), "confirmed");
  await page.screenshot({ path: path.join(evidence, "04-requirement-coverage.png"), fullPage: true });
  checks.push("resource assignment and confirmation are scoped to the selected day; unresolved Llaves remains visible");

  await selectSection(/Jornadas/u);
  const editDay = page.locator(".production-plan-panel details").filter({ hasText: "Editar jornada" });
  await editDay.locator("summary").click();
  await editDay.locator('input[name="date"]').fill("2026-10-10");
  await editDay.getByRole("button", { name: "Guardar jornada" }).click();
  await page.getByText(/10 oct/u).first().waitFor({ timeout: 30_000 });
  await selectSection(/Necesidades/u);
  await page.getByRole("button", { name: /Mara/u }).click();
  await page.getByText("La fecha cambió. Esta cobertura necesita reconfirmación.").waitFor();
  checks.push("changing a day date requests reconfirmation");

  await selectSection(/Tareas/u);
  const interactiveTitle = "QA REVIEW · Persistencia interactiva";
  if (!await page.getByText(interactiveTitle, { exact: true }).count()) {
    await page.getByText("＋ Nueva tarea").click();
    const form = page.locator(".production-task-head form");
    await form.locator('input[name="title"]').fill(interactiveTitle);
    await form.getByRole("button", { name: "Crear tarea" }).click();
    await page.getByText(interactiveTitle, { exact: true }).waitFor({ timeout: 30_000 });
  }
  await page.getByLabel(`Estado de ${interactiveTitle}`).selectOption("done");
  await page.reload({ waitUntil: "networkidle" });
  await selectSection(/Tareas/u);
  await page.getByText(interactiveTitle, { exact: true }).waitFor();
  assert.equal(await page.getByLabel(`Estado de ${interactiveTitle}`).inputValue(), "done");
  checks.push("task creation/completion survives reload");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(evidence, "05-mobile-tasks.png"), fullPage: true });
  checks.push("mobile Production task view renders in an ordinary session");

  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto(`${preview.origin}/writer/${manifest.scriptId}`, { waitUntil: "networkidle" });
  await page.locator(".writer-paper .tiptap").waitFor({ state: "visible", timeout: 45_000 });
  await page.screenshot({ path: path.join(evidence, "06-writer.png"), fullPage: true });
  checks.push("ordinary session opens the persisted Writer review document");

  await page.goto(`${preview.origin}/admin`, { waitUntil: "networkidle" });
  assert.equal(new URL(page.url()).pathname, "/", "A non-admin QA account reached the Admin surface.");
  checks.push("ordinary account is rejected from Admin");

  await page.goto(`${preview.origin}/cuenta/configuracion`, { waitUntil: "networkidle" });
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/", { timeout: 45_000 }),
    page.getByRole("button", { name: "Cerrar sesión", exact: true }).click(),
  ]);
  await page.goto(`${preview.origin}/production/${manifest.populatedProductionId}`, { waitUntil: "networkidle" });
  assert.equal(new URL(page.url()).pathname, "/login", "Logout did not invalidate protected Production access.");
  checks.push("logout invalidates protected access");

  assert.deepEqual(serverErrors, []);
  assert.deepEqual(consoleErrors, []);
} finally {
  await admin.from("production_days").update({ shoot_date: "2026-10-08" }).eq("id", manifest.dayIds[0]).eq("production_id", manifest.populatedProductionId);
  await admin.from("production_coverages").update({ status: "confirmed", confirmed_for_date: "2026-10-08", needs_reconfirmation: false }).eq("requirement_id", manifest.requirementIds[0]).eq("day_id", manifest.dayIds[0]);
  if (temporaryProductionId) await admin.from("production_plans").delete().eq("id", temporaryProductionId).eq("owner_id", manifest.userId);
  await context.close();
  await browser.close();
}

const report = { generatedAt: new Date().toISOString(), preview: preview.origin, project: TEST_REF, ordinaryLoginVerified: true, preservedProductions: [manifest.emptyProductionId, manifest.populatedProductionId], checks, screenshots: ["01-empty-production.png", "02-populated-overview.png", "03-horizontal-timeline.png", "04-requirement-coverage.png", "05-mobile-tasks.png", "06-writer.png"], consoleErrors: consoleErrors.length, serverErrors: serverErrors.length };
fs.writeFileSync(path.join(evidence, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: checks.length, screenshots: report.screenshots.length, temporaryProductionRemoved: true, preservedProductions: 2 }));
