import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=profiles-polish");
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
