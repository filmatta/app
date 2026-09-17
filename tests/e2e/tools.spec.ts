import { test, expect } from "@playwright/test";
test("public utilities calculate both directions and invalidate stale results", async ({
  page,
}) => {
  await page.goto("/tools/utilidades/obturacion");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByText("1/48 s", { exact: true })).toBeVisible();
  await page.getByLabel("Qué quieres convertir").selectOption("time");
  await expect(page.getByText("1/48 s", { exact: true })).toHaveCount(0);
  await page.getByLabel("Tiempo 1/x s").fill("50");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByText("172.8°", { exact: true })).toBeVisible();
  await page.getByLabel("Tiempo 1/x s").fill("12");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("no puede superar");
  await page.goto("/tools/utilidades/almacenamiento");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByText("45 GB", { exact: true }).first()).toBeVisible();
  await page.goto("/tools/utilidades/relacion-aspecto");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByText("1920 × 1080 px", { exact: true })).toBeVisible();
  await page.goto("/tools/utilidades/focal-equivalente");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByText("75 mm", { exact: true })).toBeVisible();
  await expect(page.getByText("50 mm", { exact: true })).toBeVisible();
});
test("Tools states and Jobs hierarchy lead to real public destinations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tools");
  await expect(page.getByText("Disponible", { exact: true })).toHaveCount(4);
  await expect(page.getByText("En desarrollo", { exact: true })).toHaveCount(2);
  await page
    .getByRole("button", { name: "Oportunidades", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Jobs", exact: true }),
  ).toHaveAttribute("href", "/descubre/jobs");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page
    .getByRole("link", { name: "FILMATTA Writer", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tools\/writer$/);
  await expect(page.getByText("En desarrollo", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("storage unit selection, MB/TB output and common aspect presets", async ({ page }) => {
  await page.goto("/tools/utilidades/almacenamiento");
  await page.getByLabel("Unidad de bitrate").selectOption("kbps");
  await page.getByLabel("Bitrate total").fill("8000");
  await page.getByLabel("Duración (min)").fill("1");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByText("60 MB", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Unidad de bitrate").selectOption("Gbps");
  await expect(page.getByText("60 MB", { exact: true })).toHaveCount(0);
  await page.getByLabel("Bitrate total").fill("8");
  await page.getByLabel("Duración (min)").fill("60");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByText("3.6 TB", { exact: true }).first()).toBeVisible();
  await page.goto("/tools/utilidades/relacion-aspecto");
  await page.getByLabel("Proporción común").selectOption("9:16");
  await page.getByLabel("Dimensión conocida (px)", { exact: true }).fill("1080");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByText("1080 × 1920 px", { exact: true })).toBeVisible();
});
