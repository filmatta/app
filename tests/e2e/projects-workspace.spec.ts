import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

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

function projectRow(list: Locator, name: string) {
  return list.getByRole("row", { name: `Seleccionar ${name}` });
}

test("empty account offers guided script creation without auto-opening a module", async ({ page, context }) => {
  await session(context);
  for (const [label, code, intention] of [["Quiero escribir un guion nuevo", "new-script", "new_script"], ["Ya tengo un guion o borrador", "existing-script", "existing_script"]] as const) {
    await scenario(page, "workspace-empty");
    await page.goto("/create");
    await expect(page.getByRole("heading", { name: "Tus proyectos", exact: true })).toBeVisible();
    const selector = page.locator("dialog.create-project-dialog");
    await expect(selector).toBeVisible();
    await selector.getByRole("button", { name: new RegExp(`^${label}`) }).click();
    await page.getByRole("dialog", { name: "Crear tu proyecto" }).getByRole("button", { name: "Crear mi primer proyecto" }).click();
    await expect(page.getByRole("heading", { name: "Ponle nombre a tu proyecto" })).toBeVisible();
    await page.getByLabel("Nombre del proyecto").fill(`QA ${code}`);
    await selector.getByRole("button", { name: "Crear proyecto" }).click();
    await expect(page).toHaveURL(new RegExp(`/create/projects/33333333-3333-4333-8333-333333333333\\?onboarding=${intention}$`));
    await expect(page.locator("a[href^='/writer/']")).toHaveCount(0);
  }
});

test("first-run Explore closes the selector and Create project opens it again", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-empty");
  await page.goto("/create");
  const selector = page.locator("dialog.create-project-dialog");
  await expect(selector).toBeVisible();
  await selector.getByRole("button", { name: "Explorar por mi cuenta" }).click();
  await expect(selector).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Tus proyectos", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(selector.getByRole("heading", { name: "¿Dónde estás con tu proyecto?" })).toBeVisible();
});

