import { expect, test, type BrowserContext } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=empty");
});

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

test("public CREATE home communicates real and conceptual states without marketplace navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "De la primera página al set." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Crear proyecto y empezar/ }).first()).toHaveAttribute("href", "/create");
  await expect(page.getByText("STORYBOARD · EN DESARROLLO")).toBeVisible();
  await expect(page.getByText("PRODUCTION · EN DESARROLLO")).toBeVisible();

  const header = page.locator("header.global-header");
  for (const label of ["Perfiles", "Oportunidades", "Locaciones", "Marketplace", "Servicios"]) {
    await expect(header.getByText(label, { exact: true })).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("authenticated dashboard and CREATE menu expose only owned creation surfaces", async ({ page, context }) => {
  await session(context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/cuenta");
  await expect(page.getByRole("heading", { level: 1, name: "¿En qué vas a trabajar hoy?" })).toBeVisible();
  await expect(page.getByText("Todavía no tienes guiones.")).toBeVisible();
  await expect(page.getByText("Todavía no tienes shotlists.")).toBeVisible();

  await expect(page.getByRole("link", { name: /Crear proyecto/ }).first()).toHaveAttribute("href", "/create");
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page.getByRole("link", { name: /Empezar una idea/ })).toHaveAttribute("href", "/crear");
  await expect(page.getByRole("link", { name: /Nuevo guion/ })).toHaveAttribute("href", "/writer");
  await expect(page.getByRole("link", { name: /Nueva shotlist/ })).toHaveAttribute("href", "/shotlists");
  for (const label of ["Proyecto", "Oportunidad", "Locación", "Servicio"]) {
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  }

  await page.goto("/writer");
  await expect(page.getByRole("heading", { level: 1, name: "Mis guiones" })).toBeVisible();
  await page.goto("/shotlists");
  await expect(page.getByRole("heading", { level: 1, name: "Shotlists" })).toBeVisible();
});

test("legacy marketplace routes remain directly addressable", async ({ page }) => {
  for (const route of ["/perfiles", "/locaciones", "/oportunidades", "/marketplace"]) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page).toHaveURL(new RegExp(`${route.replace("/", "\\/")}(?:\\?|$)`));
  }
});

test("anonymous Writer and Shotlist access preserve login redirects", async ({ page }) => {
  await page.goto("/writer");
  await expect(page).toHaveURL(/\/login\?next=%2Fwriter|\/login\?next=\/writer/);
  await page.goto("/shotlists");
  await expect(page).toHaveURL(/\/login\?next=%2Fshotlists|\/login\?next=\/shotlists/);
});
