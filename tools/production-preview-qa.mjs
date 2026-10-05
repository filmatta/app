// Authenticated visual and interaction QA for a Vercel Preview backed by Supabase Test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { TEST_REF } from "./portfolio-test-context.mjs";

assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF, "Supabase Test opt-in required.");
const preview = process.env.FILMATTA_PRODUCTION_PREVIEW;
assert.ok(preview, "Preview URL required.");
const previewUrl = new URL(preview);
assert.match(previewUrl.hostname, /^(?:app-[a-z0-9]+|production-assistant-v1)-filmatta\.vercel\.app$/u, "Unexpected Preview host.");
const shareUrl = new URL(process.env.FILMATTA_PRODUCTION_SHARE_URL ?? "", previewUrl);
assert.equal(shareUrl.origin, previewUrl.origin, "Shareable Link belongs to another deployment.");
assert.ok(shareUrl.searchParams.get("_vercel_share"), "Scoped Vercel Shareable Link required.");

const manifestPath = path.join(os.tmpdir(), "filmatta-production-preview-fixture.json");
assert.ok(fs.existsSync(manifestPath), "Production Preview fixture is missing.");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.equal(manifest.projectRef, TEST_REF);
assert.match(manifest.email, /^production-preview-[0-9a-f-]+@example\.invalid$/u);

const evidence = path.resolve("output", "production-assistant");
fs.mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1536, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors = [];
const responseFailures = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500)); });
page.on("response", (response) => { if (response.status() >= 500) responseFailures.push(`${response.status()} ${new URL(response.url()).pathname}`); });

try {
  const productionPath = `/production/${manifest.productionId}`;
  const qaTaskTitle = `QA Preview · ${randomUUID().slice(0, 8)}`;
  await page.goto(shareUrl.href, { waitUntil: "networkidle" });
  await page.goto(`${previewUrl.origin}/login?next=${encodeURIComponent(productionPath)}`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(manifest.email);
  await page.locator("#password").fill(manifest.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === productionPath, { timeout: 45_000 }),
    page.getByRole("button", { name: "Iniciar sesión" }).click(),
  ]);
  await page.getByRole("heading", { name: "Production Assistant", exact: true }).waitFor();
  await page.screenshot({ path: path.join(evidence, "overview-desktop.png"), fullPage: true });

  await page.locator(".production-sidebar nav").getByRole("button", { name: /Jornadas/u }).click();
  await page.getByRole("heading", { name: "Día 1 · Casa principal" }).waitFor();
  await page.screenshot({ path: path.join(evidence, "days-desktop.png"), fullPage: true });
  assert.equal(await page.getByText("Revisar solapamientos:").count(), 0, "Unexpected overlap warning in fixture.");
  assert.ok(await page.getByText("Duración en pantalla:").count(), "Shot source durations are not visible.");

  await page.locator(".production-sidebar nav").getByRole("button", { name: /Tareas/u }).click();
  await page.getByRole("heading", { name: "Tareas de producción" }).waitFor();
  await page.getByText("＋ Nueva tarea").click();
  const createTask = page.locator(".production-task-head form");
  await createTask.locator('input[name="title"]').fill(qaTaskTitle);
  await createTask.locator('select[name="priority"]').selectOption("high");
  await createTask.locator('input[name="assignee"]').fill("Asistencia de producción");
  await createTask.getByRole("button", { name: "Crear tarea" }).click();
  await page.getByText(qaTaskTitle, { exact: true }).waitFor({ timeout: 30_000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".production-sidebar nav").getByRole("button", { name: /Tareas/u }).click();
  await page.getByText(qaTaskTitle, { exact: true }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(evidence, "tasks-mobile.png"), fullPage: true });
  await page.locator(".production-sidebar nav").getByRole("button", { name: /Recursos/u }).click();
  await page.getByRole("heading", { name: "Recursos", exact: true }).waitFor();
  await page.screenshot({ path: path.join(evidence, "resources-mobile.png"), fullPage: true });

  assert.deepEqual(responseFailures, [], `Preview returned server errors: ${responseFailures.join(", ")}`);
  const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes("favicon"));
  assert.deepEqual(relevantConsoleErrors, [], `Preview console errors: ${relevantConsoleErrors.join(" | ")}`);
  const report = {
    preview: previewUrl.origin,
    productionPath,
    authenticated: true,
    persistedAfterReload: true,
    screenshots: ["overview-desktop.png", "days-desktop.png", "tasks-mobile.png", "resources-mobile.png"],
    consoleErrors: relevantConsoleErrors.length,
    serverErrors: responseFailures.length,
  };
  fs.writeFileSync(path.join(evidence, "preview-qa.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ preview: previewUrl.origin, authenticated: true, persistedAfterReload: true, screenshots: report.screenshots.length }));
} finally {
  await context.close();
  await browser.close();
}
