import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

const scriptId = "11111111-1111-4111-8111-111111111111";
const mockUrl = "http://127.0.0.1:54329";

type Rectangle = { x: number; y: number; width: number; height: number };
type WriterState = { revision: number; document: unknown; saves: number };

async function openWriter(page: Page, context: BrowserContext, width: number, height: number) {
  await page.request.get(`${mockUrl}/__scenario?value=writer-ux`);
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
  await page.setViewportSize({ width, height });
  await page.goto(`/writer/${scriptId}`);
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
}

async function rectangle(locator: Locator, label: string): Promise<Rectangle> {
  const box = await locator.boundingBox();
  expect(box, label).not.toBeNull();
  return box!;
}

function expectSameCoordinates(actual: Rectangle, baseline: Rectangle, keys: Array<keyof Rectangle>, label: string) {
  for (const key of keys) {
    expect(Math.abs(actual[key] - baseline[key]), `${label}: ${key}`).toBeLessThanOrEqual(0.5);
  }
}

async function expectBarStillAt(bar: Locator, baseline: Rectangle, label: string) {
  expectSameCoordinates(await rectangle(bar, label), baseline, ["x", "y"], label);
}

async function expectButtonGeometryStable(page: Page, button: Locator, label: string) {
  await expect(button).toBeVisible();
  const baseline = await rectangle(button, `${label} baseline`);

  await button.hover();
  expectSameCoordinates(await rectangle(button, `${label} hover`), baseline, ["x", "y", "width", "height"], `${label} hover`);

  await button.focus();
  expectSameCoordinates(await rectangle(button, `${label} focus`), baseline, ["x", "y", "width", "height"], `${label} focus`);

  await page.mouse.move(baseline.x + baseline.width / 2, baseline.y + baseline.height / 2);
  await page.mouse.down();
  try {
    expectSameCoordinates(await rectangle(button, `${label} pressed`), baseline, ["x", "y", "width", "height"], `${label} pressed`);
  } finally {
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
  expectSameCoordinates(await rectangle(button, `${label} released`), baseline, ["x", "y", "width", "height"], `${label} released`);
  return baseline;
}

async function writerState(page: Page): Promise<WriterState> {
  const response = await page.request.get(`${mockUrl}/__writer_state`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<WriterState>;
}

function expectUnchangedScript(after: WriterState, before: WriterState) {
  expect(after.revision).toBe(before.revision);
  expect(after.document).toEqual(before.document);
  expect(after.saves).toBe(before.saves);
}

test("desktop Action Bar and critical buttons keep their geometry through panels and appearance changes", async ({ page, context }, testInfo) => {
  await openWriter(page, context, 1440, 900);
  const workspace = page.locator(".writer-workspace");
  const bar = page.locator(".writer-header-actions");
  const barBaseline = await rectangle(bar, "desktop Action Bar baseline");

  const appearanceButton = page.getByRole("button", { name: "Apariencia de Writer" });
  const exportButton = page.locator(".writer-header-actions .writer-export-wrap > button");
  const tagButton = page.getByRole("button", { name: "Etiquetar elemento" });
  await expectButtonGeometryStable(page, appearanceButton, "desktop appearance button");
  await expectButtonGeometryStable(page, exportButton, "desktop export button");
  const tagBaseline = await expectButtonGeometryStable(page, tagButton, "desktop tag button");
  await tagButton.click();
  await expect(tagButton).toHaveAttribute("aria-pressed", "true");
  expectSameCoordinates(await rectangle(tagButton, "desktop tag active"), tagBaseline, ["x", "y", "width", "height"], "desktop tag active");
  await tagButton.click();
  await expect(tagButton).toHaveAttribute("aria-pressed", "false");

  const panelToggles = page.getByRole("group", { name: "Paneles de Writer" }).getByRole("button");
  for (const [index, label] of [[0, "left panel"], [1, "Assistant panel"]] as const) {
    const toggle = panelToggles.nth(index);
    const initial = await toggle.getAttribute("aria-pressed");
    expect(initial).toMatch(/^(true|false)$/);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", initial === "true" ? "false" : "true");
    await expectBarStillAt(bar, barBaseline, `${label} hidden`);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", initial!);
    await expectBarStillAt(bar, barBaseline, `${label} restored`);
  }

  const timeline = page.locator(".writer-header .writer-timeline-button");
  const timelineInitiallyOpen = await timeline.getAttribute("aria-expanded");
  await timeline.click();
  await expect(timeline).toHaveAttribute("aria-expanded", timelineInitiallyOpen === "true" ? "false" : "true");
  await expectBarStillAt(bar, barBaseline, "Timeline toggled");
  await timeline.click();
  await expect(timeline).toHaveAttribute("aria-expanded", timelineInitiallyOpen!);
  await expectBarStillAt(bar, barBaseline, "Timeline restored");

  const beforeAppearance = await writerState(page);
  await testInfo.attach("desktop-before-appearance", { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
  await appearanceButton.click();
  const appearance = page.getByRole("dialog", { name: "Apariencia de Writer" });
  for (const [skin, value] of [["Marino", "navy"], ["Cream", "cream"], ["Carbon", "carbon"]] as const) {
    await appearance.getByRole("radio", { name: skin }).click();
    await expect(workspace).toHaveAttribute("data-writer-skin", value);
    await expectBarStillAt(bar, barBaseline, `${skin} Action Bar`);
  }
  await page.keyboard.press("Escape");
  await expect(appearance).toHaveCount(0);
  expectUnchangedScript(await writerState(page), beforeAppearance);
  await testInfo.attach("desktop-after-appearance", { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
});

test("mobile Action Bar and critical buttons keep their geometry through drawers and appearance changes", async ({ page, context }, testInfo) => {
  await page.addInitScript((id) => localStorage.setItem(`filmatta.writer.mobile-notice.v1:${id}`, "dismissed"), scriptId);
  await openWriter(page, context, 390, 844);
  const workspace = page.locator(".writer-workspace");
  const bar = page.getByRole("navigation", { name: "Navegación de Writer" });
  const barBaseline = await rectangle(bar, "mobile Action Bar baseline");
  await expect(page.locator(".writer-header-actions")).toBeHidden();

  const more = page.getByRole("button", { name: "Más acciones de Writer" });
  const navigate = page.getByRole("button", { name: /^Navegar/ });
  const tag = page.getByRole("button", { name: "Etiquetar elemento" });
  const moreBaseline = await expectButtonGeometryStable(page, more, "mobile more button");
  const navigateBaseline = await expectButtonGeometryStable(page, navigate, "mobile navigate button");
  const tagBaseline = await expectButtonGeometryStable(page, tag, "mobile tag button");
  await tag.click();
  await expect(tag).toHaveAttribute("aria-pressed", "true");
  expectSameCoordinates(await rectangle(tag, "mobile tag active"), tagBaseline, ["x", "y", "width", "height"], "mobile tag active");
  await tag.click();
  await expect(tag).toHaveAttribute("aria-pressed", "false");

  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  expectSameCoordinates(await rectangle(more, "mobile more expanded"), moreBaseline, ["x", "y", "width", "height"], "mobile more expanded");
  await page.getByRole("dialog", { name: "Más acciones de Writer" }).getByRole("button", { name: "Cerrar" }).click();
  await expectBarStillAt(bar, barBaseline, "mobile actions closed");

  await navigate.click();
  await expect(navigate).toHaveAttribute("aria-expanded", "true");
  expectSameCoordinates(await rectangle(navigate, "mobile navigation expanded"), navigateBaseline, ["x", "y", "width", "height"], "mobile navigation expanded");
  await page.getByRole("dialog", { name: "Navegar por el guion" }).getByRole("button", { name: "Escenas" }).click();
  await expectBarStillAt(bar, barBaseline, "scene drawer opened");
  await page.locator(".writer-sidebar").getByRole("button", { name: "Cerrar" }).click();
  await expectBarStillAt(bar, barBaseline, "scene drawer closed");

  await navigate.click();
  await page.getByRole("dialog", { name: "Navegar por el guion" }).getByRole("button", { name: /Asistente/ }).click();
  await expectBarStillAt(bar, barBaseline, "Assistant drawer opened");
  await page.getByRole("complementary", { name: "Asistente" }).getByRole("button", { name: "Cerrar", exact: true }).click();
  await expectBarStillAt(bar, barBaseline, "Assistant drawer closed");

  const beforeAppearance = await writerState(page);
  await testInfo.attach("mobile-before-appearance", { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
  const menuBar = page.getByLabel("Menú de aplicación de Writer");
  for (const [skin, value] of [["Marino", "navy"], ["Cream", "cream"], ["Carbon", "carbon"]] as const) {
    await menuBar.getByRole("button", { name: "Ver", exact: true }).click();
    await page.getByRole("menu", { name: "Ver" }).getByRole("menuitem", { name: "Apariencia" }).click();
    await page.getByRole("menu", { name: "Apariencia" }).getByRole("menuitemcheckbox", { name: skin }).click();
    await expect(workspace).toHaveAttribute("data-writer-skin", value);
    await expectBarStillAt(bar, barBaseline, `${skin} mobile Action Bar`);
  }
  expectUnchangedScript(await writerState(page), beforeAppearance);
  await testInfo.attach("mobile-after-appearance", { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
});

test("Cream application menu keeps flat options without changing their hit boxes", async ({ page, context }) => {
  await openWriter(page, context, 1440, 900);
  await page.getByRole("button", { name: "Apariencia de Writer" }).click();
  await page.getByRole("dialog", { name: "Apariencia de Writer" }).getByRole("radio", { name: "Cream" }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const item = page.getByRole("menu", { name: "Editar" }).getByRole("menuitem", { name: "Buscar…" });
  const baseline = await rectangle(item, "Cream menu item");
  const colors = await item.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderTopColor };
  });
  expect(colors.background).toBe("rgba(0, 0, 0, 0)");
  expect(colors.border).toBe("rgba(0, 0, 0, 0)");

  await item.hover();
  expectSameCoordinates(await rectangle(item, "Cream menu item hover"), baseline, ["x", "y", "width", "height"], "Cream menu item hover");
});