test("Project navigation exposes Documents and unavailable Pack at desktop and mobile sizes", async ({ page, context }, testInfo) => {
  await session(context);
  await scenario(page, "workspace-populated");
  for (const width of [1536, 1280, 1024, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/create");
    await expect(page.getByRole("link", { name: "Abrir LA FRECUENCIA" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `dashboard width ${width}`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`projects-dashboard-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "Abrir LA FRECUENCIA" }).click();
    await expect(page.getByRole("heading", { name: "LA FRECUENCIA" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `project width ${width}`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`projects-overview-${width}.png`), fullPage: true });
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
    await page.screenshot({ path: testInfo.outputPath(`projects-documents-${width}.png`), fullPage: true });
  }
});

test("selecting A then B updates detail, inspector, Overview, and Documents without navigation", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-master-detail");
  await page.goto("/create");
  const list = page.getByRole("table", { name: "Tus proyectos" });
  const detail = page.locator(".create-selected-main");
  const inspector = page.locator(".create-dashboard-inspector-desktop").getByRole("region", { name: "Detalles del proyecto" });
  const progress = page.getByRole("region", { name: "Estado del proyecto" });
  const documents = page.getByRole("region", { name: "Documentos recientes" });
  const metric = (label: string) => progress.getByRole("link").filter({ has: page.getByRole("heading", { name: label, exact: true }) });
  const selectFrequency = projectRow(list, "LA FRECUENCIA");
  const selectSpot = projectRow(list, "SPOT OTOÑO");
  await expect(page).toHaveURL(/\/create$/);
  await expect(selectFrequency).toHaveAttribute("aria-selected", "true");
  await expect(detail.getByRole("heading", { name: "LA FRECUENCIA" })).toBeVisible();
  await expect(inspector.getByText("LA FRECUENCIA", { exact: true })).toBeVisible();
  await expect(metric("Guion")).toContainText("2 escenas");
  await expect(metric("Shotlist")).toContainText("1 de 2 escenas");
  await expect(documents.getByRole("link", { name: /Production Pack/ })).toContainText("v1.2");

  await selectSpot.focus();
  await expect(selectSpot).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/create$/);
  await expect(selectSpot).toHaveAttribute("aria-selected", "true");
  await expect(detail.getByRole("heading", { name: "SPOT OTOÑO" })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "LA FRECUENCIA" })).toHaveCount(0);
  await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toBeVisible();
  await expect(inspector.getByText("LA FRECUENCIA", { exact: true })).toHaveCount(0);
  await expect(metric("Guion")).toContainText("1 escena");
  await expect(metric("Shotlist")).toContainText("1 de 1 escena");
  await expect(metric("Storyboard")).toContainText("0 de 1 plano");
  await expect(metric("Producción")).toContainText("0 de 1 plano");
  const spotPack = documents.getByRole("link", { name: /Production Pack/ });
  await expect(spotPack).toContainText("Plan comercial");
  await expect(spotPack).toContainText("v2.1");
  await expect(spotPack).toHaveAttribute("href", `/create/projects/${multipleProjects.spot}/documents?production=88888888-8888-4888-8888-888888888889`);
  await expect(documents.getByText("Plan de rodaje", { exact: true })).toHaveCount(0);

  await selectFrequency.click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(selectFrequency).toHaveAttribute("aria-selected", "true");
  await expect(detail.getByRole("heading", { name: "LA FRECUENCIA" })).toBeVisible();
  await expect(inspector.getByText("LA FRECUENCIA", { exact: true })).toBeVisible();
  await expect(metric("Guion")).toContainText("2 escenas");
  await expect(documents.getByRole("link", { name: /Production Pack/ })).toContainText("v1.2");
  await expect(documents.getByText("Plan comercial", { exact: true })).toHaveCount(0);

  await list.getByRole("link", { name: "Abrir SPOT OTOÑO" }).click();
  await expect(page).toHaveURL(new RegExp(`/create/projects/${multipleProjects.spot}$`));
  await expect(page.getByRole("heading", { level: 1, name: "SPOT OTOÑO" })).toBeVisible();
});

test("rapid A to B to A selection ignores the delayed B response", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-master-detail");
  let captureDelayedRequest!: () => void;
  let releaseDelayedRequest!: () => void;
  const delayedRequest = new Promise<void>((resolve) => { captureDelayedRequest = resolve; });
  const release = new Promise<void>((resolve) => { releaseDelayedRequest = resolve; });
  await page.route(`**/api/create/projects/${multipleProjects.spot}/summary`, async (route) => {
    captureDelayedRequest();
    await release;
    try { await route.continue(); } catch { /* The prior selection may cancel this request. */ }
  });
  await page.goto("/create");
  const list = page.getByRole("table", { name: "Tus proyectos" });
  await projectRow(list, "SPOT OTOÑO").click();
  await delayedRequest;
  await projectRow(list, "LA FRECUENCIA").click();
  releaseDelayedRequest();
  const detail = page.locator(".create-selected-main");
  const inspector = page.locator(".create-dashboard-inspector-desktop").getByRole("region", { name: "Detalles del proyecto" });
  const documents = page.getByRole("region", { name: "Documentos recientes" });
  await expect(page).toHaveURL(/\/create$/);
  await expect(projectRow(list, "LA FRECUENCIA")).toHaveAttribute("aria-selected", "true");
  await expect(detail.getByRole("heading", { name: "LA FRECUENCIA" })).toBeVisible();
  await expect(inspector.getByText("LA FRECUENCIA", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Estado del proyecto" }).getByText("2 escenas", { exact: true })).toBeVisible();
  await expect(documents.getByRole("link", { name: /Production Pack/ })).toContainText("v1.2");
  await expect(detail.getByRole("heading", { name: "SPOT OTOÑO" })).toHaveCount(0);
  await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toHaveCount(0);
  await expect(documents.getByText("Plan comercial", { exact: true })).toHaveCount(0);
});

test("failed selection shows only the selected Project and recovers on retry", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-master-detail");
  let failOnce = true;
  await page.route(`**/api/create/projects/${multipleProjects.spot}/summary`, async (route) => {
    if (failOnce) {
      failOnce = false;
      await route.fulfill({ status: 503, body: "Unavailable" });
    } else {
      await route.continue();
    }
  });
  await page.goto("/create");
  const spot = projectRow(page.getByRole("table", { name: "Tus proyectos" }), "SPOT OTOÑO");
  await spot.click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(spot).toHaveAttribute("aria-selected", "true");
  const selectionAlert = page.locator(".create-dashboard-select-prompt[role='alert']");
  await expect(selectionAlert).toContainText("SPOT OTOÑO");
  await expect(selectionAlert).toContainText("No pudimos cargar el resumen");
  await expect(page.locator(".create-dashboard-inspector-desktop")).toContainText("SPOT OTOÑO");
  await expect(page.locator(".create-dashboard-inspector-desktop")).not.toContainText("LA FRECUENCIA");
  await expect(page.getByRole("region", { name: "Estado del proyecto" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Documentos recientes" })).toHaveCount(0);
  await spot.click();
  await expect(page.locator(".create-selected-main").getByRole("heading", { name: "SPOT OTOÑO" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Documentos recientes" }).getByRole("link", { name: /Production Pack/ })).toContainText("v2.1");
});

test("only explicit module tabs navigate away from the selected dashboard Project", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-master-detail");
  const cases = [
    ["Guion", new RegExp(`/writer/66666666-6666-4666-8666-666666666667\\?project=${multipleProjects.spot}$`)],
    ["Shotlist", new RegExp(`/shotlists/77777777-7777-4777-8777-777777777778\\?project=${multipleProjects.spot}$`)],
    ["Storyboard", new RegExp(`/shotlists/77777777-7777-4777-8777-777777777778/storyboard\\?project=${multipleProjects.spot}$`)],
    ["Producción", new RegExp(`/production/88888888-8888-4888-8888-888888888889\\?project=${multipleProjects.spot}$`)],
    ["Documentos", new RegExp(`/create/projects/${multipleProjects.spot}/documents$`)],
  ] as const;

  for (const [label, destination] of cases) {
    await page.goto("/create");
    await projectRow(page.getByRole("table", { name: "Tus proyectos" }), "SPOT OTOÑO").click();
    await expect(page).toHaveURL(/\/create$/);
    await expect(page.locator(".create-selected-project").getByRole("heading", { name: "SPOT OTOÑO" })).toBeVisible();
    await page.getByRole("navigation", { name: "Secciones del proyecto seleccionado" }).getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(destination);
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  }
});

test("search and sort keep selection tied to the Project, never to a hidden row", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-multiple");
  await page.goto("/create");
  const list = page.getByRole("table", { name: "Tus proyectos" });
  const inspector = page.locator(".create-dashboard-inspector-desktop").getByRole("region", { name: "Detalles del proyecto" });
  const selected = projectRow(list, "SPOT OTOÑO");
  await selected.click();
  await expect(selected).toHaveAttribute("aria-selected", "true");
  await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Ordenar proyectos" }).selectOption("name");
  await expect.poll(async () => list.getByRole("row", { name: /^Seleccionar / }).evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("aria-label")))).toEqual([
      "Seleccionar DOCUMENTAL SUR", "Seleccionar LA FRECUENCIA", "Seleccionar SPOT OTOÑO",
    ]);
  await expect(selected).toHaveAttribute("aria-selected", "true");
  await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Buscar proyectos" });
  await search.fill("DOCUMENTAL");
  await expect(projectRow(list, "DOCUMENTAL SUR")).toBeVisible();
  await expect(projectRow(list, "SPOT OTOÑO")).toHaveCount(0);
  await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toHaveCount(0);
  await projectRow(list, "DOCUMENTAL SUR").click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(projectRow(list, "DOCUMENTAL SUR")).toHaveAttribute("aria-selected", "true");
  await expect(inspector.getByText("DOCUMENTAL SUR", { exact: true })).toBeVisible();
  await expect(search).toHaveValue("DOCUMENTAL");
  await search.fill("SIN RESULTADOS");
  await expect(page.getByText("No encontramos proyectos con ese nombre.")).toBeVisible();
  await expect(inspector.getByText("DOCUMENTAL SUR", { exact: true })).toHaveCount(0);
});

test("master-detail remains usable and contained at each review width", async ({ page, context }, testInfo) => {
  await session(context);
  await scenario(page, "workspace-multiple");
  for (const width of [1536, 1280, 1024, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/create");
    const list = page.getByRole("table", { name: "Tus proyectos" });
    await projectRow(list, "DOCUMENTAL SUR").click();
    await expect(page).toHaveURL(/\/create$/);
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
    await expect(projectRow(list, "DOCUMENTAL SUR")).toHaveAttribute("aria-selected", "true");
    await expect(inspector.getByText("DOCUMENTAL SUR", { exact: true })).toBeVisible();
    await inspector.scrollIntoViewIfNeeded();
    const box = await inspector.boundingBox();
    expect(box, `inspector box at ${width}px`).not.toBeNull();
    expect(box!.x, `inspector left at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `inspector right at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `dashboard overflow at ${width}px`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`projects-master-detail-${width}.png`), fullPage: true });
    await projectRow(list, "SPOT OTOÑO").click();
    await expect(page).toHaveURL(/\/create$/);
    await expect(projectRow(list, "SPOT OTOÑO")).toHaveAttribute("aria-selected", "true");
    if (details) await expect(details).toHaveAttribute("open", "");
    await expect(inspector.getByText("SPOT OTOÑO", { exact: true })).toBeVisible();
    await expect(list.getByRole("link", { name: "Abrir SPOT OTOÑO" })).toBeVisible();
  }
});

test("selected Project shows source-backed progress and a recent Production Pack export", async ({ page, context }) => {
  await session(context);
  await scenario(page, "workspace-metrics");
  await page.goto("/create");

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
