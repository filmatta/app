import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";

const scriptId = "11111111-1111-4111-8111-111111111111";
const evidence = "output/writer-polish-timeline-v1";

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
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3105" });
  await page.goto(`/writer/${scriptId}`);
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
}

async function rightClick(page: Page, locator: Locator) {
  const ownsSelection = await locator.evaluate((element) => {
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed
      && selection.anchorNode && selection.focusNode
      && element.contains(selection.anchorNode) && element.contains(selection.focusNode));
  });
  if (!ownsSelection) await locator.click({ position: { x: 12, y: 12 } });
  await locator.click({ button: "right", position: { x: 12, y: 12 } });
  return page.getByRole("menu", { name: "Acciones del bloque" });
}

async function rightClickCurrentSelection(page: Page) {
  const point = await page.evaluate(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) throw new Error("A text selection is required.");
    const range = selection.getRangeAt(0);
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y, { button: "right" });
  return page.getByRole("menu", { name: "Acciones del bloque" });
}

async function dragSelect(page: Page, startSelector: string, startOffset: number, endSelector: string, endOffset: number) {
  await page.evaluate(({ startSelector, startOffset, endSelector, endOffset }) => {
    const start = document.querySelector<HTMLElement>(startSelector)?.firstChild;
    const end = document.querySelector<HTMLElement>(endSelector)?.firstChild;
    if (!start || !end) throw new Error("Missing selectable screenplay text.");
    const range = document.createRange();
    range.setStart(start, startOffset);
    range.setEnd(end, endOffset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, { startSelector, startOffset, endSelector, endOffset });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? "")).not.toBe("");
}

test("context menu preserves selection, uses the real clipboard, and fails closed", async ({ page, context }) => {
  await openWriter(page, context);
  const editor = page.getByLabel("Editor de guion");
  const action = editor.locator('[data-block-id$="02"]');
  await dragSelect(page, '[data-block-id$="02"]', 3, '[data-block-id$="02"]', 10);
  let menu = await rightClickCurrentSelection(page);
  await expect(menu.getByRole("menuitem", { name: /^Cortar/ })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: /^Copiar/ })).toBeEnabled();
  await menu.getByRole("menuitem", { name: /^Copiar/ }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe("");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe("ANA observa la VENTANA.");

  await action.selectText();
  menu = await rightClickCurrentSelection(page);
  await menu.getByRole("menuitem", { name: /^Cortar/ }).click();
  await expect(action).toHaveText("");
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(action).toHaveText("ANA observa la VENTANA.");

  await page.evaluate(() => navigator.clipboard.writeText(" PEGADO_MENU"));
  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+F10");
  menu = page.getByRole("menu", { name: "Acciones del bloque" });
  await menu.getByRole("menuitem", { name: /^Pegar/ }).click();
  await expect(action).toContainText("PEGADO_MENU");

  const beforeFailedCut = await action.textContent();
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
    });
  });
  await action.selectText();
  menu = await rightClick(page, action);
  await menu.getByRole("menuitem", { name: /^Cortar/ }).click();
  await expect(action).toHaveText(beforeFailedCut ?? "");
  await expect(page.getByRole("status")).toContainText("el texto no se eliminó");

  await action.click();
  await page.keyboard.press("Shift+F10");
  menu = page.getByRole("menu", { name: "Acciones del bloque" });
  await expect(menu.getByRole("menuitem", { name: /^Copiar/ })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: /^Cortar/ })).toBeDisabled();
  await page.keyboard.press("Escape");

  await action.dispatchEvent("pointerdown", { pointerType: "touch", clientX: 20, clientY: 20 });
  await action.dispatchEvent("contextmenu", { clientX: 20, clientY: 20 });
  await expect(menu).toBeHidden();
});

