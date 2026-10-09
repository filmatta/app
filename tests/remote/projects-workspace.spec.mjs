import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { testConfiguration } from "../integration/test-project.mjs";
import { previewAccess, previewBase, signedPreviewContext } from "./preview-access.mjs";

const TEST_REF = "ezlycwkuzkwcnhrhiruv";

test("Project to Production Documents exposes a private Production Pack through visible controls", async ({ browser }) => {
  assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF);
  assert.match(previewBase, /^https:\/\/app-[a-z0-9]+-filmatta\.vercel\.app$/);
  const config = testConfiguration();
  const service = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const prefix = `workspace-${randomUUID()}`;
  const owner = { email: `${prefix}-owner@example.invalid`, password: `${randomBytes(22).toString("base64url")}aA1!`, id: null, client: null };
  const stranger = { email: `${prefix}-stranger@example.invalid`, password: `${randomBytes(22).toString("base64url")}aA1!`, id: null, client: null };
  const projectAName = `QA Project A ${suffix}`;
  const projectBName = `QA Project B ${suffix}`;
  const productionName = `QA Production A ${suffix}`;
  const scriptATitle = `QA GUION A ${suffix}`;
  const scriptBTitle = `QA GUION B ${suffix}`;
  const shotlistATitle = `QA SHOTLIST A ${suffix}`;
  const report = { preview: previewBase, backend: TEST_REF, checks: [], ids: {} };
  const context = await browser.newContext({ baseURL: previewBase, viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  try {
    await previewAccess(context);
    const createdOwner = await service.auth.admin.createUser({ email: owner.email, password: owner.password, email_confirm: true });
    assert.equal(createdOwner.error, null);
    owner.id = createdOwner.data.user.id;
    owner.client = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.equal((await owner.client.auth.signInWithPassword({ email: owner.email, password: owner.password })).error, null);

    await page.goto("/login?next=%2Fcreate");
    await page.locator("#email").fill(owner.email);
    await page.locator("#password").fill(owner.password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/create(?:\?|$)/);

    const projectAId = await createProjectFromDashboard(page, projectAName);
    report.ids.projectAId = projectAId;
    await page.getByRole("button", { name: "Crear guion" }).click();
    await expect(page).toHaveURL(new RegExp(`/writer/[0-9a-f-]+\\?project=${projectAId}$`));
    const writerAId = new URL(page.url()).pathname.split("/").at(-1);
    report.ids.writerAId = writerAId;
    await saveScript(owner.client, writerAId, scriptATitle, `INT. SET A ${suffix} - DIA`);

    await page.goto(`/create/projects/${projectAId}`);
    await page.getByRole("navigation", { name: "Secciones del proyecto" }).getByRole("link", { name: "Producción" }).click();
    await page.getByRole("button", { name: /GENERAR PRODUCCIÓN/ }).click();
    const missingSourceDialog = page.getByRole("dialog");
    await missingSourceDialog.getByLabel("Guion").selectOption(writerAId);
    await expect(missingSourceDialog.getByText("Falta una Shotlist vinculada al guion.")).toBeVisible();
    await expect(missingSourceDialog.getByRole("button", { name: "Crear estructura" })).toBeDisabled();
    assert.equal((await owner.client.from("production_plans").select("id").eq("project_id", projectAId)).data?.length, 0);
    report.checks.push("New Project Production stays blocked until a compatible Shotlist exists");

    await page.goto(`/create/projects/${projectAId}`);
    await page.getByRole("button", { name: "Crear Shotlist desde guion" }).click();
    await expect(page).toHaveURL(new RegExp(`/shotlists/[0-9a-f-]+\\?project=${projectAId}$`));
    const shotlistAId = new URL(page.url()).pathname.split("/").at(-1);
    report.ids.shotlistAId = shotlistAId;
    await page.getByLabel("Nombre de la shotlist").fill(shotlistATitle);
    await page.getByLabel("Nombre de la shotlist").press("Tab");
    await expect.poll(async () => (await owner.client.from("writer_shotlists").select("title").eq("id", shotlistAId).single()).data?.title).toBe(shotlistATitle);
    await page.getByRole("button", { name: /Nueva escena/ }).first().click();
    const sceneDialog = page.getByRole("dialog", { name: "Nueva escena" });
    await sceneDialog.getByLabel("Nombre").fill(`ESCENA A ${suffix}`);
    await sceneDialog.getByRole("button", { name: "Crear", exact: true }).click();
    await page.getByRole("button", { name: /Añadir plano después del último/ }).first().click();
    await expect.poll(async () => (await owner.client.from("writer_shotlist_shots").select("id").eq("shotlist_id", shotlistAId)).data?.length).toBe(1);

    const projectBId = await createProjectFromDashboard(page, projectBName);
    report.ids.projectBId = projectBId;
    await page.getByRole("button", { name: "Crear guion" }).click();
    const writerBId = new URL(page.url()).pathname.split("/").at(-1);
    await saveScript(owner.client, writerBId, scriptBTitle, `INT. SET B ${suffix} - NOCHE`);
    report.checks.push("Project B has a separate real Writer source before A's Pack is generated");

    await page.goto(`/create/projects/${projectAId}`);
    await page.getByRole("navigation", { name: "Secciones del proyecto" }).getByRole("link", { name: "Producción" }).click();
    await expect(page).toHaveURL(new RegExp(`/production\\?project=${projectAId}$`));
    await page.getByRole("button", { name: /GENERAR PRODUCCIÓN/ }).click();
    const productionDialog = page.getByRole("dialog");
    await productionDialog.getByLabel("Nombre de la producción").fill(productionName);
    await productionDialog.getByLabel("Guion").selectOption(writerAId);
    await productionDialog.getByLabel("Shotlist").selectOption(shotlistAId);
    await productionDialog.getByRole("button", { name: "Crear estructura" }).click();
    await expect(page).toHaveURL(new RegExp(`/production/[0-9a-f-]+\\?project=${projectAId}$`));
    const productionId = new URL(page.url()).pathname.split("/").at(-1);
    report.ids.productionId = productionId;
    const linked = await owner.client.from("production_plans").select("project_id,script_id,shotlist_id").eq("id", productionId).single();
    assert.equal(linked.error, null);
    assert.deepEqual(linked.data, { project_id: projectAId, script_id: writerAId, shotlist_id: shotlistAId });
    await page.getByRole("button", { name: /CREAR PRIMERA JORNADA/ }).click();
    await page.getByRole("button", { name: "Crear jornada", exact: true }).last().click();
    await expect.poll(async () => (await owner.client.from("production_days").select("id").eq("production_id", productionId)).data?.length).toBe(1);

    // Reproduce the human blocker from the dashboard, using only visible navigation.
    await page.goto("/create");
    await page.getByRole("link", { name: `Abrir ${projectAName}` }).click();
    await page.getByRole("navigation", { name: "Secciones del proyecto" }).getByRole("link", { name: "Producción" }).click();
    await expect(page).toHaveURL(new RegExp(`/production\\?project=${projectAId}$`));
    const productionRow = page.locator(".production-index-list li").filter({ hasText: productionName });
    await expect(productionRow).toContainText("Abrir");
    await productionRow.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/production/${productionId}\\?project=${projectAId}$`));
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Documentos", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Documentos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Document Center" })).toBeVisible();
    await expect(page.getByText("Production Pack", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /Generar Production Pack/ }).first().click();
    const packDialog = page.getByRole("dialog", { name: "Generar Production Pack" });
    await packDialog.getByRole("checkbox", { name: "Shotlist" }).check();
    await packDialog.getByRole("checkbox", { name: "Guión" }).check();
    const downloadEvent = page.waitForEvent("download", { timeout: 90_000 });
    await packDialog.getByRole("button", { name: "GENERAR PRODUCTION PACK" }).click();
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(), /PRODUCTION-PACK.*\.pdf$/i);
    const pdf = fs.readFileSync(await download.path());
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 1000);
    assert.match(pdf.subarray(-80).toString("latin1"), /%%EOF/u);
    const decoded = extractPdfCandidateText(pdf);
    for (const expected of [productionName, scriptATitle, shotlistATitle]) {
      assert.ok(decoded.includes(expected), `Pack PDF omitted ${expected}`);
    }
    assert.equal(decoded.includes(scriptBTitle), false, "Project B source leaked into Project A Pack");
    report.checks.push("Dashboard → Project → Producción → Abrir → mobile Documentos → Pack → PDF download passed with A sources and no B source");

    await page.goto("/create");
    await page.getByRole("link", { name: `Abrir ${projectAName}` }).click();
    await page.getByRole("navigation", { name: "Secciones del proyecto" }).getByRole("link", { name: "Documentos" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Documentos" })).toBeVisible();
    await expect(page.getByText("Production Pack", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Preparar Pack" })).toBeVisible();
    report.checks.push("Project-level Documentos exposes the same Pack generator and recorded version");

    const createdStranger = await service.auth.admin.createUser({ email: stranger.email, password: stranger.password, email_confirm: true });
    assert.equal(createdStranger.error, null);
    stranger.id = createdStranger.data.user.id;
    stranger.client = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.equal((await stranger.client.auth.signInWithPassword({ email: stranger.email, password: stranger.password })).error, null);
    const strangerContext = await signedPreviewContext(browser, stranger);
    try {
      for (const url of [`/create/projects/${projectAId}/documents`, `/production/${productionId}`, `/production/${productionId}/documents/pack`]) {
        const denied = await strangerContext.request.get(url);
        assert.equal(denied.status(), 404, `${url} must be private`);
        assert.equal((await denied.text()).includes(scriptATitle), false);
      }
      const exports = await stranger.client.from("production_document_exports").select("id").eq("production_id", productionId);
      assert.equal(exports.error, null);
      assert.equal(exports.data.length, 0);
      report.checks.push("Second user receives 404 and cannot read Pack export metadata");
    } finally { await strangerContext.close(); }
  } finally {
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync("test-results/projects-workspace-remote.json", JSON.stringify(report, null, 2));
    await context.close();
    for (const user of [owner, stranger]) {
      if (!user.id || !user.email.startsWith(prefix)) continue;
      const removed = await service.auth.admin.deleteUser(user.id);
      assert.equal(removed.error, null, "Test account cleanup failed");
    }
  }
});

async function createProjectFromDashboard(page, name) {
  await page.goto("/create");
  await page.getByRole("button", { name: "Crear proyecto", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Guion/u }).click();
  await dialog.getByLabel("Nombre del proyecto").fill(name);
  await dialog.getByRole("button", { name: "Crear proyecto", exact: true }).click();
  await page.getByRole("link", { name: `Abrir ${name}` }).click();
  await expect(page).toHaveURL(/\/create\/projects\/[0-9a-f-]+$/u);
  return new URL(page.url()).pathname.split("/").at(-1);
}

async function saveScript(client, id, title, heading) {
  const current = await client.from("writer_scripts").select("revision").eq("id", id).single();
  assert.equal(current.error, null);
  const block = (kind, text) => ({ type: "screenplayBlock", attrs: { id: randomUUID(), kind }, content: [{ type: "text", text }] });
  const document = { type: "doc", content: [block("sceneHeading", heading), block("action", `Contenido de ${title}.`)] };
  const saved = await client.rpc("writer_save_script", { p_script_id: id, p_expected_revision: current.data.revision, p_operation_id: randomUUID(), p_title: title, p_document: document, p_schema_version: 1 });
  assert.equal(saved.error, null);
}

// PDFKit embeds text as CID hex strings with ToUnicode maps. Decode candidates
// from the generated PDF without adding a runtime dependency or a host PDF CLI.
function extractPdfCandidateText(pdf) {
  const raw = pdf.toString("latin1");
  const streams = [];
  for (const match of raw.matchAll(/stream\r?\n/gu)) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const bytes = pdf.subarray(start, end);
    for (const trim of [0, 1, 2]) {
      try { streams.push(inflateSync(bytes.subarray(0, bytes.length - trim)).toString("latin1")); break; }
      catch { /* Uncompressed or non-text stream. */ }
    }
  }
  const maps = streams.filter((stream) => stream.includes("beginbfchar")).map((stream) => {
    const map = new Map();
    for (const pair of stream.matchAll(/<([0-9a-f]{4})>\s*<([0-9a-f]{4,})>/giu)) {
      const bytes = Buffer.from(pair[2], "hex");
      let character = "";
      for (let index = 0; index + 1 < bytes.length; index += 2) character += String.fromCharCode(bytes.readUInt16BE(index));
      map.set(pair[1].toLowerCase(), character);
    }
    return map;
  });
  assert.ok(maps.length > 0, "Generated PDF has no ToUnicode map for text validation");
  const chunks = streams.filter((stream) => stream.includes("BT")).flatMap((stream) =>
    [...stream.matchAll(/\[(.*?)\]\s*TJ/gsu)].flatMap((operator) => [...operator[1].matchAll(/<([0-9a-f]{4,})>/giu)].map((item) => item[1].toLowerCase())));
  return maps.flatMap((map) => chunks.map((hex) => {
    let text = "";
    for (let index = 0; index + 3 < hex.length; index += 4) text += map.get(hex.slice(index, index + 4)) ?? "";
    return text;
  })).join("\n");
}
