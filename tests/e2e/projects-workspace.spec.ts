import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const multipleProjects = {
  frequency: "22222222-2222-4222-8222-222222222222",
  spot: "44444444-4444-4444-8444-444444444444",
  documentary: "55555555-5555-4555-8555-555555555555",
};

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
    await expect(page.getByRole("heading", { name: "Tus proyectos", exact: true })).toBeVisible();
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

test("selecting a Project keeps the list visible and synchronizes the URL and inspector", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-multiple");
  await page.goto("/create");
  const list = page.getByRole("table", { name: "Tus proyectos" });
  const inspector = page.getByRole("region", { name: "Detalles del proyecto" });
  await expect(list.getByRole("link", { name: "Seleccionar LA FRECUENCIA" })).toBeVisible();
  await expect(list.getByRole("link", { name: "Seleccionar SPOT OTOÑO" })).toBeVisible();
  await expect(list.getByRole("link", { name: "Seleccionar DOCUMENTAL SUR" })).toBeVisible();

  const selectSpot = list.getByRole("link", { name: "Seleccionar SPOT OTOÑO" });
  await selectSpot.focus();
  await expect(selectSpot).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/create\\?project=${multipleProjects.spot}$`));
  await expect(selectSpot).toHaveAttribute("aria-current", "true");
  await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toBeVisible();
  await expect(list.getByRole("link", { name: "Seleccionar LA FRECUENCIA" })).toBeVisible();

  await page.reload();
  await expect(list.getByRole("link", { name: "Seleccionar SPOT OTOÑO" })).toHaveAttribute("aria-current", "true");
  await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toBeVisible();
  await list.getByRole("link", { name: "Abrir SPOT OTOÑO" }).click();
  await expect(page).toHaveURL(new RegExp(`/create/projects/${multipleProjects.spot}$`));
  await expect(page.getByRole("heading", { level: 1, name: "SPOT OTOÑO" })).toBeVisible();
});

test("search and sort keep selection tied to the Project, never to a hidden row", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-multiple");
  await page.goto(`/create?project=${multipleProjects.spot}`);
  const list = page.getByRole("table", { name: "Tus proyectos" });
  const inspector = page.getByRole("region", { name: "Detalles del proyecto" });
  const selected = list.getByRole("link", { name: "Seleccionar SPOT OTOÑO" });
  await expect(selected).toHaveAttribute("aria-current", "true");
  await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Ordenar proyectos" }).selectOption("name");
  await expect.poll(async () => list.getByRole("link", { name: /^Seleccionar / }).evaluateAll((links) =>
    links.map((link) => link.getAttribute("aria-label")))).toEqual([
      "Seleccionar DOCUMENTAL SUR", "Seleccionar LA FRECUENCIA", "Seleccionar SPOT OTOÑO",
    ]);
  await expect(selected).toHaveAttribute("aria-current", "true");
  await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Buscar proyectos" });
  await search.fill("DOCUMENTAL");
  await expect(list.getByRole("link", { name: "Seleccionar DOCUMENTAL SUR" })).toBeVisible();
  await expect(list.getByRole("link", { name: "Seleccionar SPOT OTOÑO" })).toHaveCount(0);
  await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toHaveCount(0);
  await list.getByRole("link", { name: "Seleccionar DOCUMENTAL SUR" }).click();
  await expect(page).toHaveURL(new RegExp(`/create\\?project=${multipleProjects.documentary}&q=DOCUMENTAL&sort=name$`));
  await expect(list.getByRole("link", { name: "Seleccionar DOCUMENTAL SUR" })).toHaveAttribute("aria-current", "true");
  await expect(inspector.getByText("DOCUMENTAL SUR", { exact: true })).toBeVisible();
  await expect(search).toHaveValue("DOCUMENTAL");
  await search.fill("SIN RESULTADOS");
  await expect(page.getByText("No encontramos proyectos con ese nombre.")).toBeVisible();
  await expect(inspector.getByText("DOCUMENTAL SUR", { exact: true })).toHaveCount(0);
});

test("master-detail remains usable and contained at each review width", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-multiple");
  for (const width of [1536, 1280, 1024, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/create?project=${multipleProjects.documentary}`);
    const list = page.getByRole("table", { name: "Tus proyectos" });
    const details = width <= 1180
      ? page.locator("details").filter({ has: page.locator("summary", { hasText: "Detalles del proyecto" }) })
      : null;
    if (details) {
      await expect(details.locator("summary")).toBeVisible();
      if (width === 390) {
        await details.locator("summary").focus();
        await page.keyboard.press("Enter");
      } else {
        await details.locator("summary").click();
      }
      await expect(details).toHaveAttribute("open", "");
    }
    const inspector = page.getByRole("region", { name: "Detalles del proyecto" });
    await expect(list.getByRole("link", { name: "Seleccionar DOCUMENTAL SUR" })).toHaveAttribute("aria-current", "true");
    await expect(inspector.getByText("DOCUMENTAL SUR", { exact: true })).toBeVisible();
    await inspector.scrollIntoViewIfNeeded();
    const box = await inspector.boundingBox();
    expect(box, `inspector box at ${width}px`).not.toBeNull();
    expect(box!.x, `inspector left at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `inspector right at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `dashboard overflow at ${width}px`).toBe(true);
    await page.screenshot({ path: `test-results/projects-master-detail-${width}.png`, fullPage: true });
    await list.getByRole("link", { name: "Seleccionar SPOT OTOÑO" }).click();
    await expect(page).toHaveURL(new RegExp(`/create\\?project=${multipleProjects.spot}$`));
    await expect(list.getByRole("link", { name: "Seleccionar SPOT OTOÑO" })).toHaveAttribute("aria-current", "true");
    if (details && (await details.getAttribute("open")) === null) {
      await details.locator("summary").click();
      await expect(details).toHaveAttribute("open", "");
    }
    await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toBeVisible();
    await expect(list.getByRole("link", { name: "Abrir SPOT OTOÑO" })).toBeVisible();
  }
});

test("selected Project shows source-backed progress and a recent Production Pack export", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-metrics");
  await page.goto(`/create?project=${multipleProjects.frequency}`);

  const progress = page.getByRole("region", { name: "Estado del proyecto" });
  const metric = (label: string) => progress.getByRole("link").filter({ has: page.getByRole("heading", { name: label, exact: true }) });
  await expect(metric("Guion")).toContainText("2 escenas");
  await expect(metric("Shotlist")).toContainText("1 de 2 escenas");
  await expect(metric("Storyboard")).toContainText("1 de 2 planos");
  await expect(metric("Producción")).toContainText("1 de 2 planos");

  const documents = page.getByRole("region", { name: "Documentos recientes" });
  const pack = documents.getByRole("link", { name: /Production Pack/ });
  await expect(pack).toContainText("Plan de rodaje");
  await expect(pack).toContainText("v1.2");
  await expect(pack).toHaveAttribute("href", `/create/projects/${multipleProjects.frequency}/documents?production=88888888-8888-4888-8888-888888888888`);
  await expect(documents.getByText("Aún no hay exportaciones registradas.", { exact: false })).toHaveCount(0);
});

test("direct URL for another Project reveals no private workspace", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-populated");
  const response = await page.goto("/create/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("LA FRECUENCIA")).toHaveCount(0);
});