test("right-click uses the active caret across blocks and screenplay margins", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWriter(page, context);
  const editor = page.getByLabel("Editor de guion");
  const paper = page.locator(".writer-paper");
  const paperBox = await paper.boundingBox();
  expect(paperBox).not.toBeNull();

  await page.mouse.click(paperBox!.x + 6, paperBox!.y + 10, { button: "right" });
  let menu = page.getByRole("menu", { name: "Acciones del bloque" });
  await expect(menu.getByText("Coloca el cursor en el guion para insertar.")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /^Insertar/ })).toBeDisabled();
  await page.keyboard.press("Escape");

  const blockA = editor.locator('[data-block-id$="02"]');
  const blockB = editor.locator('[data-block-id$="09"]');
  await blockA.click({ position: { x: 18, y: 12 } });
  await blockB.click({ button: "right", position: { x: 18, y: 12 } });
  menu = page.getByRole("menu", { name: "Acciones del bloque" });
  await expect(menu.getByText("En el cursor actual")).toBeVisible();
  await menu.getByRole("menuitem", { name: /^Insertar/ }).click();
  await page.getByRole("button", { name: /Nueva escena/ }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva escena" });
  await dialog.getByLabel("Lugar").fill("DESTINO CARET");
  await dialog.getByLabel("Momento").selectOption("NOCHE");
  await dialog.getByRole("button", { name: "Insertar encabezado" }).click();

  const order = await editor.locator(".writer-screenplay-block").evaluateAll((blocks) => blocks.map((block) => ({
    id: block.getAttribute("data-block-id"),
    text: block.textContent,
  })));
  const indexA = order.findIndex((block) => block.id === "11111111-1111-4111-8111-111111111102");
  const indexB = order.findIndex((block) => block.id === "11111111-1111-4111-8111-111111111109");
  const inserted = order.findIndex((block) => block.text === "INT. DESTINO CARET - NOCHE");
  expect(inserted).toBe(indexA + 1);
  expect(inserted).toBeLessThan(indexB);

  await blockA.click({ position: { x: 18, y: 12 } });
  await page.mouse.click(paperBox!.x + 6, paperBox!.y + 10, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: /^Insertar/ })).toBeEnabled();
  await page.keyboard.press("Escape");
});

test("context menu rejects ambiguous, composing, denied, cancelled, and obsolete actions", async ({ page, context }) => {
  await openWriter(page, context);
  const editor = page.getByLabel("Editor de guion");
  const first = editor.locator('[data-block-id$="02"]');
  const last = editor.locator('[data-block-id$="04"]');
  await dragSelect(page, '[data-block-id$="02"]', 0, '[data-block-id$="04"]', 4);
  let menu = await rightClickCurrentSelection(page);
  for (const kind of ["Encabezado de escena", "Acción", "Personaje", "Diálogo", "Acotación", "Transición", "Nota del autor"]) {
    await expect(menu.getByRole("menuitemradio", { name: new RegExp(`^${kind}`) })).toBeDisabled();
  }
  await expect(menu.getByRole("menuitem", { name: /^Insertar/ })).toBeDisabled();
  await page.keyboard.press("Escape");

  await first.click();
  await first.dispatchEvent("keydown", { key: "F10", code: "F10", shiftKey: true, isComposing: true });
  await expect(menu).toBeHidden();

  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "readText", {
      configurable: true,
      value: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
    });
  });
  await page.keyboard.press("Shift+F10");
  menu = page.getByRole("menu", { name: "Acciones del bloque" });
  await menu.getByRole("menuitem", { name: /^Pegar/ }).click();
  await expect(page.getByRole("status")).toContainText("No se pudo pegar");
  await page.keyboard.press("Escape");

  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "readText", {
      configurable: true,
      value: () => Promise.reject(new DOMException("cancelled", "AbortError")),
    });
  });
  await page.keyboard.press("Shift+F10");
  await menu.getByRole("menuitem", { name: /^Pegar/ }).click();
  await expect(page.getByRole("status")).toContainText("No se pudo pegar");
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(editor).toBeVisible();
  await first.click();
  await page.evaluate(async () => {
    await navigator.clipboard.writeText("OBSOLETE_PASTE");
    const readText = navigator.clipboard.readText.bind(navigator.clipboard);
    Object.defineProperty(navigator.clipboard, "readText", {
      configurable: true,
      value: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return readText();
      },
    });
  });
  await page.keyboard.press("Shift+F10");
  await menu.getByRole("menuitem", { name: /^Pegar/ }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await last.click();
  await expect(page.getByRole("status")).toContainText("El destino cambió");
  await expect(editor).not.toContainText("OBSOLETE_PASTE");
});

