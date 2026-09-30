import { expect, test, type BrowserContext } from "@playwright/test";
import fs from "node:fs";

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

test("writing presentation remains usable at desktop, tablet and phone widths", async ({ page }) => {
  fs.mkdirSync(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel("Editor de guion")).toBeVisible();
    await expect(page.getByRole("button", { name: "Insertar en el guion" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Deshacer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rehacer" })).toBeVisible();
    if (width <= 900) {
      await expect(page.getByRole("button", { name: "Escenas", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Personajes", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Personajes", exact: true }).click();
      await expect(page.getByText("Personajes", { exact: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "Cerrar" }).click();
      await expect(page.locator(".writer-sidebar")).not.toHaveClass(/writer-sidebar--open/);
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: `${evidence}/writer-${width}.png`, fullPage: true });
  }
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
  await expect(page.getByRole("button", { name: "Escenas", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Personajes", exact: true })).toBeVisible();
});

function textHash(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
