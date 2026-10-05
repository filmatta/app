import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.FILMATTA_STORYBOARD_QA_URL ?? "http://127.0.0.1:3107";
const shareUrl = process.env.FILMATTA_STORYBOARD_QA_SHARE_URL;
const outputDir = process.env.FILMATTA_STORYBOARD_QA_OUTPUT ?? path.join(os.tmpdir(), "filmatta-storyboard-qa");
const manifestPath = path.join(os.tmpdir(), "filmatta-storyboard-foundation-fixture.json");
assert.ok(fs.existsSync(manifestPath), "Create the reversible Storyboard Test fixture first.");
const fixture = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.match(baseUrl, /^(http:\/\/127\.0\.0\.1:\d+|https:\/\/app-[a-z0-9]+-filmatta\.vercel\.app)$/u);
if (shareUrl) assert.equal(new URL(shareUrl).origin, new URL(baseUrl).origin, "Shareable Link belongs to another Preview.");
fs.mkdirSync(outputDir, { recursive: true });

const systemChrome = process.env.FILMATTA_STORYBOARD_QA_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
assert.ok(fs.existsSync(systemChrome), "A local Chromium browser is required for visual QA.");
const protectionBypass = process.env.FILMATTA_STORYBOARD_QA_BYPASS;
const browser = await chromium.launch({ headless: true, executablePath: systemChrome });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
  ...(protectionBypass
    ? {
        extraHTTPHeaders: {
          "x-vercel-protection-bypass": protectionBypass,
          "x-vercel-set-bypass-cookie": "true",
        },
      }
    : {}),
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