test("context menu resolves empty editable lines and keeps the caret across sheet whitespace", async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: () => Promise.reject(new DOMException("fallback QA", "NotAllowedError")),
    });
  });
  await openWriter(page, context);
  const editor = page.getByLabel("Editor de guion");
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  const initialEmpty = editor.locator(".writer-screenplay-block").first();
  await expect(initialEmpty).toHaveText("");
  let menu = await rightClick(page, initialEmpty);
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /^Copiar/ })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: /^Cortar/ })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: /^Pegar/ })).toBeEnabled();
  await expect(menu.getByRole("menuitemradio", { name: /^Encabezado de escena/ })).toBeEnabled();
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/context-empty-line-1440x900.png` });
  await page.keyboard.press("Escape");

  await initialEmpty.click();
  await page.keyboard.type("ANTES");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("DESPUÉS");
  const blocks = editor.locator(".writer-screenplay-block");
  const between = blocks.nth(1);
  await expect(between).toHaveText("");
  menu = await rightClick(page, between);
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Focus" }).click();
  menu = await rightClick(page, between);
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Salir de Focus" }).click();

  await page.locator(".writer-paper").click({ button: "right", position: { x: 5, y: 5 } });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /^Insertar/ })).toBeEnabled();
  await page.keyboard.press("Escape");
});

test("scene heading assistant separates conversion, cancellation, insertion, and history", async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: () => Promise.reject(new DOMException("fallback QA", "NotAllowedError")),
    });
  });
  await openWriter(page, context);
  const editor = page.getByLabel("Editor de guion");
  const action = editor.locator('[data-block-id$="02"]');
  const targetId = await action.getAttribute("data-block-id");
  const initialCount = await editor.locator(".writer-screenplay-block").count();

  let menu = await rightClick(page, editor.locator('[data-block-id$="01"]'));
  await menu.getByRole("menuitemradio", { name: /^Encabezado de escena/ }).click();
  let dialog = page.getByRole("dialog", { name: "Configurar encabezado de escena" });
  await expect(dialog.getByLabel("Entorno")).toHaveValue("INT.");
  await expect(dialog.getByLabel("Lugar")).toHaveValue("ESTUDIO");
  await expect(dialog.getByLabel("Momento")).toHaveValue("DÍA");
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/scene-heading-conversion-dialog-1280x720.png` });
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("button", { name: "Focus" }).click();
  menu = await rightClick(page, action);
  await menu.getByRole("menuitemradio", { name: /^Encabezado de escena/ }).click();
  dialog = page.getByRole("dialog", { name: "Configurar encabezado de escena" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Salir de Focus" }).click();

  menu = await rightClick(page, action);
  await menu.getByRole("menuitemradio", { name: /^Encabezado de escena/ }).click();
  dialog = page.getByRole("dialog", { name: "Configurar encabezado de escena" });
  await expect(dialog).toContainText("ANA observa la VENTANA.");
  await expect(dialog.getByLabel("Entorno")).toHaveValue("");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(action).toHaveAttribute("data-screenplay-kind", "action");
  await expect(action).toHaveText("ANA observa la VENTANA.");

  menu = await rightClick(page, action);
  await menu.getByRole("menuitemradio", { name: /^Encabezado de escena/ }).click();
  dialog = page.getByRole("dialog", { name: "Configurar encabezado de escena" });
  await dialog.getByLabel("Entorno").selectOption("INT.");
  await dialog.getByLabel("Lugar").fill("SALA B");
  await dialog.getByLabel("Momento").selectOption("NOCHE");
  await dialog.getByRole("button", { name: "Convertir bloque" }).click();
  await expect(editor.locator(`[data-block-id="${targetId}"]`)).toHaveText("INT. SALA B - NOCHE");
  await expect(editor.locator(".writer-screenplay-block")).toHaveCount(initialCount);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(editor.locator(`[data-block-id="${targetId}"]`)).toHaveText("ANA observa la VENTANA.");
  await page.getByRole("button", { name: "Rehacer" }).click();
  await expect(editor.locator(`[data-block-id="${targetId}"]`)).toHaveText("INT. SALA B - NOCHE");

  const secondAction = editor.locator('[data-block-id$="09"]');
  menu = await rightClick(page, secondAction);
  await menu.getByRole("menuitem", { name: /^Insertar/ }).click();
  await page.getByRole("button", { name: /Nueva escena/ }).click();
  dialog = page.getByRole("dialog", { name: "Nueva escena" });
  await dialog.getByLabel("Lugar").fill("PASILLO");
  await dialog.getByRole("button", { name: "Insertar encabezado" }).click();
  await expect(secondAction).toHaveAttribute("data-screenplay-kind", "action");
  await expect(secondAction).toHaveText("La segunda escena conserva un ID distinto.");
  await expect(editor.locator(".writer-screenplay-block")).toHaveCount(initialCount + 1);
});

