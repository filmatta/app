import { expect, test, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import { createHash } from "node:crypto";

const scriptId = "11111111-1111-4111-8111-111111111111";
const evidence = "output/writer-polish-timeline-v1/legacy-regression";

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{
    name: "sb-127-auth-token",
    value: "base64-" + b64({
      access_token: token,
      refresh_token: "local-refresh",
      expires_at: 4102444800,
      token_type: "bearer",
      user: { id: scriptId },
    }),
    domain: "127.0.0.1",
    path: "/",
  }]);
}

test.beforeEach(async ({ request, context }) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
});

test("context actions, assisted insertion, live metrics and reload use the canonical document", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/writer/${scriptId}`);
  const editor = page.getByLabel("Editor de guion");
  await expect(editor).toBeVisible();

  const action = editor.locator('[data-block-id$="02"]');
  await action.click();
  await action.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Acciones del bloque" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: /Acción — actual/ })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitemradio", { name: /Transición/ }).click();
  await expect(action).toHaveAttribute("data-screenplay-kind", "transition");
  await page.waitForTimeout(600); // Keep the two explicit conversions as separate history events.

  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: /Transición — actual/ })).toHaveAttribute("aria-checked", "true");
  await expect(menu.locator("button:not(:disabled)").first()).toBeFocused();
  await menu.press("2");
  await expect(action).toHaveAttribute("data-screenplay-kind", "action");
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(action).toHaveAttribute("data-screenplay-kind", "transition");

  await action.click({ button: "right" });
  await menu.getByRole("menuitem", { name: /Nueva escena/ }).click();
  await page.getByRole("button", { name: /Nueva escena/ }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva escena" });
  await dialog.getByLabel("Lugar").fill("Cocina");
  await dialog.getByLabel("Momento").selectOption("NOCHE");
  await expect(dialog.getByText("INT. COCINA - NOCHE")).toBeVisible();
  await dialog.getByRole("button", { name: "Insertar encabezado" }).click();
  await expect(editor.locator('[data-screenplay-kind="sceneHeading"]')).toHaveCount(3);
  await expect(editor.getByText("INT. COCINA - NOCHE")).toBeVisible();

  const ana = page.getByRole("button", { name: /ANA 1 evidencia/ });
  await ana.click();
  await expect(page.getByRole("heading", { name: "Observaciones" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personajes reconocidos" })).toBeVisible();
  await page.locator(".writer-observations-panel").getByRole("button", { name: "Cerrar", exact: true }).click();

  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel("Editor de guion").getByText("INT. COCINA - NOCHE")).toBeVisible();
});

test("structural scene actions reorder, synchronize, navigate back and duplicate with real undo", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  const editor = page.getByLabel("Editor de guion");
  await expect(editor).toBeVisible();

  await editor.locator('[data-block-id$="02"]').click();
  await page.getByRole("button", { name: "Acciones de escena 1" }).click();
  await page.getByRole("menuitem", { name: "Mover abajo" }).click();
  await expect.poll(async () => editor.locator('[data-screenplay-kind="sceneHeading"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-block-id")))).toEqual([
    "11111111-1111-4111-8111-111111111108",
    "11111111-1111-4111-8111-111111111101",
  ]);
  await expect(page.getByText("Escena movida", { exact: true })).toBeVisible();
  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 10_000 });
  const saved = await (await request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(saved.saves).toBe(1);
  expect(saved.document.content.filter((block: { attrs: { kind: string } }) => block.attrs.kind === "sceneHeading").map((block: { attrs: { id: string } }) => block.attrs.id)).toEqual([
    "11111111-1111-4111-8111-111111111108",
    "11111111-1111-4111-8111-111111111101",
  ]);
  const timelineScenes = page.locator(".writer-timeline-panel [data-timeline-scene-id]");
  await expect(timelineScenes.first()).toHaveAttribute("data-timeline-scene-id", "11111111-1111-4111-8111-111111111108", { timeout: 10_000 });

  await page.locator(".writer-structural-toast").getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => editor.locator('[data-screenplay-kind="sceneHeading"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-block-id")))).toEqual([
    "11111111-1111-4111-8111-111111111101",
    "11111111-1111-4111-8111-111111111108",
  ]);
  await page.getByRole("button", { name: "Rehacer" }).click();
  await expect(editor.locator('[data-screenplay-kind="sceneHeading"]').first()).toHaveAttribute("data-block-id", "11111111-1111-4111-8111-111111111108");

  await page.getByRole("button", { name: "Acciones de escena 1" }).click();
  await page.getByRole("menuitem", { name: "Duplicar escena" }).click();
  await expect(editor.locator('[data-screenplay-kind="sceneHeading"]')).toHaveCount(3);
  const ids = await editor.locator("[data-block-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-block-id")));
  expect(new Set(ids).size).toBe(ids.length);
  await page.locator(".writer-structural-toast").getByRole("button", { name: "Deshacer" }).click();
  await expect(editor.locator('[data-screenplay-kind="sceneHeading"]')).toHaveCount(2);
  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 10_000 });
  await page.reload();
  await expect(editor.locator('[data-screenplay-kind="sceneHeading"]')).toHaveCount(2);
  await expect(editor.locator('[data-screenplay-kind="sceneHeading"]').first()).toHaveAttribute("data-block-id", "11111111-1111-4111-8111-111111111108");

  await editor.locator('[data-block-id$="09"]').click();
  await page.locator(".writer-scene-link").filter({ hasText: "INT. ESTUDIO - DÍA" }).last().click();
  await expect(page.getByRole("button", { name: "← Volver" })).toBeVisible();
  await page.getByRole("button", { name: "← Volver" }).click();
  await expect(page.locator(".writer-scene-list > li").first()).toHaveClass(/is-active/);

  const characterFilter = page.locator(".writer-timeline-panel .timeline-filter-characters").getByRole("button", { name: "ANA", exact: true });
  await characterFilter.click();
  await expect(page.locator(".writer-timeline-panel").getByText("Quita los filtros para reordenar escenas.")).toBeVisible();
  await expect(page.locator(".writer-timeline-panel .timeline-scene-drag-handle").first()).toBeDisabled();
});

test("desktop drag handles reorder from Sidebar and Timeline without hover mutations", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  const editor = page.getByLabel("Editor de guion");
  const headings = editor.locator('[data-screenplay-kind="sceneHeading"]');
  const sidebarLinks = page.locator(".writer-scene-link");

  await page.locator(".writer-scene-drag-handle").nth(1).dragTo(sidebarLinks.first(), { targetPosition: { x: 80, y: 2 } });
  await expect(headings.first()).toHaveAttribute("data-block-id", "11111111-1111-4111-8111-111111111108");
  await page.locator(".writer-structural-toast").getByRole("button", { name: "Deshacer" }).click();
  await expect(headings.first()).toHaveAttribute("data-block-id", "11111111-1111-4111-8111-111111111101");
  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 10_000 });

  const timeline = page.locator(".writer-timeline-panel");
  const timelineHandles = timeline.locator(".timeline-scene-drag-handle");
  const timelineTargets = timeline.locator(".timeline-scene-activate");
  const targetBox = await timelineTargets.nth(1).boundingBox();
  expect(targetBox).not.toBeNull();
  await timelineHandles.first().dragTo(timelineTargets.nth(1), { targetPosition: { x: Math.max(4, targetBox!.width - 4), y: 30 } });
  await expect(headings.first()).toHaveAttribute("data-block-id", "11111111-1111-4111-8111-111111111108");
});

test("explicit navigation and Back stay UI-only and synchronize the active scene", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  const editor = page.getByLabel("Editor de guion");
  await editor.locator('[data-block-id$="02"]').click();
  await page.locator(".writer-scene-link").nth(1).click();
  await expect(page.locator(".writer-scene-list > li").nth(1)).toHaveClass(/is-active/);
  await expect(page.locator(".writer-timeline-panel [data-timeline-scene-id$='08']")).toHaveClass(/is-selected/);
  await page.getByRole("button", { name: "← Volver" }).click();
  await expect(page.locator(".writer-scene-list > li").first()).toHaveClass(/is-active/);
  await expect(page.locator(".writer-timeline-panel [data-timeline-scene-id$='01']")).toHaveClass(/is-selected/);
  await page.waitForTimeout(1_800);
  const state = await (await request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(state.saves).toBe(0);
});

test("identity-safe character rename and local scene nicknames survive reload without entering exports", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  const editor = page.getByLabel("Editor de guion");

  await page.getByRole("button", { name: "Renombrar ANA", exact: true }).click();
  const rename = page.locator(".writer-character-rename-input");
  await rename.fill("ANA MARÍA");
  await rename.press("Enter");
  await expect(page.getByText("Ya existe un personaje llamado ANA MARÍA.")).toBeVisible();
  await rename.fill("ÁNGELA-2");
  await rename.press("Enter");
  await expect(editor.locator('[data-block-id$="03"]')).toContainText("ÁNGELA-2");
  await expect(editor.locator('[data-block-id$="02"]')).toContainText("ÁNGELA-2 observa la VENTANA.");
  await expect(editor.locator('[data-block-id$="04"]')).toContainText("Hola, ANA MARÍA.");
  await expect(page.locator(".writer-character-section").getByRole("button", { name: /ÁNGELA-2 \d evidencia/ })).toBeVisible();
  await expect(page.getByText("Personaje renombrado", { exact: true })).toBeVisible();
  await page.locator(".writer-structural-toast").getByRole("button", { name: "Deshacer" }).click();
  await expect(editor.locator('[data-block-id$="03"]')).toContainText("ANA");
  await page.getByRole("button", { name: "Rehacer" }).click();
  await expect(editor.locator('[data-block-id$="03"]')).toContainText("ÁNGELA-2");

  await page.getByRole("button", { name: "Renombrar escena 1" }).click();
  const nickname = page.getByLabel("Nombre interno de la escena 1");
  await nickname.fill("LA LLAMADA");
  await nickname.press("Enter");
  await expect(page.locator(".writer-sidebar").getByText("LA LLAMADA", { exact: true })).toBeVisible();
  await expect(page.locator(".writer-timeline-panel").getByText("LA LLAMADA", { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar" }).click();
  await page.getByRole("button", { name: "Respaldo JSON" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let backup = "";
  for await (const chunk of stream) backup += chunk.toString();
  expect(backup).not.toContain("LA LLAMADA");
  expect(JSON.parse(backup).document.content.every((block: { attrs: Record<string, unknown> }) => !("sceneNickname" in block.attrs))).toBe(true);

  await page.reload();
  await expect(page.locator(".writer-sidebar").getByText("LA LLAMADA", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Editor de guion").locator('[data-block-id$="03"]')).toContainText("ÁNGELA-2");
});

test("a late save acknowledgement cannot discard edits made while integration panels open", async ({ page, request }) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=writer-ux&writerSaveDelay=2400");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  const editor = page.getByLabel("Editor de guion");
  const action = editor.locator('[data-block-id$="02"]');

  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" PANEL_ACK_A");
  await expect(page.locator(".writer-save-status")).toContainText("Guardando", { timeout: 10_000 });

  await action.click({ button: "right" });
  await expect(page.getByRole("menu", { name: "Acciones del bloque" })).toBeVisible();
  await page.getByRole("button", { name: "Exportar" }).click();
  await expect(page.getByRole("menu", { name: "Acciones del bloque" })).toBeHidden();
  await page.getByRole("button", { name: "PDF de guion" }).click();
  await expect(page.getByRole("dialog", { name: "Generar PDF de guion" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar exportación PDF" }).click();
  await expect(page.getByRole("button", { name: "Exportar" })).toBeFocused();

  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" PANEL_ACK_B");
  await page.getByRole("button", { name: "Insertar en el guion" }).click();
  const insertPanel = page.getByRole("dialog", { name: "Insertar en el guion" });
  await expect(insertPanel).toBeVisible();
  await insertPanel.getByRole("button", { name: "Cerrar" }).click();

  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 15_000 });
  const state = await (await request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(state.revision).toBe(3);
  expect(JSON.stringify(state.document)).toContain("PANEL_ACK_A PANEL_ACK_B");
  await page.reload();
  await expect(page.getByLabel("Editor de guion")).toContainText("PANEL_ACK_A PANEL_ACK_B");
});

test("writing presentation uses a stable mobile shell without toolbar overflow", async ({ page }) => {
  fs.mkdirSync(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  for (const width of [1440, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel("Editor de guion")).toBeVisible();
    await expect(page.getByRole("button", { name: "Insertar en el guion" })).toBeVisible();
    if (width > 600) {
      await expect(page.getByRole("button", { name: "Deshacer" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Rehacer" })).toBeVisible();
    }
    if (width <= 600) {
      await expect(page.getByRole("navigation", { name: "Navegación de Writer" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Volver a Mis guiones" })).toBeVisible();
      await expect(page.getByRole("link", { name: "FILMATTA Writer" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Más acciones de Writer" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Navegar/ })).toBeVisible();
      const toolbar = page.getByRole("toolbar", { name: "Formato del guion" });
      expect(await toolbar.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      expect(await page.locator(".writer-workspace").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await expect(page.getByRole("button", { name: "Formato de texto" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Acciones Writer en el cursor" })).toBeVisible();

      if (width === 430) {
        const notice = page.getByRole("dialog", { name: "Writer en móvil" });
        await expect(notice).toBeVisible();
        await notice.getByRole("button", { name: "Entendido" }).click();
      } else {
        await expect(page.getByRole("dialog", { name: "Writer en móvil" })).toHaveCount(0);
      }

      await page.getByRole("button", { name: /Navegar/ }).click();
      const navigation = page.getByRole("dialog", { name: "Navegar por el guion" });
      await expect(navigation).toBeVisible();
      await navigation.getByRole("button", { name: "Personajes" }).click();
      await expect(page.getByText("Personajes", { exact: true }).first()).toBeVisible();
      await page.locator(".writer-sidebar").getByRole("button", { name: "Cerrar" }).click();
      await expect(page.locator(".writer-sidebar")).not.toHaveClass(/writer-sidebar--open/);

      await page.getByRole("button", { name: "Más acciones de Writer" }).click();
      const more = page.getByRole("dialog", { name: "Más acciones de Writer" });
      await expect(more.getByRole("button", { name: "Importar borrador" })).toBeVisible();
      await expect(more.getByRole("button", { name: "Exportar PDF" })).toBeVisible();
      await expect(more.getByRole("button", { name: "Focus" })).toBeVisible();
      await more.getByRole("button", { name: "Cerrar" }).click();

      const editor = page.getByLabel("Editor de guion");
      await editor.locator('[data-block-id$="02"]').click();
      await page.getByRole("button", { name: "Acciones Writer en el cursor" }).click();
      const writerActions = page.getByRole("menu", { name: "Acciones del bloque" });
      await expect(writerActions).toBeVisible();
      await expect(writerActions.getByRole("menuitem", { name: /Cortar|Copiar|Pegar/ })).toHaveCount(0);
      await writerActions.getByRole("button", { name: "Cerrar" }).click();

      const appBarBefore = await page.getByRole("navigation", { name: "Navegación de Writer" }).boundingBox();
      await page.locator(".writer-paper").evaluate((element) => { element.scrollTop = 500; });
      const appBarAfter = await page.getByRole("navigation", { name: "Navegación de Writer" }).boundingBox();
      expect(appBarAfter?.y).toBe(appBarBefore?.y);
    }
    await page.screenshot({ path: `${evidence}/writer-${width}.png`, fullPage: true });
  }
});

test("touch pointer keeps native context behavior while dedicated Writer actions use the active caret", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem(`filmatta.writer.mobile-notice.v1:${"11111111-1111-4111-8111-111111111111"}`, "dismissed"));
  await page.goto(`/writer/${scriptId}`);
  const block = page.getByLabel("Editor de guion").locator('[data-block-id$="02"]');
  await block.click();
  await block.dispatchEvent("pointerdown", { pointerType: "touch", button: 0 });
  await block.dispatchEvent("contextmenu", { button: 0 });
  await expect(page.getByRole("menu", { name: "Acciones del bloque" })).toHaveCount(0);
  await page.getByRole("button", { name: "Acciones Writer en el cursor" }).click();
  const menu = page.getByRole("menu", { name: "Acciones del bloque" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: /Acción — actual/ })).toHaveAttribute("aria-checked", "true");
});

test("assisted import shows immediate indeterminate progress, blocks duplicates, and preserves source on error", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/writer/imports/assisted", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, reason: null, operationId: "qa-loader" }) });
    }
    posts += 1;
    await new Promise((resolve) => setTimeout(resolve, 2_400));
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "request_failed", error: "Fallo sintético de QA." }) });
  });
  await page.goto(`/writer/${scriptId}`);
  await page.locator(".writer-header").getByRole("button", { name: "Importar borrador" }).click();
  const dialog = page.getByRole("dialog", { name: "Importar borrador" });
  const source = "INT. ESTUDIO - DÍA\n\nANA\nEsto es una prueba local.";
  await dialog.getByLabel("Texto del borrador").fill(source);
  const submit = dialog.getByRole("button", { name: "Importar y organizar" });
  await submit.click();
  await expect(dialog.getByRole("status")).toContainText("Organizando estructura e identidades");
  await expect(dialog.locator(".writer-import-spinner")).toBeVisible();
  await expect(dialog.getByText("0:00", { exact: true })).toBeVisible();
  const processingSubmit = dialog.getByRole("button", { name: "Organizando…" });
  await expect(processingSubmit).toBeDisabled();
  await processingSubmit.click({ force: true });
  await expect(dialog.getByText("0:01", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("Fallo sintético de QA");
  await expect(dialog.getByLabel("Texto del borrador")).toHaveValue(source);
  await expect(submit).toBeEnabled();
  expect(posts).toBe(1);
  await expect(dialog.getByText(/%/)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Detener|Cancelar procesamiento/ })).toHaveCount(0);
});

test("observations aggregate format review in one detail and desktop workspace spans Timeline below both columns", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: () => Promise.reject(new DOMException("QA fallback", "NotAllowedError")),
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const actionText = "ANA observa la VENTANA.";
  const secondActionText = "La segunda escena conserva un ID distinto.";
  const dialogueText = "Hola, ANA MARÍA.";
  await page.route(`**/api/writer/scripts/${scriptId}/analysis`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      analysis: {
        identities: [
          { key: "ANA", name: "ANA", source: "ai", accepted: true },
          { key: "NO", name: "NO", source: "ai", accepted: false },
        ],
        evidence: [
          { fingerprint: "ana-ok", identityKey: "ANA", identity: "ANA", blockId: "11111111-1111-4111-8111-111111111102", sceneId: "11111111-1111-4111-8111-111111111101", start: 0, end: 3, relation: "action", presence: "present", source: "ai", confidence: "medium", reason: "Participa en la acción.", blockHash: textHash(actionText) },
          { fingerprint: "no-review", identityKey: "NO", identity: "NO", blockId: "11111111-1111-4111-8111-111111111102", sceneId: "11111111-1111-4111-8111-111111111101", start: 0, end: 2, relation: "indeterminate", presence: "unknown", source: "ai", confidence: "review", reason: "Candidato sin evidencia aceptada.", blockHash: textHash(actionText) },
        ],
        observations: [
          { id: "format-action", blockId: "11111111-1111-4111-8111-111111111102", sceneId: "11111111-1111-4111-8111-111111111101", kind: "action", message: "Clasificación contextual compatible.", source: "ai", blockHash: textHash(actionText) },
          { id: "format-action-2", blockId: "11111111-1111-4111-8111-111111111109", sceneId: "11111111-1111-4111-8111-111111111108", kind: "action", message: "Clasificación contextual compatible.", source: "rule", blockHash: textHash(secondActionText) },
          { id: "format-dialogue", blockId: "11111111-1111-4111-8111-111111111104", sceneId: "11111111-1111-4111-8111-111111111101", kind: "dialogue", message: "La clasificación requiere revisión.", source: "ai", blockHash: textHash(dialogueText) },
        ],
      },
      decisions: [],
      compatibleRevision: true,
    }),
  }));
  await page.goto(`/writer/${scriptId}`);
  const observations = page.locator(".writer-observations-panel");
  await expect(observations).toBeVisible();
  await expect(observations.locator(".writer-observations-known")).toContainText("ANA");
  await expect(observations.locator(".writer-observations-known").getByText("NO", { exact: true })).toHaveCount(0);
  await expect(observations.locator(".writer-format-summary")).toHaveCount(2);
  await expect(observations.locator(".writer-format-review")).toHaveCount(0);
  const highlights = page.locator(".writer-import-review-highlight");
  const highlightToggle = observations.getByRole("checkbox", { name: "Mostrar ajustes en documento" });
  await expect(highlights).toHaveCount(3);
  await expect(highlightToggle).toBeChecked();
  await highlightToggle.uncheck();
  await expect(highlights).toHaveCount(0);
  await highlightToggle.check();
  await expect(highlights).toHaveCount(3);

  await page.locator('[data-writer-import-review-id="format-dialogue"]').click();
  await expect(observations.locator(".writer-format-review")).toContainText("Diálogos · 1 de 1");
  await expect(page.locator('[data-writer-import-review-id="format-dialogue"]')).toHaveClass(/is-active/);
  await observations.getByRole("button", { name: "Correcto" }).click();
  await expect(page.locator('[data-writer-import-review-id="format-dialogue"]')).toHaveCount(0);
  await expect(highlights).toHaveCount(2);
  await page.reload();
  await expect(observations).toBeVisible();
  await expect(highlights).toHaveCount(2);
  await expect(page.locator('[data-writer-import-review-id="format-dialogue"]')).toHaveCount(0);

  await observations.locator('[data-category="action"]').getByRole("button", { name: "Revisar" }).click();
  await expect(observations.locator(".writer-format-review")).toContainText("Acciones · 1 de 2");
  await expect(observations.locator(".writer-format-review")).toHaveCount(1);
  await observations.getByRole("button", { name: "Ver siguiente →" }).click();
  await expect(observations.locator(".writer-format-review")).toContainText("Acciones · 2 de 2");
  await observations.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.locator(".writer-header").getByRole("button", { name: /Observaciones/ }).click();
  await expect(observations.locator(".writer-format-review")).toContainText("Acciones · 2 de 2");
  await observations.getByRole("button", { name: "← Anterior" }).click();
  await observations.locator(".writer-format-review select").selectOption("transition");
  await expect(page.getByLabel("Editor de guion").locator('p[data-block-id$="02"]')).toHaveAttribute("data-screenplay-kind", "transition");
  await expect(page.locator('[data-writer-import-review-id="format-action"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByLabel("Editor de guion").locator('p[data-block-id$="02"]')).toHaveAttribute("data-screenplay-kind", "action");
  await expect(page.locator('[data-writer-import-review-id="format-action"]')).toHaveCount(0);
  await expect(highlights).toHaveCount(1);

  const timeline = page.locator(".writer-timeline-panel");
  await expect(timeline).toBeVisible();
  const [timelineBox, observationsBox] = await Promise.all([timeline.boundingBox(), observations.boundingBox()]);
  expect(timelineBox).not.toBeNull();
  expect(observationsBox).not.toBeNull();
  expect(timelineBox!.x).toBeLessThan(observationsBox!.x);
  expect(timelineBox!.x + timelineBox!.width).toBeGreaterThanOrEqual(observationsBox!.x + observationsBox!.width - 1);
  expect(timelineBox!.y).toBeGreaterThanOrEqual(observationsBox!.y + observationsBox!.height - 1);

  await page.getByRole("button", { name: "Focus" }).click();
  await expect(observations).toBeHidden();
  await expect(highlights).toHaveCount(0);
  await expect(timeline).toBeHidden();
  await expect(page.locator(".writer-sidebar")).toBeHidden();
  await page.getByRole("button", { name: "Salir de Focus" }).click();
  await expect(observations).toBeVisible();
  await expect(timeline).toBeVisible();
  await expect(highlights).toHaveCount(1);

  await page.getByRole("button", { name: "Acciones de escena 2" }).click();
  await page.getByRole("menuitem", { name: "Mover arriba" }).click();
  await expect(page.locator('[data-writer-import-review-id="format-action-2"]')).toHaveCount(1);
  await page.locator(".writer-structural-toast").getByRole("button", { name: "Deshacer" }).click();
  await expect(page.locator('[data-writer-import-review-id="format-action-2"]')).toHaveCount(1);

  const remainingBlock = page.getByLabel("Editor de guion").locator('p[data-block-id$="09"]');
  await remainingBlock.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" CAMBIO");
  await expect(highlights).toHaveCount(0);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(highlights).toHaveCount(1);
  await remainingBlock.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.press("Backspace");
  await expect(highlights).toHaveCount(0);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(highlights).toHaveCount(1);

  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(observations).toBeVisible();
  await expect(timeline).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(timeline).toBeHidden();
  await observations.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
  await expect(page.getByRole("button", { name: /Navegar/ })).toBeVisible();
});

function textHash(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

test("Script Assistant stays incremental, opens markers in one click, survives Focus, and uses a mobile drawer", async ({ page }) => {
  const sceneId = "11111111-1111-4111-8111-111111111101";
  const actionId = "11111111-1111-4111-8111-111111111102";
  const sourceHash = createHash("sha256").update(JSON.stringify({
    sceneId,
    blocks: [
      { id: sceneId, kind: "sceneHeading", text: "INT. ESTUDIO - DÍA" },
      { id: actionId, kind: "action", text: "ANA observa la VENTANA." },
      { id: "11111111-1111-4111-8111-111111111103", kind: "character", text: "ANA" },
      { id: "11111111-1111-4111-8111-111111111104", kind: "dialogue", text: "Hola, ANA MARÍA." },
      { id: "11111111-1111-4111-8111-111111111105", kind: "character", text: "ANA MARÍA" },
      { id: "11111111-1111-4111-8111-111111111106", kind: "parenthetical", text: "(sonríe)" },
      { id: "11111111-1111-4111-8111-111111111107", kind: "dialogue", text: "Hola, Ana." },
    ],
  })).digest("hex");
  let posts = 0;
  await page.route(`**/api/writer/scripts/${scriptId}/assistant`, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enabled: true,
        overrides: [],
        dismissals: [],
        analyses: [{
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", scriptId, sceneId, sourceHash,
          analysisVersion: "assistant-core-v1", model: "gpt-5.6-terra", status: "fresh", updatedAt: "2026-09-30T12:00:00Z",
          payload: {
            objective: { value: "Observar la reacción de Ana María.", confidence: "medium", evidence: [{ blockId: actionId }] },
            obstacle: { value: null, confidence: "low", evidence: [] },
            change: { value: "Ana María responde a la observación.", confidence: "medium", evidence: [{ blockId: actionId }] },
            observations: [{ id: `${sourceHash.slice(0, 16)}:1`, category: "obstacle", state: "QUESTION", title: "Obstáculo de la escena", question: "¿Qué dificulta lo que Ana busca aquí?", observation: null, evidence: [{ blockId: actionId }] }],
          },
        }],
      }),
    });
    if (route.request().method() === "POST") posts += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ saved: true }) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  const marker = page.getByRole("button", { name: "Abrir observación narrativa" });
  await expect(marker).toHaveCount(1);
  expect(posts).toBe(0);
  await marker.click();
  const panel = page.locator(".writer-observations-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: /Assistant Narrativa/ })).toHaveAttribute("aria-current", "page");
  await expect(panel.getByText("¿Qué dificulta lo que Ana busca aquí?")).toBeVisible();
  await expect(page.locator('[data-block-id$="02"]')).toHaveClass(/writer-scene-target-highlight/);

  await page.getByRole("button", { name: "Focus" }).click();
  await expect(marker).toBeHidden();
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "Salir de Focus" }).click();
  await expect(marker).toBeVisible();
  await expect(panel).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar" }).click();
  await page.getByRole("button", { name: "Respaldo JSON" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let backup = "";
  for await (const chunk of stream) backup += chunk.toString();
  expect(backup).not.toContain("assistant-core-v1");
  expect(backup).not.toContain("Observar la reacción");

  await page.setViewportSize({ width: 390, height: 844 });
  const box = await panel.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(389);
});

test("Assistant OFF never auto-calls and a provider error leaves Writer usable", async ({ page }) => {
  let posts = 0;
  await page.route(`**/api/writer/scripts/${scriptId}/assistant`, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, analyses: [], overrides: [], dismissals: [] }),
    });
    if (route.request().method() === "POST") {
      posts += 1;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "No pudimos analizar esta escena ahora.", code: "provider" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ saved: true }) });
  });
  await page.goto(`/writer/${scriptId}`);
  await page.locator('[data-block-id$="02"]').click();
  await page.waitForTimeout(3_800);
  expect(posts).toBe(0);
  await page.getByLabel("Editor de guion").press("Shift+F10");
  await page.getByRole("menuitem", { name: /Analizar escena/ }).click();
  await expect(page.getByText("No pudimos analizar esta escena ahora.").first()).toBeVisible();
  await expect(page.getByLabel("Editor de guion")).toBeEditable();
  expect(posts).toBe(1);
});
