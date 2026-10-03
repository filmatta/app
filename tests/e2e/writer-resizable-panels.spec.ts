import { expect, test, type BrowserContext, type Page } from "@playwright/test";

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

async function openWriter(page: Page, context: BrowserContext, width = 1440) {
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
}

async function width(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => Math.round(element.getBoundingClientRect().width));
}

test("desktop splitters drag, persist, reset, protect the editor and survive Focus", async ({ page, context }) => {
  await openWriter(page, context);
  expect(await page.evaluate(() => window.innerWidth)).toBe(1440);
  const stateBeforeResize = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  const left = page.getByRole("separator", { name: "Cambiar ancho del panel de escenas" });
  await expect(left).toBeVisible();
  await expect(left).toHaveAttribute("aria-valuenow", "264");

  const leftBox = await left.boundingBox();
  expect(leftBox).not.toBeNull();
  await page.mouse.move(leftBox!.x + leftBox!.width / 2, leftBox!.y + 100);
  await page.mouse.down();
  await page.mouse.move(leftBox!.x + 88, leftBox!.y + 100, { steps: 4 });
  await page.mouse.up();
  expect(Number(await left.getAttribute("aria-valuenow"))).toBeGreaterThan(330);
  const desktopLayout = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>(".writer-workspace")!;
    return {
      viewport: window.innerWidth,
      variable: workspace.style.getPropertyValue("--writer-left-panel-width"),
      columns: getComputedStyle(workspace).gridTemplateColumns,
      sidebar: document.querySelector(".writer-sidebar")!.getBoundingClientRect().width,
    };
  });
  expect(desktopLayout.sidebar, JSON.stringify(desktopLayout)).toBeGreaterThan(330);

  const right = page.getByRole("separator", { name: "Cambiar ancho del Asistente" });
  if (!await right.isVisible()) await page.getByRole("button", { name: "Asistente", exact: true }).click();
  await expect(right).toBeVisible();
  await right.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(right).toHaveAttribute("aria-valuenow", "376");
  expect(await width(page, ".writer-editor-area")).toBeGreaterThanOrEqual(520);
  const stateAfterResize = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(stateAfterResize.saves).toBe(stateBeforeResize.saves);
  expect(stateAfterResize.revision).toBe(stateBeforeResize.revision);

  await page.reload();
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
  const restoredRight = page.getByRole("separator", { name: "Cambiar ancho del Asistente" });
  if (!await restoredRight.isVisible()) await page.getByRole("button", { name: "Asistente", exact: true }).click();
  await expect.poll(() => width(page, ".writer-sidebar")).toBeGreaterThan(330);
  await expect(restoredRight).toHaveAttribute("aria-valuenow", "376");

  await page.getByRole("separator", { name: "Cambiar ancho del panel de escenas" }).dblclick();
  await expect.poll(() => width(page, ".writer-sidebar")).toBe(264);
  await page.getByRole("separator", { name: "Cambiar ancho del Asistente" }).dblclick();
  await expect.poll(() => width(page, ".writer-observations-panel")).toBe(360);

  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(left).toBeHidden();
  await expect(right).toBeHidden();
  await page.getByRole("button", { name: "Salir de Focus", exact: true }).click();
  await expect(page.getByRole("separator", { name: "Cambiar ancho del panel de escenas" })).toBeVisible();

  const overflow = await page.evaluate(() => {
    const viewport = window.innerWidth;
    return [...document.querySelectorAll(".writer-workspace, .writer-sidebar, .writer-editor-area, .writer-observations-panel")]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.left < -1 || rect.right > viewport + 1 || rect.width > viewport + 1).length;
  });
  expect(overflow).toBe(0);
});

test("compact and mobile Writer keep drawers and expose no active splitters or overflow", async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem(`filmatta.writer.mobile-notice.v1:${scriptId}`, "dismissed"));
  await openWriter(page, context, 390);
  await expect(page.getByRole("separator").first()).toBeHidden();
  const notice = page.getByRole("dialog", { name: "Writer en móvil" });
  if (await notice.isVisible()) await notice.getByRole("button", { name: "Entendido" }).click();
  await page.getByRole("button", { name: /Navegar/ }).click();
  await page.getByRole("dialog", { name: "Navegar por el guion" }).getByRole("button", { name: "Escenas" }).click();
  await expect(page.locator(".writer-sidebar")).toHaveClass(/writer-sidebar--open/);
  await page.locator(".writer-sidebar").getByRole("button", { name: "Cerrar" }).click();

  const geometry = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const offenders = [...document.querySelectorAll(".writer-workspace, .writer-editor-area, .writer-paper-sheet")]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.left < -1 || rect.right > viewport + 1 || rect.width > viewport + 1);
    return { offenders: offenders.length, scrollWidth: document.documentElement.scrollWidth, viewport };
  });
  expect(geometry.offenders).toBe(0);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport + 1);

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.getByRole("separator").first()).toBeHidden();
});
