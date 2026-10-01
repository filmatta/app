import { expect, test } from "@playwright/test";

const fixtureOrigin =
  process.env.PROFILES_FIXTURE_ORIGIN ?? "http://127.0.0.1:54329";

async function expectContainedProfileCatalog(page: import("@playwright/test").Page) {
  const geometry = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const describe = (element: Element) => {
      const htmlElement = element as HTMLElement;
      return `${element.tagName.toLowerCase()}${htmlElement.id ? `#${htmlElement.id}` : ""}${
        typeof htmlElement.className === "string" && htmlElement.className.trim()
          ? `.${htmlElement.className.trim().split(/\s+/).join(".")}`
          : ""
      }`;
    };
    const toRect = (rect: DOMRect) => ({
      left: rect.left,
      right: rect.right,
      width: rect.width,
    });
    const visibleElements = [...document.querySelectorAll("body *")]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const offenders = visibleElements
      .filter(
        ({ rect }) =>
          rect.left < -1 ||
          rect.right > viewportWidth + 1 ||
          rect.width > viewportWidth + 1,
      )
      .map(({ element, rect }) => ({ element: describe(element), rect: toRect(rect) }));
    const clipped = visibleElements.flatMap(({ element, rect }) => {
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (
          ![style.overflow, style.overflowX].some((value) =>
            ["hidden", "clip"].includes(value),
          )
        ) {
          continue;
        }
        const ancestorRect = ancestor.getBoundingClientRect();
        if (ancestorRect.left - rect.left > 1 || rect.right - ancestorRect.right > 1) {
          return [{
            element: describe(element),
            ancestor: describe(ancestor),
            rect: toRect(rect),
            ancestorRect: toRect(ancestorRect),
            overflow: style.overflow,
            overflowX: style.overflowX,
          }];
        }
      }
      return [];
    });
    const mainBlocks = [
      ".profile-catalog",
      ".profile-search",
      ".profile-search-layout",
      ".profile-filter-sidebar",
      ".profile-search-results",
      ".profile-grid",
      ".profile-catalog-footer",
    ].flatMap((selector) => {
      const element = document.querySelector(selector);
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      return [{ selector, rect: toRect(rect) }];
    });

    return {
      viewportWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders,
      clipped,
      mainBlocks,
    };
  });

  expect(geometry.offenders, JSON.stringify(geometry, null, 2)).toEqual([]);
  expect(geometry.clipped, JSON.stringify(geometry, null, 2)).toEqual([]);
  expect(geometry.scrollWidth, JSON.stringify(geometry, null, 2)).toBeLessThanOrEqual(
    geometry.clientWidth + 1,
  );
  for (const block of geometry.mainBlocks) {
    expect(block.rect.left, JSON.stringify(geometry, null, 2)).toBeGreaterThanOrEqual(-1);
    expect(block.rect.right, JSON.stringify(geometry, null, 2)).toBeLessThanOrEqual(
      geometry.viewportWidth + 1,
    );
    expect(block.rect.width, JSON.stringify(geometry, null, 2)).toBeLessThanOrEqual(
      geometry.viewportWidth + 1,
    );
  }
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
    await expectContainedProfileCatalog(page);

    if (width === 390) {
      await page.getByRole("button", { name: /^Filtros/ }).click();
      await expect(page.getByRole("dialog", { name: "Filtros" })).toBeVisible();
      await expectContainedProfileCatalog(page);
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