test("embedded Timeline reads saved revisions and navigates by stable scene id", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWriter(page, context, 2400);
  const editor = page.getByLabel("Editor de guion");
  const secondAction = editor.locator('[data-block-id$="09"]');
  const before = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();

  let menu = await rightClick(page, secondAction);
  await menu.getByRole("menuitem", { name: /Ver en línea de tiempo/ }).click();
  const panel = page.getByRole("region", { name: "Timeline del guion" });
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-timeline-scene-id$="08"]')).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("button", { name: /INT\. ESTUDIO - DÍA/ })).toHaveCount(2);
  const panelBox = await panel.boundingBox();
  expect(panelBox?.height ?? 901).toBeLessThanOrEqual(900 * 0.4 + 1);
  const afterOpen = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(afterOpen.revision).toBe(before.revision);

  await panel.getByLabel("Entorno").selectOption("interior");
  await panel.getByRole("button", { name: "Cerrar", exact: true }).click();
  const refreshed = page.waitForResponse((response) =>
    response.request().method() === "GET" && response.url().endsWith(`/api/writer/scripts/${scriptId}`),
  );
  await page.locator(".writer-header").getByRole("button", { name: "Timeline" }).click();
  await refreshed;
  await expect(panel.getByRole("button", { name: "Actualizar Timeline" })).toBeEnabled();
  await expect(panel.getByLabel("Entorno")).toHaveValue("interior");

  await panel.locator('[data-timeline-scene-id$="08"]').click();
  await expect.poll(() => page.evaluate(() =>
    window.getSelection()?.anchorNode?.parentElement?.closest("[data-block-id]")?.getAttribute("data-block-id"),
  )).toMatch(/08$/);
  await expect(panel).toBeVisible();
  await expect(editor.locator('[data-block-id$="08"]')).toHaveClass(/writer-scene-target-highlight/);
  await expect.poll(() => page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(true);
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/timeline-direct-navigation-1440x900.png` });

  await panel.locator('[data-timeline-scene-id$="01"]').click();
  await expect.poll(() => page.evaluate(() =>
    window.getSelection()?.anchorNode?.parentElement?.closest("[data-block-id]")?.getAttribute("data-block-id"),
  )).toMatch(/01$/);
  await expect(editor.locator('[data-block-id$="01"]')).toHaveClass(/writer-scene-target-highlight/);
  await expect(editor.locator('[data-block-id$="08"]')).not.toHaveClass(/writer-scene-target-highlight/);
  await expect(editor.locator('[data-block-id$="01"]')).not.toHaveClass(/writer-scene-target-highlight/, { timeout: 3_000 });

  const firstHeading = editor.locator('[data-block-id$="01"]');
  menu = await rightClick(page, firstHeading);
  await menu.getByRole("menuitemradio", { name: /^Acción/ }).click();
  await panel.locator('[data-timeline-scene-id$="01"]').click();
  await expect(page.locator(".writer-editor-feedback")).toContainText("Timeline está desactualizado");
});

test("Timeline drawer closes after direct scene navigation on a narrow viewport", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWriter(page, context);
  const notice = page.getByRole("dialog", { name: "Writer en móvil" });
  if (await notice.isVisible()) await notice.getByRole("button", { name: "Entendido" }).click();
  await page.getByRole("button", { name: "Navegar", exact: true }).click();
  await page.getByRole("dialog", { name: "Navegar por el guion" }).getByRole("button", { name: "Timeline" }).click();
  const panel = page.getByRole("region", { name: "Timeline del guion" });
  await expect(panel).toBeVisible();
  await panel.locator('[data-timeline-scene-id$="08"]').click();
  await expect(panel).toBeHidden();
  await expect(page.getByLabel("Editor de guion").locator('[data-block-id$="08"]')).toHaveClass(/writer-scene-target-highlight/);
});

test("a new unsaved scene appears only after save and explicit Timeline refresh", async ({ page, context }) => {
  await openWriter(page, context, 2400);
  const editor = page.getByLabel("Editor de guion");
  const action = editor.locator('[data-block-id$="09"]');
  let menu = await rightClick(page, action);
  await menu.getByRole("menuitem", { name: /^Insertar/ }).click();
  await page.getByRole("button", { name: /Nueva escena/ }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva escena" });
  await dialog.getByLabel("Lugar").fill("AZOTEA");
  await dialog.getByLabel("Momento").selectOption("NOCHE");
  await dialog.getByRole("button", { name: "Insertar encabezado" }).click();
  const heading = editor.getByText("INT. AZOTEA - NOCHE");
  await expect(heading).toBeVisible();

  menu = await rightClick(page, heading);
  await menu.getByRole("menuitem", { name: /Ver en línea de tiempo/ }).click();
  const panel = page.getByRole("region", { name: "Timeline del guion" });
  await expect(panel.getByRole("status")).toContainText("todavía no está en la revisión");
  await expect(panel).not.toContainText("INT. AZOTEA - NOCHE");

  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 15_000 });
  await panel.getByRole("button", { name: "Actualizar Timeline" }).click();
  await expect(panel.getByRole("button", { name: /INT\. AZOTEA - NOCHE/ })).toBeVisible();
});

test("standalone Timeline keeps its route, filters, details, and stable deep link", async ({ page, context }) => {
  await openWriter(page, context);
  await page.goto(`/writer/${scriptId}/timeline`);
  await expect(page.getByRole("heading", { name: "Vista estructural del guion" })).toBeVisible();
  await expect(page.getByRole("button", { name: /INT\. ESTUDIO - DÍA/ })).toHaveCount(2);
  await page.getByLabel("Entorno").selectOption("interior");
  await expect(page.getByText("2 de 2 escenas coinciden")).toBeVisible();
  await page.locator('[data-timeline-scene-id$="08"]').click();
  await expect(page.getByRole("heading", { name: "INT. ESTUDIO - DÍA", level: 2 })).toBeVisible();
  await page.getByRole("link", { name: "Ir al guion" }).click();
  await expect(page).toHaveURL(new RegExp(`/writer/${scriptId}\\?scene=.*08$`));
  await expect.poll(() => page.evaluate(() =>
    window.getSelection()?.anchorNode?.parentElement?.closest("[data-block-id]")?.getAttribute("data-block-id"),
  )).toMatch(/08$/);
});

test("late save acknowledgement survives Timeline and Focus without remounting the editor", async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: () => Promise.reject(new DOMException("blocked", "NotAllowedError")),
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWriter(page, context, 2400);
  const editor = page.getByLabel("Editor de guion");
  const action = editor.locator('[data-block-id$="02"]');
  await editor.evaluate((element) => { (window as typeof window & { __writerEditor?: Element }).__writerEditor = element; });

  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" ACK_TIMELINE_A");
  await expect(page.locator(".writer-save-status")).toContainText("Guardando");
  await expect(page.getByRole("region", { name: "Timeline del guion" })).toBeVisible();
  await page.getByRole("button", { name: "Focus" }).click();
  await expect(page.locator(".writer-workspace")).toHaveClass(/writer-workspace--focus/);
  await expect(page.getByRole("region", { name: "Timeline del guion" })).toBeHidden();
  await expect.poll(() => editor.evaluate((element) => (window as typeof window & { __writerEditor?: Element }).__writerEditor === element)).toBe(true);
  await expect.poll(async () => Number(await page.locator(".writer-workspace").getAttribute("data-focus-scale"))).toBeGreaterThanOrEqual(1.14);

  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" ACK_FOCUS_B");
  await action.click({ button: "right" });
  await expect(page.getByRole("menu", { name: "Acciones del bloque" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Acciones del bloque" })).toBeHidden();
  await expect(page.locator(".writer-workspace")).toHaveClass(/writer-workspace--focus/);
  await page.getByRole("button", { name: "Salir de Focus" }).click();
  await expect(page.locator(".writer-workspace")).not.toHaveClass(/writer-workspace--focus/);
  await expect(page.getByRole("region", { name: "Timeline del guion" })).toBeVisible();

  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 15_000 });
  const state = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(JSON.stringify(state.document)).toContain("ACK_TIMELINE_A ACK_FOCUS_B");
  const revision = state.revision;
  await page.getByRole("region", { name: "Timeline del guion" }).getByRole("button", { name: "Cerrar", exact: true }).click();
  const stable = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(stable.revision).toBe(revision);
  await page.reload();
  await expect(page.getByLabel("Editor de guion")).toContainText("ACK_TIMELINE_A ACK_FOCUS_B");
});

test("Focus follows native fullscreen entry and browser exit when accepted", async ({ page, context }) => {
  await openWriter(page, context);
  test.skip(!(await page.evaluate(() => window.document.fullscreenEnabled)), "Native fullscreen is unavailable in this browser context.");
  await page.getByRole("button", { name: "Focus" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.document.fullscreenElement))).toBe(true);
  await expect(page.locator(".writer-workspace")).toHaveClass(/writer-workspace--focus/);
  await page.evaluate(() => window.document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => Boolean(window.document.fullscreenElement))).toBe(false);
  await expect(page.locator(".writer-workspace")).not.toHaveClass(/writer-workspace--focus/);
});

test("Exportar stays discoverable without duplicating handlers at desktop, tablet, and mobile", async ({ page, context }) => {
  await openWriter(page, context);
  const selectedBlock = page.getByLabel("Editor de guion").locator('[data-block-id$="02"]');
  await selectedBlock.click();
  await page.keyboard.press("End");
  const stateBefore = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  const evidenceViewports = [
    { width: 1440, height: 900 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ];

  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    if (viewport.width <= 600) {
      const notice = page.getByRole("dialog", { name: "Writer en móvil" });
      if (await notice.isVisible()) await notice.getByRole("button", { name: "Entendido" }).click();
      await page.getByRole("button", { name: "Más acciones de Writer" }).click();
      const mobileMenu = page.getByRole("dialog", { name: "Más acciones de Writer" });
      await expect(mobileMenu.getByRole("button", { name: "Exportar PDF" })).toBeVisible();
      await expect(mobileMenu.getByRole("button", { name: "Exportar JSON" })).toBeVisible();
      await expect(mobileMenu.getByRole("button", { name: "Exportar FDX" })).toBeVisible();
      const menuBox = await mobileMenu.boundingBox();
      expect(menuBox).not.toBeNull();
      expect(menuBox!.x).toBeGreaterThanOrEqual(0);
      expect(menuBox!.y).toBeGreaterThanOrEqual(0);
      expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width);
      expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport.height);
      fs.mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: `${evidence}/export-${viewport.width}x${viewport.height}.png` });
      await page.keyboard.press("Escape");
      await expect(mobileMenu).toBeHidden();
      continue;
    }
    const exportButton = page.locator(".writer-header").getByRole("button", { name: "Exportar", exact: true });
    await expect(exportButton).toHaveCount(1);
    await expect(exportButton).toBeVisible();
    await exportButton.click();
    const menu = page.getByRole("group", { name: "Formatos de exportación" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button")).toHaveCount(3);
    await expect(menu.getByRole("button", { name: "PDF de guion" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Respaldo JSON" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "FDX básico" })).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.y).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport.height);
    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/export-${viewport.width}x${viewport.height}.png` });
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect.poll(() => page.evaluate(() =>
      window.getSelection()?.anchorNode?.parentElement?.closest("[data-block-id]")?.getAttribute("data-block-id"),
    )).toMatch(/02$/);
  }

  const stateAfter = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(stateAfter.revision).toBe(stateBefore.revision);
  expect(stateAfter.document).toEqual(stateBefore.document);
});

