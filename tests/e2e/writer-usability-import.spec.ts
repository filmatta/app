import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { deriveWriterTimeline } from "../../lib/writer/timeline";

const scriptId = "11111111-1111-4111-8111-111111111111";

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

async function openWriter(page: Page, context: BrowserContext, saveDelay = 0) {
  await page.request.get(`http://127.0.0.1:54329/__scenario?value=writer-ux&writerSaveDelay=${saveDelay}`);
  await session(context);
  await page.goto(`/writer/${scriptId}`);
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
}

async function replaceBlockText(page: Page, block: ReturnType<Page["locator"]>, text: string) {
  await block.selectText();
  await page.keyboard.type(text);
}

test("contextual autocomplete is explicit, keyboard-safe, undoable, and viewport-bound", async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: () => Promise.reject(new DOMException("QA fallback", "NotAllowedError")),
    });
  });
  await openWriter(page, context);
  const editor = page.getByLabel("Editor de guion");
  const action = editor.locator('[data-block-id$="02"]');
  const actionId = await action.getAttribute("data-block-id");

  await replaceBlockText(page, action, "INT");
  const suggestions = page.getByRole("listbox", { name: "Sugerencias de formato" });
  await expect(suggestions.getByRole("option", { name: "INT. Encabezado interior", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(editor.locator(`[data-block-id="${actionId}"]`)).toHaveAttribute("data-screenplay-kind", "sceneHeading");
  await expect(editor.locator(`[data-block-id="${actionId}"]`)).toHaveText("INT.");
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(editor.locator(`[data-block-id="${actionId}"]`)).toHaveAttribute("data-screenplay-kind", "action");
  await expect(editor.locator(`[data-block-id="${actionId}"]`)).toHaveText("ANA observa la VENTANA.");

  await replaceBlockText(page, action, "Carolina intenta abrir la puerta.");
  await expect(suggestions).toBeHidden();

  const character = editor.locator('[data-block-id$="03"]');
  await replaceBlockText(page, character, "AN");
  await expect(suggestions.getByRole("option", { name: /ANA/ })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(character).toHaveText("ANA MARÍA");

  await replaceBlockText(page, action, "EXT");
  await expect(suggestions).toBeVisible();
  await action.dispatchEvent("compositionstart");
  await expect(suggestions).toBeHidden();
  await action.dispatchEvent("keydown", { key: "Tab", code: "Tab", isComposing: true });
  await expect(action).toHaveAttribute("data-screenplay-kind", "action");
  await action.dispatchEvent("compositionend");
  await page.getByRole("button", { name: "Focus" }).click();
  await replaceBlockText(page, action, "EXT");
  await expect(suggestions).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Salir de Focus" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await replaceBlockText(page, action, "FAD");
  await expect(suggestions.getByRole("option", { name: /^FADE IN:/ })).toBeVisible();
  await expect(suggestions.getByRole("option", { name: /^FADE OUT:/ })).toBeVisible();
  const box = await suggestions.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(suggestions).toBeHidden();

  await replaceBlockText(page, action, "FAD");
  const beforeEnter = await editor.locator(".writer-screenplay-block").count();
  await page.keyboard.press("Enter");
  await expect(editor.locator(".writer-screenplay-block")).toHaveCount(beforeEnter + 1);
  await expect(action).toHaveAttribute("data-screenplay-kind", "action");
  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 10_000 });
  const saved = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  await action.click();
  await page.keyboard.press("End");
  await expect(suggestions).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1_800);
  const unchanged = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(unchanged.saves).toBe(saved.saves);
});

test("saved revisions auto-refresh an open Timeline once, preserve state, and stop when closed", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWriter(page, context, 250);
  const panel = page.getByRole("region", { name: "Timeline del guion" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/revisión 1/)).toBeVisible();
  await panel.getByLabel("Entorno").selectOption("interior");
  await panel.locator('[data-timeline-scene-id$="01"]').click();
  await page.waitForLoadState("networkidle");

  const before = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(before.saves).toBe(0);
  const action = page.getByLabel("Editor de guion").locator('[data-block-id$="02"]');
  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" CAMBIO_A CAMBIO_B");
  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 10_000 });
  await expect(panel.getByText("Versión guardada · revisión 2", { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByLabel("Entorno")).toHaveValue("interior");
  await expect(panel.locator('[data-timeline-scene-id$="01"]')).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator('[data-timeline-scene-id$="01"]')).toHaveAttribute("title", /Extensión: \d+ palabras/);

  const after = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(after.saves - before.saves).toBe(1);
  expect(after.reads - before.reads).toBe(1);
  const started = performance.now();
  const parsed = deriveWriterTimeline({
    scriptId,
    title: "QA",
    document: after.document,
    schemaVersion: 1,
    revision: after.revision,
    updatedAt: "2026-09-27T12:00:00Z",
  });
  const parseMs = performance.now() - started;
  expect(parsed.ok).toBe(true);
  console.log(`QA_TIMELINE saves=${after.saves - before.saves} refreshes=${after.reads - before.reads} parseMs=${parseMs.toFixed(3)} responseBytes≈${after.approximateResponseBytes}`);

  await panel.getByRole("button", { name: "Actualizar Timeline" }).click();
  await expect.poll(async () => (await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json()).reads).toBe(after.reads + 1);
  const afterManual = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(afterManual.saves).toBe(after.saves);
  await panel.getByRole("button", { name: "Cerrar", exact: true }).click();
  const closed = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" CERRADO");
  await expect.poll(async () => (await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json()).saves).toBe(closed.saves + 1);
  await page.waitForTimeout(500);
  const final = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(final.reads).toBe(closed.reads);
});

