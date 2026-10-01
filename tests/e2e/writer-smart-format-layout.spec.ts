import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const scriptId = "11111111-1111-4111-8111-111111111111";
const screenplay = `INT. CASA - DÍA

Una caja descansa sobre la mesa.

ALMA
(en voz baja)
No deberíamos abrirla.

CORTE A:

EXT. PATIO - NOCHE

Alma sale con la caja mientras la lluvia golpea el suelo.

INT. SÓTANO - NOCHE

Un golpe seco atraviesa la pared.

EXT. CALLE - AMANECER

La caja queda atrás mientras Alma se aleja.`;

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{
    name: "sb-127-auth-token",
    value: "base64-" + b64({ access_token: token, refresh_token: "local-refresh", expires_at: 4102444800, token_type: "bearer", user: { id: scriptId } }),
    domain: "127.0.0.1", path: "/",
  }]);
}

async function openWriter(page: Page, context: BrowserContext, width = 1440) {
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
}

async function pasteReplacingDocument(page: Page, text: string) {
  const editor = page.getByLabel("Editor de guion");
  await editor.click();
  await page.keyboard.press("Control+A");
  await editor.evaluate((element, value) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", value);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  }, text);
}

async function openManualFormat(page: Page) {
  await page.getByRole("button", { name: /FORMATO AUTOMÁTICO/ }).first().click();
  const dialog = page.locator(".writer-auto-format-dialog");
  await expect(dialog.getByRole("heading", { name: "Estructura detectada" })).toBeVisible();
  return dialog;
}

test("large paste supports both warnings, later recovery, one-step undo, and free repeated formatting", async ({ page, context }) => {
  const analysisRequests: string[] = [];
  page.on("request", (request) => {
    if (/assistant|guided-writing|setup-payoff|narrative-pulse/u.test(request.url()) && request.method() === "POST") analysisRequests.push(request.url());
  });
  await openWriter(page, context);
  await pasteReplacingDocument(page, screenplay);
  await expect(page.getByText("¿Quieres aplicar Formato Automático?", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "No, gracias" }).click();
  await expect(page.getByText("Continuar sin estructura limita el contexto disponible.")).toBeVisible();
  await page.getByRole("button", { name: "Continuar sin formato" }).click();
  await expect(page.getByLabel("Editor de guion")).toContainText("No deberíamos abrirla.");
  await expect(page.locator(".writer-observations-panel").getByText("Las herramientas de revisión necesitan identificar la estructura del guion.")).toBeVisible();

  const dialog = await openManualFormat(page);
  await expect(dialog.getByText("US$0", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Revisar", exact: true }).click();
  await dialog.getByRole("button", { name: "Aplicar formato revisado" }).click();
  const editor = page.getByLabel("Editor de guion");
  await expect(editor.locator('[data-screenplay-kind="sceneHeading"]')).toHaveCount(4);
  await expect(editor.locator('[data-screenplay-kind="character"]')).toHaveCount(1);
  await expect(editor).toContainText("No deberíamos abrirla.");
  await page.getByLabel("Deshacer", { exact: true }).click();
  await expect(editor.locator('[data-screenplay-kind="sceneHeading"]')).toHaveCount(0);
  await page.getByLabel("Rehacer", { exact: true }).click();
  await expect(editor.locator('[data-screenplay-kind="sceneHeading"]')).toHaveCount(4);

  for (let run = 0; run < 3; run += 1) {
    const readyDialog = await openManualFormat(page);
    await expect(readyDialog.getByText("Este documento ya parece estar correctamente formateado como guion.")).toBeVisible();
    await readyDialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  }
  expect(analysisRequests).toEqual([]);
  await expect(page.getByText(/compra créditos|sube de plan|te quedan/iu)).toHaveCount(0);
});

test("small paste stays quiet while first-warning acceptance unlocks structured views", async ({ page, context }) => {
  await page.route(`**/api/writer/scripts/${scriptId}/narrative-pulse`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        analysis: null,
        points: [],
        milestones: [],
        zones: [],
        currentSourceHash: "a".repeat(64),
      }),
    });
  });
  await openWriter(page, context);
  const editor = page.getByLabel("Editor de guion");
  await editor.click();
  await page.keyboard.press("End");
  await editor.evaluate((element) => {
    const transfer = new DataTransfer(); transfer.setData("text/plain", "Una frase breve.");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  });
  await expect(page.getByText("¿Quieres aplicar Formato Automático?", { exact: false })).toHaveCount(0);

  await pasteReplacingDocument(page, screenplay);
  await page.getByRole("button", { name: "Aplicar formato automático", exact: true }).click();
  const dialog = page.locator(".writer-auto-format-dialog");
  await expect(dialog.getByRole("heading", { name: "Estructura detectada" })).toBeVisible();
  await dialog.getByRole("button", { name: "Aplicar formato", exact: true }).click();
  await expect(editor.locator('[data-screenplay-kind="sceneHeading"]')).toHaveCount(4);
  await expect
    .poll(async () => {
      const response = await page.request.get("http://127.0.0.1:54329/__writer_state");
      const state = (await response.json()) as {
        document: { content: Array<{ attrs?: { kind?: string } }> };
      };
      return state.document.content.filter(
        (block) => block.attrs?.kind === "sceneHeading",
      ).length;
    })
      .toBe(4);
  await expect(page.locator(".writer-save-status")).toContainText(
    "Guardado en la nube",
    { timeout: 10_000 },
  );
  await expect(page.locator(".writer-timeline-panel")).toBeVisible();
  await page.locator(".writer-timeline-panel").getByRole("button", { name: "Narrative Pulse" }).click();
  await expect(page.getByRole("button", { name: /Analizar Narrative Pulse/ })).toBeEnabled();
});

test("desktop columns are full-height and mobile keeps drawers without horizontal overflow", async ({ page, context }) => {
  await openWriter(page, context, 1440);
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => {
      const workspace = document.querySelector(".writer-workspace")!.getBoundingClientRect();
      const left = document.querySelector(".writer-sidebar")!.getBoundingClientRect();
      const right = document.querySelector(".writer-observations-panel")!.getBoundingClientRect();
      const timeline = document.querySelector(".writer-timeline-panel")!.getBoundingClientRect();
      const editor = document.querySelector(".writer-editor-area")!.getBoundingClientRect();
      return { workspace, left, right, timeline, editor };
    });
    expect(Math.abs(geometry.left.bottom - geometry.workspace.bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.right.bottom - geometry.workspace.bottom)).toBeLessThanOrEqual(1);
    expect(geometry.timeline.left).toBeGreaterThanOrEqual(geometry.left.right - 1);
    expect(geometry.timeline.right).toBeLessThanOrEqual(geometry.right.left + 1);
    expect(Math.abs(geometry.timeline.left - geometry.editor.left)).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("separator").first()).toBeHidden();
  await page.getByRole("button", { name: "Más acciones de Writer" }).click();
  await expect(page.getByRole("dialog", { name: "Más acciones de Writer" }).getByRole("button", { name: /FORMATO AUTOMÁTICO/ })).toBeVisible();
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(overflow.width).toBeLessThanOrEqual(overflow.viewport + 1);
});
