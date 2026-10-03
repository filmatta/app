import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const scriptId = "11111111-1111-4111-8111-111111111111";

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{
    name: "sb-127-auth-token",
    value: "base64-" + b64({ access_token: token, refresh_token: "local-refresh", expires_at: 4102444800, token_type: "bearer", user: { id: scriptId } }),
    domain: "127.0.0.1",
    path: "/",
  }]);
}

async function openWriter(page: Page, context: BrowserContext) {
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
}

test("Breakdown progressively overflows and keeps a category selected from Más visible", async ({ page, context }) => {
  await openWriter(page, context);
  const splitter = page.getByRole("separator", { name: "Cambiar ancho del panel de escenas" });
  const tabs = page.getByRole("tablist", { name: "Categorías de elementos detectados" });

  await splitter.focus();
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab")).toHaveCount(7);
  await expect(tabs.getByRole("button", { name: "Más categorías" })).toHaveCount(0);

  await splitter.focus();
  await page.keyboard.press("Home");
  await expect.poll(() => tabs.getByRole("tab").count()).toBeGreaterThanOrEqual(2);
  const visibleCount = await tabs.getByRole("tab").count();
  const more = tabs.getByRole("button", { name: "Más categorías" });
  await expect(more).toBeVisible();
  await more.click();
  const menu = tabs.getByRole("menu", { name: "Más categorías" });
  await expect(menu.getByRole("menuitemradio")).toHaveCount(7 - visibleCount);
  await menu.getByRole("menuitemradio", { name: /Vehículos/ }).click();
  await expect(tabs.getByRole("tab", { name: "Vehículos" })).toBeVisible();
  await expect(menu).toHaveCount(0);
  await expect(tabs).toHaveAttribute("data-visible-category-count", String(visibleCount));
  await expect.poll(() => tabs.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});

test("help geometry stays fixed and the appearance popover dismisses like a non-modal popover", async ({ page, context }) => {
  await openWriter(page, context);
  await page.getByRole("navigation", { name: "Secciones del Asistente" }).getByRole("button", { name: "Guía" }).click();
  const help = page.getByRole("button", { name: /Ayuda sobre GUÍA/ });
  const before = await help.boundingBox();
  await help.hover();
  const hovered = await help.boundingBox();
  await help.focus();
  const focused = await help.boundingBox();
  await help.click();
  const opened = await help.boundingBox();
  expect([hovered, focused, opened].every((box) => box?.width === before?.width && box?.height === before?.height)).toBe(true);
  await expect(page.locator(".writer-assistant-help")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".writer-assistant-help")).toHaveCount(0);
  await expect(help).toBeFocused();

  const appearance = page.getByRole("button", { name: "Apariencia de Writer" });
  await appearance.click();
  const popover = page.getByRole("dialog", { name: "Apariencia de Writer" });
  await popover.getByRole("radio", { name: "Cream" }).click();
  await expect(popover).toBeVisible();
  await expect(page.locator(".writer-workspace")).toHaveAttribute("data-writer-skin", "cream");
  await page.getByLabel("Editor de guion").click();
  await expect(popover).toHaveCount(0);

  await appearance.click();
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(appearance).toBeFocused();
});

test("Cream keeps button borders visible and uses a distinct warm-gray screenplay sheet", async ({ page, context }) => {
  await openWriter(page, context);
  await page.getByRole("button", { name: "Apariencia de Writer" }).click();
  await page.getByRole("dialog", { name: "Apariencia de Writer" }).getByRole("radio", { name: "Cream" }).click();
  await page.keyboard.press("Escape");
  const button = page.getByRole("banner").getByRole("button", { name: "Timeline", exact: true });
  const before = await button.evaluate((node) => ({ border: getComputedStyle(node).borderColor, background: getComputedStyle(node).backgroundColor }));
  await button.hover();
  const after = await button.evaluate((node) => ({ border: getComputedStyle(node).borderColor, background: getComputedStyle(node).backgroundColor }));
  expect(after.border).not.toBe("rgba(0, 0, 0, 0)");
  expect(after.background).not.toBe(before.background);
  await expect(page.locator(".writer-paper .tiptap")).toHaveCSS("background-color", "rgb(239, 237, 231)");
  await expect(page.locator(".writer-paper")).not.toHaveCSS("background-color", "rgb(239, 237, 231)");

  const comfort = page.getByLabel("Confort visual / filtro cálido");
  if (!await comfort.isVisible()) await page.getByRole("button", { name: "Apariencia de Writer" }).click();
  await comfort.check();
  await page.reload();
  await expect(page.locator(".writer-workspace")).toHaveAttribute("data-writer-skin", "cream");
  await expect(page.locator(".writer-workspace")).toHaveAttribute("data-writer-warm-filter", "true");
  await expect(page.locator(".writer-paper .tiptap")).toHaveCSS("background-color", "rgb(239, 237, 231)");
});
