import { expect, test, type BrowserContext } from "@playwright/test";
import fs from "node:fs";

const scriptId = "11111111-1111-4111-8111-111111111111";
const evidence = "docs/review/writer-writing-ux-v1";

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{
    name: "sb-127-auth-token",
    value: "base64-" + b64({
      access_token: token,
      refresh_token: "local-refresh",
      expires_at: 4102444800,
      token_type: "bearer",
      user: { id: scriptId },
    }),
    domain: "127.0.0.1",
    path: "/",
  }]);
}

test.beforeEach(async ({ request, context }) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
});

test("context actions, assisted insertion, live metrics and reload use the canonical document", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/writer/${scriptId}`);
  const editor = page.getByLabel("Editor de guion");
  await expect(editor).toBeVisible();

  const action = editor.locator('[data-block-id$="02"]');
  await action.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Acciones del bloque" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: /Acción — actual/ })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitemradio", { name: /Transición/ }).click();
  await expect(action).toHaveAttribute("data-screenplay-kind", "transition");

  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: /Encabezado de escena — actual/ })).toHaveAttribute("aria-checked", "true");
  await expect(menu.locator("button").first()).toBeFocused();
  await menu.press("2");
  const firstBlock = editor.locator("[data-screenplay-kind]").first();
  await expect(firstBlock).toHaveAttribute("data-screenplay-kind", "action");
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(firstBlock).toHaveAttribute("data-screenplay-kind", "sceneHeading");

  await action.click({ button: "right" });
  await menu.getByRole("menuitem", { name: /Nueva escena/ }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva escena" });
  await dialog.getByLabel("Lugar").fill("Cocina");
  await dialog.getByLabel("Momento").selectOption("NOCHE");
  await expect(dialog.getByText("INT. COCINA - NOCHE")).toBeVisible();
  await dialog.getByRole("button", { name: "Insertar encabezado" }).click();
  await expect(editor.locator('[data-screenplay-kind="sceneHeading"]')).toHaveCount(2);
  await expect(editor.getByText("INT. COCINA - NOCHE")).toBeVisible();

  const ana = page.getByRole("button", { name: /ANA 1 interv\. · 1 escenas/ });
  await ana.click();
  await expect(page.getByText("Menciones textuales").locator("..").getByText("2")).toBeVisible();

  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel("Editor de guion").getByText("INT. COCINA - NOCHE")).toBeVisible();
});

test("writing presentation remains usable at desktop, tablet and phone widths", async ({ page }) => {
  fs.mkdirSync(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel("Editor de guion")).toBeVisible();
    await expect(page.getByRole("button", { name: "Insertar en el guion" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Deshacer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rehacer" })).toBeVisible();
    if (width <= 900) {
      await expect(page.getByRole("button", { name: "Escenas", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Personajes", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Personajes", exact: true }).click();
      await expect(page.getByText("Personajes identificados")).toBeVisible();
      await page.getByRole("button", { name: "Cerrar" }).click();
      await expect(page.locator(".writer-sidebar")).not.toHaveClass(/writer-sidebar--open/);
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: `${evidence}/writer-${width}.png`, fullPage: true });
  }
});
