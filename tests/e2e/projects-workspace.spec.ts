import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "11111111-1111-4111-8111-111111111111", exp: 4102444800, role: "authenticated", test_role: "user" })}.local-signature`;
  await context.addCookies([{
    name: "sb-127-auth-token",
    value: "base64-" + b64({
      access_token: token,
      refresh_token: "local-refresh",
      expires_at: 4102444800,
      token_type: "bearer",
      user: { id: "11111111-1111-4111-8111-111111111111" },
    }),
    domain: "127.0.0.1",
    path: "/",
  }]);
}

async function scenario(page: Page, value: string) {
  await page.request.get(`http://127.0.0.1:54329/__scenario?value=${value}`);
}

test("empty account creates each entry type without auto-opening a module", async ({ page, context }) => {
  await session(context);
  for (const [label, code] of [["Guion", "writer"], ["Shotlist", "shotlist"], ["Storyboard", "storyboard"], ["Producción", "production"]] as const) {
    await scenario(page, "workspace-empty");
    await page.goto("/create");
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Crear proyecto" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^${label}\\b`) }).click();
    await expect(page.getByRole("heading", { name: "Ponle nombre a tu proyecto" })).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(`Comenzar con: ${label}`);
    await page.getByLabel("Nombre del proyecto").fill(`QA ${code}`);
    await page.getByRole("dialog").getByRole("button", { name: "Crear proyecto" }).click();
    await expect(page).toHaveURL(/\/create$/);
    await expect(page.getByRole("link", { name: `Abrir QA ${code}` })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("a[href^='/writer/']")).toHaveCount(0);
  }
});

test("Project navigation exposes Documents and unavailable Pack at desktop and mobile sizes", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-populated");
  for (const width of [1536, 1280, 1024, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/create");
    await expect(page.getByRole("link", { name: "Abrir LA FRECUENCIA" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `dashboard width ${width}`).toBe(true);
    await page.screenshot({ path: `test-results/projects-dashboard-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "Abrir LA FRECUENCIA" }).click();
    await expect(page.getByRole("heading", { name: "LA FRECUENCIA" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `project width ${width}`).toBe(true);
    await page.screenshot({ path: `test-results/projects-overview-${width}.png`, fullPage: true });
    if (width === 390) {
      await page.getByText("Sección: Overview").click();
      await page.getByRole("navigation", { name: "Secciones del proyecto en móvil" }).getByRole("link", { name: "Documentos" }).click();
    } else {
      await page.getByRole("navigation", { name: "Secciones del proyecto" }).getByRole("link", { name: "Documentos" }).click();
    }
    await expect(page).toHaveURL(/\/create\/projects\/[0-9a-f-]+\/documents$/);
    await expect(page.getByRole("heading", { level: 1, name: "Documentos" })).toBeVisible();
    await expect(page.getByText("Production Pack").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `documents width ${width}`).toBe(true);
    await page.screenshot({ path: `test-results/projects-documents-${width}.png`, fullPage: true });
  }
});

test("direct URL for another Project reveals no private workspace", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-populated");
  const response = await page.goto("/create/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("LA FRECUENCIA")).toHaveCount(0);
});