test("paste import requires review, creates a new canonical document, and exports PDF", async ({ page, context }) => {
  await openWriter(page, context);
  const originalEditor = page.getByLabel("Editor de guion");
  await expect(page.locator(".writer-character-suggestions")).toHaveCount(0);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    if (viewport.width <= 600) {
      const notice = page.getByRole("dialog", { name: "Writer en móvil" });
      if (await notice.isVisible()) await notice.getByRole("button", { name: "Entendido" }).click();
      await page.getByRole("button", { name: "Más acciones de Writer" }).click();
      const mobileMenu = page.getByRole("dialog", { name: "Más acciones de Writer" });
      await expect(mobileMenu.getByRole("button", { name: "Importar borrador" })).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(page.locator(".writer-header").getByRole("button", { name: "Importar borrador" })).toBeVisible();
    }
  }

  await page.getByRole("button", { name: "Más acciones de Writer" }).click();
  await page.getByRole("dialog", { name: "Más acciones de Writer" }).getByRole("button", { name: "Importar borrador" }).click();
  const dialog = page.getByRole("dialog", { name: "Importar borrador" });
  await expect(dialog.getByText("Se creará un guion nuevo. Tu documento actual no se modificará.")).toBeHidden();
  await dialog.getByLabel("Texto del borrador").fill("EXT. PRUEBA - DÍA\n\nTexto que sólo vive en staging.");
  await expect(originalEditor).not.toContainText("Texto que sólo vive en staging.");
  page.once("dialog", (prompt) => prompt.accept());
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  expect((await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json()).creates).toBe(0);

  await page.getByRole("button", { name: "Más acciones de Writer" }).click();
  await page.getByRole("dialog", { name: "Más acciones de Writer" }).getByRole("button", { name: "Importar borrador" }).click();
  await dialog.getByRole("tab", { name: "Archivo TXT o FDX" }).click();
  const fileInput = dialog.getByLabel("Selecciona un archivo");
  await fileInput.setInputFiles({
    name: "sintetico.fdx",
    mimeType: "application/xml",
    buffer: Buffer.from(`<?xml version="1.0"?><FinalDraft><Content><Paragraph Type="Scene Heading"><Text>INT. CAFÉ - DÍA</Text></Paragraph><Paragraph Type="Character"><Text>ÁNGELA</Text></Paragraph><Paragraph Type="Dialogue"><Text>¿Qué ocurrió?</Text></Paragraph></Content></FinalDraft>`),
  });
  await expect(dialog.getByText("Preparado:")).toBeVisible();
  await expect(dialog.getByText("ÁNGELA", { exact: true })).toBeHidden();
  await dialog.getByRole("button", { name: "Importar sin IA" }).click();
  await expect(dialog.getByText("ÁNGELA", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Volver al origen" }).click();
  await fileInput.setInputFiles({
    name: "sintetico.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("EXT. CALLE - NOCHE\n\nESPERANZA\nSeguimos aquí."),
  });
  await expect(dialog.getByText("ESPERANZA", { exact: true })).toBeHidden();
  await dialog.getByRole("button", { name: "Importar sin IA" }).click();
  await expect(dialog.getByText("ESPERANZA", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Volver al origen" }).click();
  await dialog.getByRole("tab", { name: "Texto pegado" }).click();
  await dialog.getByLabel("Texto del borrador").fill(`INT. CASA - DÍA

Carolina empuja la puerta cerrada.

CAROLINA
(en voz baja)
No podemos esperar más.

CORTE A:

MISTERIO`);
  await dialog.getByRole("button", { name: "Importar sin IA" }).click();
  await expect(dialog.getByRole("button", { name: /Revisar \(2\)/ })).toBeVisible();
  await expect(dialog.getByText("MISTERIO", { exact: true })).toBeVisible();
  const characterSummary = dialog.locator(".writer-import-summary button").filter({ hasText: "Personaje — encabezado de diálogo" });
  await expect(characterSummary.getByText("1", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Se creará un guion nuevo; el documento actual no se modificará.", { exact: false })).toBeVisible();
  await expect(originalEditor).toContainText("ANA observa la VENTANA.");

  const reviewCard = dialog.locator(".writer-import-list article").first();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const cardBox = await reviewCard.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.x).toBeGreaterThanOrEqual(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(viewport.width);
  }
  await dialog.getByRole("button", { name: "Confirmar este tipo" }).click();
  const unresolvedCard = dialog.locator(".writer-import-list article").filter({ hasText: "MISTERIO" });
  await unresolvedCard.getByLabel("Tipo").selectOption("action");
  await expect(dialog.getByRole("button", { name: "Revisar (0)" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Importar al Writer" }).click();
  await expect(page).toHaveURL(/\/writer\/33333333-3333-4333-8333-333333333333$/);
  expect((await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json()).creates).toBe(1);
  const editor = page.getByLabel("Editor de guion");
  await expect(editor).toContainText("INT. CASA - DÍA");
  await expect(editor).toContainText("MISTERIO");
  await expect(page.getByRole("status")).toContainText("Importación completada");

  const importedMobileNotice = page.getByRole("dialog", { name: "Writer en móvil" });
  if (await importedMobileNotice.isVisible()) {
    await importedMobileNotice.getByRole("button", { name: "Entendido" }).click();
  }

  await page.getByRole("button", { name: "Más acciones de Writer" }).click();
  await page.getByRole("dialog", { name: "Más acciones de Writer" }).getByRole("button", { name: "Exportar PDF" }).click();
  const pdfDialog = page.getByRole("dialog", { name: "Generar PDF de guion" });
  await pdfDialog.getByRole("button", { name: "Generar PDF" }).click();
  await expect(pdfDialog.getByText("PDF listo.", { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(pdfDialog.getByRole("link", { name: "Descargar PDF" })).toBeVisible();
});

test("character observations are revealed on demand, local, reversible, and absent from Focus", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWriter(page, context);
  const editor = page.getByLabel("Editor de guion");
  const action = editor.locator('[data-block-id$="02"]');
  await replaceBlockText(page, action, "Un robot observa a ANA.");
  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 10_000 });
  const marker = page.getByRole("button", { name: "1 observación en este bloque" });
  await expect(marker).toBeVisible();
  const afterEdit = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();

  await marker.click();
  const panel = page.locator(".writer-observations-panel");
  await expect(panel.getByText("Identidad por revisar: UN ROBOT")).toBeVisible();
  await expect(panel.getByText("Un robot observa a ANA.", { exact: false })).toBeVisible();
  await panel.getByRole("button", { name: "Ignorar" }).click();
  await expect(panel.getByText("No hay posibles personajes pendientes en el texto actual.")).toBeVisible();
  await panel.getByText(/Ignoradas \(1\)/).click();
  await panel.getByRole("button", { name: "Restaurar" }).click();
  await expect(panel.getByText("Identidad por revisar: UN ROBOT")).toBeVisible();
  await panel.getByRole("button", { name: "Ver fragmento" }).click();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Un robot");
  await panel.getByRole("button", { name: "Vincular a existente" }).click();
  const linkDialog = page.getByRole("dialog", { name: "Vincular evidencia" });
  await linkDialog.getByLabel("Personaje").selectOption({ label: "ANA" });
  await linkDialog.getByRole("button", { name: "Vincular", exact: true }).click();
  await expect(panel.getByText("No hay posibles personajes pendientes en el texto actual.")).toBeVisible();
  const afterLink = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(afterLink.saves).toBe(afterEdit.saves);
  expect(afterLink.reads).toBe(afterEdit.reads);

  await replaceBlockText(page, action, "Un guardia bloquea la salida.");
  await expect(panel.getByText("Identidad por revisar: UN GUARDIA")).toBeVisible();
  await panel.getByRole("button", { name: "Confirmar personaje" }).click();
  const confirmDialog = page.getByRole("dialog", { name: "Confirmar personaje" });
  await confirmDialog.getByLabel("Nombre reconocido").fill("ROBOT R-7");
  await confirmDialog.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(panel.getByText("ROBOT R-7", { exact: true })).toBeVisible();
  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 10_000 });
  const afterSecondEdit = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  await page.waitForTimeout(700);
  const afterDecisions = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(afterDecisions.saves).toBe(afterSecondEdit.saves);
  expect(afterDecisions.reads).toBe(afterSecondEdit.reads);

  await panel.getByRole("button", { name: "Cerrar" }).click();
  await page.reload();
  await expect(editor).toBeVisible();
  await page.locator(".writer-header").getByRole("button", { name: /Observaciones/ }).click();
  await expect(page.locator(".writer-observations-panel").getByText("ROBOT R-7", { exact: true })).toBeVisible();
  await page.locator(".writer-observations-panel").getByRole("button", { name: "Cerrar" }).click();

  const character = editor.locator('[data-block-id$="03"]');
  await replaceBlockText(page, character, "ROB");
  await expect(page.getByRole("listbox", { name: "Sugerencias de formato" }).getByRole("option", { name: /ROBOT R-7/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await replaceBlockText(page, action, "Un perro sigue a la niña.");
  await expect(page.getByRole("button", { name: /observaciones en este bloque/ })).toBeVisible();
  await page.getByRole("button", { name: "Focus" }).click();
  await expect(page.locator(".writer-observation-marker")).toBeHidden();
  await expect(page.locator(".writer-mobile-observations")).toBeHidden();
  await expect(page.locator(".writer-observations-open-button")).toBeHidden();
  await expect(page.locator(".writer-observations-panel")).toBeHidden();
  await page.getByRole("button", { name: "Salir de Focus" }).click();
  await expect(page.locator(".writer-observation-marker")).toBeVisible();
});
