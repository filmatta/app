import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=published");
});

test("desktop search, filters, detail return and empty state use URL params", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/oportunidades");

  await expect(
    page.getByRole("heading", { name: "Buscar oportunidades" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Convocatoria de prueba local/ }),
  ).toBeVisible();

  const form = page.getByRole("form", {
    name: "Buscar y filtrar oportunidades",
  });
  await form.getByRole("textbox", { name: "Buscar oportunidades" }).fill("sonido");
  await form.getByLabel("Categoría").selectOption("crew");
  await form.getByLabel("Ciudad").fill("México");
  await form.getByLabel("Compensación").selectOption("paid");
  await form.getByLabel("Modalidad").selectOption("remote");
  await form.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(
    /q=sonido.*category=crew.*city=M%C3%A9xico.*compensation=paid.*workMode=remote/,
  );

  await page
    .getByRole("link", { name: /Convocatoria de prueba local/ })
    .click();
  await expect(
    page.getByRole("link", { name: "Todas las oportunidades" }),
  ).toHaveAttribute("href", /q=sonido/);

  await page.goto("/oportunidades?q=sin-resultados");
  await expect(
    page.getByText("No encontramos oportunidades con estos filtros."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Limpiar filtros" })).toBeVisible();
});

test("mobile keeps search visible and opens filters in a drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/oportunidades?q=sonido");

  await expect(page.getByLabel("Buscar por rol, producción o ciudad")).toBeVisible();
  await page.getByRole("button", { name: /Filtros/ }).click();

  const dialog = page.getByRole("dialog", { name: "Filtros" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Modalidad").selectOption("remote");
  await dialog.getByRole("button", { name: "Ver resultados" }).click();
  await expect(page).toHaveURL(/q=sonido.*workMode=remote/);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});
