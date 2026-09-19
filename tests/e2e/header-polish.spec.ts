import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=empty");
});

async function authenticatedSession(context: BrowserContext) {
  const b64 = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "11111111-1111-4111-8111-111111111111", exp: 4102444800, role: "authenticated", test_role: "user", user_metadata: { full_name: "Alain T." } })}.local-signature`;
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: "base64-" + b64({
        access_token: token,
        refresh_token: "local-refresh",
        expires_at: 4102444800,
        token_type: "bearer",
        user: { id: "11111111-1111-4111-8111-111111111111", user_metadata: { full_name: "Alain T." } },
      }),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
}

async function openPanel(page: Page, name: string) {
  const trigger = page.getByRole("button", { name, exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const id = await trigger.getAttribute("aria-controls");
  expect(id).toBeTruthy();
  const panel = page.locator(`#${id}`);
  await expect(panel).toBeVisible();
  return { panel, trigger };
}

test("desktop panels connect to the header and preserve their editorial widths", async ({ page, context }) => {
  await authenticatedSession(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const header = page.locator("header.global-header");

  for (const [name, expectedWidth, file] of [
    ["Perfiles", 320, "perfiles"],
    ["Oportunidades", 440, "oportunidades"],
    ["Tools", 600, "tools"],
    ["Mi cuenta", 280, "mi-cuenta"],
  ] as const) {
    const { panel } = await openPanel(page, name);
    await page.waitForTimeout(200);
    const [headerBox, panelBox] = await Promise.all([header.boundingBox(), panel.boundingBox()]);
    expect(headerBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    const headerGap = panelBox!.y - (headerBox!.y + headerBox!.height);
    expect(headerGap).toBeGreaterThanOrEqual(-2);
    expect(headerGap).toBeLessThanOrEqual(2);
    expect(Math.abs(panelBox!.width - expectedWidth)).toBeLessThanOrEqual(6);
    await page.screenshot({
      path: `docs/review/header-polish/${file}-1440.png`,
      fullPage: false,
      style: "nextjs-portal { visibility: hidden; }",
    });
    await page.keyboard.press("Escape");
  }

  await page.goto("/tools/writer");
  const { panel } = await openPanel(page, "Tools");
  await page.waitForTimeout(200);
  const [contextHeaderBox, contextPanelBox] = await Promise.all([
    header.boundingBox(),
    panel.boundingBox(),
  ]);
  expect(contextHeaderBox).not.toBeNull();
  expect(contextPanelBox).not.toBeNull();
  expect(contextPanelBox!.y - (contextHeaderBox!.y + contextHeaderBox!.height)).toBeGreaterThanOrEqual(-2);
  expect(contextPanelBox!.y - (contextHeaderBox!.y + contextHeaderBox!.height)).toBeLessThanOrEqual(2);
});

test("desktop dropdown switching, outside click and Escape stay predictable", async ({ page, context }) => {
  await authenticatedSession(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const profiles = await openPanel(page, "Perfiles");
  const opportunities = await openPanel(page, "Oportunidades");
  await expect(profiles.panel).toBeHidden();
  await expect(opportunities.panel).toBeVisible();
  await page.locator("main").click({ position: { x: 20, y: 200 } });
  await expect(opportunities.panel).toBeHidden();
  const account = await openPanel(page, "Mi cuenta");
  await expect(account.panel.getByText("Preview User", { exact: true })).toBeVisible();
  await expect(account.panel.locator(".account-avatar")).toHaveText("PU");
  await page.keyboard.press("Escape");
  await expect(account.trigger).toBeFocused();
});

test("header stays aligned at desktop breakpoints and the mobile drawer keeps its account block", async ({ page, context }) => {
  await authenticatedSession(context);
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1440) {
      const nav = page.getByRole("navigation", { name: "Navegación principal", exact: true });
      const centers = await nav.locator(":scope > ul > li > :is(a, .nav-disclosure-root) .nav-trigger, :scope > ul > li > a.nav-trigger").evaluateAll(elements =>
        elements.map(element => {
          const box = element.getBoundingClientRect();
          return box.y + box.height / 2;
        }),
      );
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Menú/ }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Preview User", { exact: true })).toBeVisible();
  await expect(drawer.locator(".account-avatar")).toHaveText("PU");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "docs/review/header-polish/mobile-account-390.png",
    fullPage: false,
    style: "nextjs-portal { visibility: hidden; }",
  });
});