test("visual evidence keeps page bounds at desktop, tablet, and mobile", async ({ page, context, browserName }) => {
  fs.mkdirSync(evidence, { recursive: true });
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: () => Promise.reject(new DOMException("fallback QA", "NotAllowedError")),
    });
  });
  await openWriter(page, context);
  const records: Array<Record<string, unknown>> = [];

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: `${evidence}/normal-${viewport.width}x${viewport.height}.png` });
    if (viewport.width === 1440) {
      await page.locator(".writer-scene-link").first().click();
      await page.locator(".writer-scene-list > li").nth(1).hover();
      await page.screenshot({ path: `${evidence}/scene-list-active-hover-1440x900.png` });
      const action = page.getByLabel("Editor de guion").locator('[data-block-id$="02"]');
      await action.selectText();
      await rightClick(page, action);
      await page.screenshot({ path: `${evidence}/context-selection-1440x900.png` });
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name: "Focus" }).click();
    const sheet = await page.getByLabel("Editor de guion").boundingBox();
    const scale = Number(await page.locator(".writer-workspace").getAttribute("data-focus-scale"));
    expect(scale).toBeGreaterThanOrEqual(1.14);
    expect(sheet?.width ?? viewport.width).toBeLessThan(viewport.width - 120);
    const focusDimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(focusDimensions.scrollWidth, `Writer Focus at ${viewport.width}px`).toBeLessThanOrEqual(focusDimensions.clientWidth + 1);
    await page.screenshot({ path: `${evidence}/focus-${viewport.width}x${viewport.height}.png` });
    if (viewport.width === 1440) {
      const action = page.getByLabel("Editor de guion").locator('[data-block-id$="02"]');
      await action.click({ button: "right" });
      await page.screenshot({ path: `${evidence}/context-focus-1440x900.png` });
      await page.keyboard.press("Escape");
    }
    records.push({ browserName, viewport, scale, fullscreen: "fallback" });
    await page.getByRole("button", { name: "Salir de Focus" }).click();
  }

  await page.setViewportSize({ width: 768, height: 900 });
  await page.locator(".writer-header").getByRole("button", { name: "Timeline" }).click();
  await page.screenshot({ path: `${evidence}/timeline-768x900.png` });
  await page.getByRole("region", { name: "Timeline del guion" }).getByRole("button", { name: "Cerrar", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  const notice = page.getByRole("dialog", { name: "Writer en móvil" });
  if (await notice.isVisible()) await notice.getByRole("button", { name: "Entendido" }).click();
  await page.screenshot({ path: `${evidence}/writing-390x844.png` });
  await page.getByRole("button", { name: "Navegar", exact: true }).click();
  await page.getByRole("dialog", { name: "Navegar por el guion" }).getByRole("button", { name: "Escenas" }).click();
  await expect(page.locator(".writer-sidebar")).toHaveClass(/writer-sidebar--open/);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${evidence}/scene-list-mobile-390x844.png` });
  await page.locator(".writer-sidebar").getByRole("button", { name: "Cerrar" }).click();
  await page.getByRole("button", { name: "Más acciones de Writer" }).click();
  await page.getByRole("dialog", { name: "Más acciones de Writer" }).getByRole("button", { name: "Focus" }).click();
  await page.screenshot({ path: `${evidence}/focus-390x844.png` });
  records.push({ browserName, viewport: { width: 390, height: 844 }, scale: 1, fullscreen: "fallback" });
  await page.getByRole("button", { name: "Más acciones de Writer" }).click();
  await page.getByRole("dialog", { name: "Más acciones de Writer" }).getByRole("button", { name: "Salir de Focus" }).click();
  await page.getByRole("button", { name: "Navegar", exact: true }).click();
  await page.getByRole("dialog", { name: "Navegar por el guion" }).getByRole("button", { name: "Timeline" }).click();
  await page.screenshot({ path: `${evidence}/timeline-drawer-390x844.png` });
  fs.writeFileSync(`${evidence}/capture-metadata.json`, JSON.stringify(records, null, 2));
});
