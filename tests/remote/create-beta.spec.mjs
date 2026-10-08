import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { testConfiguration } from "../integration/test-project.mjs";
import { previewAccess, previewBase, signedPreviewContext } from "./preview-access.mjs";

const TEST_REF = "ezlycwkuzkwcnhrhiruv";
const output = "test-results/create-beta-remote.json";

test("new Test account keeps one Create Project through login, Writer, Shotlist and direct links", async ({ browser }) => {
  assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF);
  assert.match(previewBase, /^https:\/\/app-[a-z0-9]+-filmatta\.vercel\.app$/);
  const config = testConfiguration();
  const service = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const prefix = `create-beta-${randomUUID()}`;
  const owner = { email: `${prefix}-owner@example.invalid`, password: `${randomBytes(22).toString("base64url")}aA1!`, id: null };
  const stranger = { email: `${prefix}-stranger@example.invalid`, password: `${randomBytes(22).toString("base64url")}aA1!`, id: null, client: null };
  const report = { preview: previewBase, backend: TEST_REF, checks: [], ids: {}, viewports: {}, moduleViewports: {} };
  const context = await browser.newContext({ baseURL: previewBase, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await previewAccess(context);
    await page.goto("/registro?next=%2Fcreate");
    await expect(page.getByRole("heading", { name: "Crea tu cuenta en FILMATTA" })).toBeVisible();
    report.checks.push("registration route and Create return path are visible; Test mail rate limit prevents signup submission");
    const ownerCreated = await service.auth.admin.createUser({ email: owner.email, password: owner.password, email_confirm: true });
    assert.equal(ownerCreated.error, null);
    owner.id = ownerCreated.data.user.id;
    report.ids.ownerId = owner.id;
    await page.goto("/login?next=%2Fcreate");
    await page.locator("#email").fill(owner.email);
    await page.locator("#password").fill(owner.password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/create(?:\?|$)/);
    report.checks.push("login UI returned to Create");
    await expect(page.getByRole("heading", { name: "Tu primera historia empieza aquí" })).toBeVisible();
    await page.screenshot({ path: "test-results/create-beta-empty-1280.png", fullPage: true });
    report.checks.push("empty account explains first Project and Writer");
    await page.getByLabel("Nombre del proyecto").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Crear proyecto y comenzar en Writer" })).toBeFocused();
    report.checks.push("first-run form has a keyboard path and labelled input");

    await page.getByLabel("Nombre del proyecto").fill("QA · Primera historia");
    await page.getByRole("button", { name: "Crear proyecto y comenzar en Writer" }).dblclick();
    await expect(page).toHaveURL(/\/writer\/[0-9a-f-]+\?project=[0-9a-f-]+$/);
    const writerUrl = new URL(page.url());
    const writerId = writerUrl.pathname.split("/").at(-1);
    const projectId = writerUrl.searchParams.get("project");
    assert.ok(writerId && projectId);
    Object.assign(report.ids, { writerId, projectId });
    report.checks.push("double click created one Project and opened its Writer");

    const ownerClient = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const ownerLogin = await ownerClient.auth.signInWithPassword({ email: owner.email, password: owner.password });
    assert.equal(ownerLogin.error, null);
    const initial = await ownerClient.from("writer_scripts").select("id,project_id,revision").eq("id", writerId).single();
    assert.equal(initial.error, null);
    assert.equal(initial.data.project_id, projectId);
    const projects = await ownerClient.from("projects").select("id").eq("owner_id", owner.id).eq("create_enabled", true);
    assert.equal(projects.error, null);
    assert.equal(projects.data.length, 1);

    const scene = (kind, text) => ({ type: "screenplayBlock", attrs: { id: randomUUID(), kind }, content: [{ type: "text", text }] });
    const document = { type: "doc", content: [
      scene("sceneHeading", "INT. TALLER — DÍA"), scene("action", "Una cámara se enciende."),
      scene("sceneHeading", "EXT. CALLE — TARDE"), scene("action", "El equipo cruza la calle."),
      scene("sceneHeading", "INT. ESTUDIO — NOCHE"), scene("action", "La última toma queda lista."),
    ] };
    const saved = await ownerClient.rpc("writer_save_script", { p_script_id: writerId, p_expected_revision: initial.data.revision, p_operation_id: randomUUID(), p_title: "QA · Primera historia", p_document: document, p_schema_version: 1 });
    assert.equal(saved.error, null);
    await page.reload();
    await expect(page.getByText("INT. TALLER — DÍA").first()).toBeVisible();
    const takeOver = page.getByRole("button", { name: "Editar aquí" });
    if (await takeOver.isVisible()) await takeOver.click();
    const editor = page.getByLabel("Editor de guion");
    await editor.locator('[data-screenplay-kind="action"]').last().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Se cierra el rodaje.");
    await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 15_000 });
    await page.reload();
    await expect(page.getByLabel("Editor de guion").getByText("Se cierra el rodaje.", { exact: false })).toBeVisible();
    report.checks.push("three real scenes and a UI edit persisted after Writer reload");
    const breakdown = await context.request.post(`/api/writer/scripts/${writerId}/breakdown`, {
      data: { action: "detect", scope: "document" },
    });
    assert.equal(breakdown.status(), 200);
    const breakdownResult = await breakdown.json();
    assert.ok(breakdownResult.breakdown);
    report.checks.push("basic local Breakdown ran on the saved Writer document");
    report.moduleViewports.writer = await viewportChecks(page);

    await page.goto(`/create/projects/${projectId}`);
    await expect(page.getByRole("heading", { name: "QA · Primera historia" })).toBeVisible();
    await page.getByRole("button", { name: /Nueva shotlist/ }).click();
    await expect(page).toHaveURL(/\/shotlists\/[0-9a-f-]+\?project=[0-9a-f-]+$/);
    const shotlistId = new URL(page.url()).pathname.split("/").at(-1);
    report.ids.shotlistId = shotlistId;
    report.checks.push("Shotlist created inside the same Project");

    await page.getByRole("button", { name: /Nueva escena/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nueva escena" });
    await dialog.getByLabel("Nombre").fill("QA · Escena de planos");
    await dialog.getByRole("button", { name: "Crear", exact: true }).click();
    await expect(page.getByText("QA · Escena de planos").first()).toBeVisible();
    await page.getByRole("button", { name: /Añadir plano después del último/ }).first().click();
    await expect.poll(async () => (await ownerClient.from("writer_shotlist_shots").select("id").eq("shotlist_id", shotlistId)).data?.length).toBe(1);
    await expect(page.locator(".shotlist-save")).toContainText("Guardado");
    await page.getByRole("button", { name: /Añadir plano después del último/ }).first().click();
    await expect.poll(async () => (await ownerClient.from("writer_shotlist_shots").select("id").eq("shotlist_id", shotlistId)).data?.length).toBe(2);
    const shots = await ownerClient.from("writer_shotlist_shots").select("id").eq("shotlist_id", shotlistId);
    assert.equal(shots.error, null);
    assert.equal(shots.data.length, 2);
    report.checks.push("two shots persisted through Shotlist UI");
    report.moduleViewports.shotlist = await viewportChecks(page);

    await page.goto(`/shotlists/${shotlistId}/storyboard?project=${projectId}`);
    await expect(page.getByRole("heading", { name: "Shotlist sin título" })).toBeVisible();
    await page.getByRole("button", { name: /Panel sin contenido/ }).first().click();
    await expect(page).toHaveURL(/\/storyboard\/shots\/[0-9a-f-]+\?panel=[0-9a-f-]+$/);
    await page.getByLabel("Nota visual").fill("QA · Encuadre de apertura");
    await expect(page.locator('[data-state="saved"]')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Nota visual")).toHaveValue("QA · Encuadre de apertura");
    report.checks.push("Storyboard panel and note persisted after reload");
    report.moduleViewports.storyboard = await viewportChecks(page);

    await page.goto(`/production?project=${projectId}`);
    await page.getByRole("button", { name: /GENERAR PRODUCCIÓN/ }).click();
    await page.getByRole("dialog").getByLabel("Guion").selectOption(writerId);
    await page.getByRole("dialog").getByRole("button", { name: "Crear estructura" }).click();
    await expect(page).toHaveURL(/\/production\/[0-9a-f-]+\?project=[0-9a-f-]+$/);
    const productionId = new URL(page.url()).pathname.split("/").at(-1);
    report.ids.productionId = productionId;
    report.checks.push("Production created with matching Project and Writer source");
    await page.getByRole("button", { name: /CREAR PRIMERA JORNADA/ }).click();
    await page.getByRole("button", { name: "Crear jornada", exact: true }).last().click();
    await expect.poll(async () => (await ownerClient.from("production_days").select("id").eq("production_id", productionId)).data?.length).toBe(1);
    await page.getByRole("button", { name: "＋ Añadir", exact: true }).first().click();
    await expect.poll(async () => (await ownerClient.from("production_schedule_items").select("id").eq("production_id", productionId)).data?.length).toBeGreaterThan(0);
    report.checks.push("one real Writer source was scheduled on a Production day");
    await page.getByRole("button", { name: /Production Pack →/ }).click();
    await page.getByRole("button", { name: /Generar Production Pack/ }).first().click();
    const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
    await page.getByRole("dialog", { name: "Generar Production Pack" }).getByRole("button", { name: "GENERAR PRODUCTION PACK" }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.pdf$/i);
    report.checks.push("Production Pack PDF exported from the Test production");
    report.moduleViewports.production = await viewportChecks(page);

    await page.goto("/create");
    await page.getByLabel("Nombre del proyecto").fill("QA · Segunda historia");
    await page.getByRole("button", { name: "Crear proyecto y comenzar en Writer" }).click();
    await expect(page).toHaveURL(/\/writer\/[0-9a-f-]+\?project=[0-9a-f-]+$/);
    const secondUrl = new URL(page.url());
    const secondProjectId = secondUrl.searchParams.get("project");
    const secondWriterId = secondUrl.pathname.split("/").at(-1);
    assert.notEqual(secondProjectId, projectId);
    Object.assign(report.ids, { secondProjectId, secondWriterId });
    const secondShots = await ownerClient.from("writer_shotlists").select("id").eq("project_id", secondProjectId);
    const secondProductions = await ownerClient.from("production_plans").select("id").eq("project_id", secondProjectId);
    assert.equal(secondShots.error, null);
    assert.equal(secondProductions.error, null);
    assert.equal(secondShots.data.length, 0);
    assert.equal(secondProductions.data.length, 0);
    await page.goto(`/create/projects/${secondProjectId}`);
    await expect(page.getByText("Todavía no hay Shotlists.")).toBeVisible();
    const mismatchedShotlist = await context.request.get(`/shotlists/${shotlistId}?project=${secondProjectId}`);
    const mismatchedProduction = await context.request.get(`/production/${productionId}?project=${secondProjectId}`);
    assert.equal(mismatchedShotlist.status(), 404);
    assert.equal(mismatchedProduction.status(), 404);
    report.checks.push("second Project has no Shotlist or Production from the first");

    const strangerCreated = await service.auth.admin.createUser({ email: stranger.email, password: stranger.password, email_confirm: true });
    assert.equal(strangerCreated.error, null);
    stranger.id = strangerCreated.data.user.id;
    report.ids.strangerId = stranger.id;
    stranger.client = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.equal((await stranger.client.auth.signInWithPassword({ email: stranger.email, password: stranger.password })).error, null);
    const strangerContext = await signedPreviewContext(browser, stranger);
    try {
      const denied = await strangerContext.request.get(`/create/projects/${projectId}`);
      const deniedWriter = await strangerContext.request.get(`/writer/${writerId}?project=${projectId}`);
      const deniedProduction = await strangerContext.request.get(`/production/${productionId}?project=${projectId}`);
      const deniedPack = await strangerContext.request.get(`/production/${productionId}/documents/pack`);
      const deniedShotlistPdf = await strangerContext.request.post(`/api/shotlists/${shotlistId}/pdf`, { data: { columns: ["shotType"] } });
      report.deniedStatuses = { project: denied.status(), writer: deniedWriter.status(), production: deniedProduction.status(), pack: deniedPack.status(), shotlistPdf: deniedShotlistPdf.status() };
      for (const response of [denied, deniedWriter, deniedProduction, deniedPack, deniedShotlistPdf]) {
        assert.equal((await response.text()).includes("QA · Primera historia"), false, "Foreign creative data leaked");
      }
      for (const key of ["project", "writer", "production", "pack", "shotlistPdf"]) assert.equal(report.deniedStatuses[key], 404, `${key} must return 404`);
      const foreignPanels = await stranger.client.from("storyboard_panels").select("id").eq("shotlist_id", shotlistId);
      const foreignExports = await stranger.client.from("production_document_exports").select("id").eq("production_id", productionId);
      assert.equal(foreignPanels.error, null);
      assert.equal(foreignExports.error, null);
      assert.equal(foreignPanels.data.length, 0);
      assert.equal(foreignExports.data.length, 0);
      report.checks.push("second user receives no foreign Project content; HTTP statuses recorded separately");
    } finally { await strangerContext.close(); }

    await page.goto(`/create/projects/${projectId}`);
    for (const width of [1536, 1280, 1024, 834, 390]) {
      await page.setViewportSize({ width, height: 900 });
      report.viewports[width] = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      assert.equal(report.viewports[width], true, `Project page overflow at ${width}`);
      if (width === 390) await page.screenshot({ path: "test-results/create-beta-project-390.png", fullPage: true });
    }
    report.checks.push("Project route remains usable at five requested viewport widths");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/cuenta");
    await page.locator(".nav-account-slot").getByRole("button", { name: "Cuenta" }).click();
    await page.getByRole("button", { name: "Cerrar sesión" }).first().click();
    await expect(page).toHaveURL(previewBase + "/");
    await page.goto(`/create/projects/${projectId}`);
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.locator("#email").fill(owner.email);
    await page.locator("#password").fill(owner.password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(new RegExp(`/create/projects/${projectId}$`));
    await expect(page.getByRole("heading", { name: "QA · Primera historia" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "QA · Primera historia" })).toBeVisible();
    report.checks.push("logout, login, direct Project link and reload restore the same context");
  } finally {
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    await context.close();
    for (const user of [owner, stranger]) {
      if (!user.id || !user.email.startsWith(prefix)) continue;
      const removed = await service.auth.admin.deleteUser(user.id);
      assert.equal(removed.error, null, "Test account cleanup failed");
    }
  }
});

async function viewportChecks(page) {
  const results = {};
  for (const width of [1536, 1280, 1024, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    results[width] = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  return results;
}