try {
  if (shareUrl) await page.goto(shareUrl, { waitUntil: "networkidle", timeout: 90_000 });
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent(fixture.linkedPath ?? `/shotlists/${fixture.linkedId}/storyboard`)}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("#email").fill(fixture.email);
  await page.locator("#password").fill(fixture.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.includes(`/shotlists/${fixture.linkedId}/storyboard`), { timeout: 90_000 }),
    page.getByRole("button", { name: "Iniciar sesión" }).click(),
  ]);
  await page.getByRole("heading", { name: "QA Storyboard · Vinculada" }).waitFor({ timeout: 90_000 });
  assert.equal(await page.locator("canvas").count(), 0, "The Visual Board must not mount editable canvases.");
  await page.screenshot({ path: path.join(outputDir, "board-1440.png"), fullPage: true });

  const firstCluster = page.locator("article").first();
  assert.equal(await firstCluster.getByText("1.1a", { exact: true }).count(), 1);
  assert.equal(await firstCluster.getByText("1.1b", { exact: true }).count(), 1);
  assert.equal(await firstCluster.getByText("1.1c", { exact: true }).count(), 1);
  await firstCluster.locator('input[type="checkbox"]').nth(1).check();
  await firstCluster.locator('input[type="checkbox"]').nth(0).check();
  await page.getByRole("button", { name: /Revisar selección \(2\)/u }).click();
  const review = page.getByRole("dialog", { name: "Revisión narrativa" });
  const reviewLabels = await review.locator("strong").allTextContents();
  assert.deepEqual(reviewLabels.slice(0, 2), ["1.1a", "1.1b"], "Multi-select review must use narrative order, not click order.");
  await page.screenshot({ path: path.join(outputDir, "review-order-1440.png"), fullPage: false });
  await review.getByRole("button", { name: "Cerrar" }).click();

  await Promise.all([
    page.waitForURL((url) => url.pathname.includes("/storyboard/shots/"), { timeout: 90_000 }),
    firstCluster.getByRole("link", { name: "Abrir" }).first().click(),
  ]);
  await page.locator(".storyboard-canvas-host").waitFor({ timeout: 90_000 });
  await page.screenshot({ path: path.join(outputDir, "sketcher-1440.png"), fullPage: true });
  const panelId = new URL(page.url()).searchParams.get("panel");
  assert.ok(panelId);
  const before = await panelDocument(page, fixture.linkedId, panelId);
  const host = await page.locator(".storyboard-canvas-host").boundingBox();
  assert.ok(host);
  await page.locator('button[title^="Pincel"]').click();
  await page.mouse.move(host.x + host.width * .35, host.y + host.height * .55);
  await page.mouse.down();
  await page.mouse.move(host.x + host.width * .65, host.y + host.height * .35, { steps: 12 });
  await page.mouse.up();
  await poll(async () => (await panelDocument(page, fixture.linkedId, panelId)).objects.length > before.objects.length, 20_000, "Draw/save/reload contract did not persist a new object.");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".storyboard-canvas-host").waitFor({ timeout: 60_000 });
  const afterReload = await panelDocument(page, fixture.linkedId, panelId);
  assert.ok(afterReload.objects.length > before.objects.length);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar PNG" }).click();
  const exported = await download;
  assert.match(exported.suggestedFilename(), /\.png$/u);
  await page.getByRole("button", { name: /Aprobar revisión/u }).click();
  await page.getByRole("button", { name: "✓ Aprobado" }).waitFor({ timeout: 20_000 });

  const secondPage = await context.newPage();
  await secondPage.goto(page.url(), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await secondPage.getByText("Otra pestaña está editando este panel.").waitFor({ timeout: 15_000 });
  await secondPage.screenshot({ path: path.join(outputDir, "two-tab-lease.png"), fullPage: false });
  await secondPage.close();

  const responsive = [];
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 834, height: 1112 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(200);
    responsive.push(await page.locator(".storyboard-canvas-host").evaluate((node) => ({
      viewport: window.innerWidth,
      media1050: window.matchMedia("(max-width: 1050px)").matches,
      hostWidth: node.getBoundingClientRect().width,
      hostScrollWidth: node.scrollWidth,
      canvasWidth: node.querySelector("canvas")?.width ?? 0,
      bodyScrollWidth: document.body.scrollWidth,
      parents: [node.parentElement, node.parentElement?.parentElement, node.parentElement?.parentElement?.parentElement].map((parent) => parent ? ({ className: String(parent.className), width: parent.getBoundingClientRect().width, maxWidth: getComputedStyle(parent).maxWidth, display: getComputedStyle(parent).display }) : null),
    })));
    await page.screenshot({ path: path.join(outputDir, `sketcher-${viewport.width}.png`), fullPage: false });
  }
  for (const metric of responsive) assert.ok(metric.hostWidth <= metric.viewport, `Canvas overflowed at ${metric.viewport}px.`);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/shotlists/${fixture.freeId}/storyboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByText("GRUPO MANUAL").first().waitFor({ timeout: 60_000 });
  await page.getByText("Panel sin contenido").first().waitFor();
  await page.screenshot({ path: path.join(outputDir, "board-free-1440.png"), fullPage: false });

  const stressStarted = performance.now();
  await page.goto(`${baseUrl}/shotlists/${fixture.stressId}/storyboard`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("heading", { name: "QA Storyboard · Estrés 3000" }).waitFor({ timeout: 120_000 });
  const stressMs = Math.round(performance.now() - stressStarted);
  const stress = {
    shotLinks: await page.locator("aside li").count(),
    renderedClusters: await page.locator("article").count(),
    canvases: await page.locator("canvas").count(),
    navigationMs: stressMs,
  };
  assert.equal(stress.shotLinks, 3000);
  assert.ok(stress.renderedClusters <= 120);
  assert.equal(stress.canvases, 0);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: path.join(outputDir, "board-stress-1920.png"), fullPage: false });

  assert.deepEqual(consoleErrors, [], `Browser errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, outputDir, responsive, stress, screenshots: fs.readdirSync(outputDir).sort() }));
} catch (error) {
  await page.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: false }).catch(() => undefined);
  throw error;
} finally {
  await browser.close();
}

async function panelDocument(page, shotlistId, panelId) {
  return page.evaluate(async ({ shotlistId, panelId }) => {
    const response = await fetch(`/api/shotlists/${shotlistId}/storyboard/panels/${panelId}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Panel read failed ${response.status}`);
    const value = await response.json();
    return value.panel.currentRevision.document;
  }, { shotlistId, panelId });
}

async function poll(check, timeoutMs, message) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(message);
}
