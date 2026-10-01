import { expect, test } from "@playwright/test";

const fixtureOrigin =
  process.env.PROFILES_FIXTURE_ORIGIN ?? "http://127.0.0.1:54329";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

test.beforeEach(async ({ request }) => {
  await request.get(`${fixtureOrigin}/__scenario?value=profiles-polish`);
});

test("search, chips and profile return keep URL state", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/perfiles");

  await page.getByLabel("¿Qué o quién buscas?").fill("Elena");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(/\/perfiles\?q=Elena/);
  await expect(page.locator(".profile-card")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Ver perfil de Elena/ })).toBeVisible();

  await page.getByRole("link", { name: /Ver perfil de Elena/ }).click();
  await expect(page.getByRole("link", { name: "← Volver a resultados" })).toBeVisible();
  await page.getByRole("link", { name: "← Volver a resultados" }).click();
  await expect(page).toHaveURL(/\/perfiles\?q=Elena/);

  await page.getByRole("link", { name: /Búsqueda: Elena/ }).click();
  await expect(page).toHaveURL(/\/perfiles$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/perfiles\?q=Elena/);
});

test("desktop filters and mobile sheet remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/perfiles");
  const sidebar = page.locator(".profile-filter-sidebar");
  await expect(sidebar).toBeVisible();
  await sidebar
    .getByRole("combobox", { name: "Ciudad", exact: true })
    .selectOption("Guadalajara");
  await sidebar
    .getByRole("combobox", { name: "Disponibilidad", exact: true })
    .selectOption("available");
  await sidebar.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/city=Guadalajara/);
  await expect(page).toHaveURL(/availability=available/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/perfiles");
  await page.getByRole("button", { name: /^Filtros/ }).click();
  const dialog = page.getByRole("dialog", { name: "Filtros" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "Disciplina", exact: true })
    .selectOption("Modelaje");
  await dialog.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/discipline=Modelaje/);
  await expect(page.locator(".profile-card")).toHaveCount(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});

test("profiles catalog stays within the viewport across supported widths", async ({ page }) => {
  for (const width of [390, 768, 1024, 1280, 1440, 1680, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/perfiles");
    await expect(page.getByRole("heading", { name: "Encuentra a la persona indicada." })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    if (width === 390) {
      await page.getByRole("button", { name: /^Filtros/ }).click();
      await expect(page.getByRole("dialog", { name: "Filtros" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.getByRole("button", { name: "Cerrar filtros" }).click();
    }
  }
});

test("no-result searches have a specific recovery state", async ({ page }) => {
  await page.goto("/perfiles?q=persona-inexistente");
  await expect(
    page.getByRole("heading", {
      name: "No encontramos perfiles con estos filtros.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Limpiar filtros" }).click();
  await expect(page).toHaveURL(/\/perfiles$/);
});
