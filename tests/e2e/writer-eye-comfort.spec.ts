import { expect, test, type BrowserContext } from "@playwright/test";

const scriptId = "11111111-1111-4111-8111-111111111111";

test("eye comfort responds to pointer, keyboard, theme changes and reload", async ({ page, context }) => {
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await (context as BrowserContext).addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64({ access_token: token, refresh_token: "local-refresh", expires_at: 4102444800, token_type: "bearer", user: { id: scriptId } }), domain: "127.0.0.1", path: "/" }]);
  await page.goto(`/writer/${scriptId}`);
  await expect(page.getByLabel("Editor de guion")).toBeVisible();

  const eye = page.getByRole("button", { name: "Apariencia de Writer" });
  await eye.click();
  const popover = page.getByRole("dialog", { name: "Apariencia de Writer" });
  const checkbox = popover.getByRole("checkbox", { name: "Confort visual / filtro cálido" });
  const row = popover.locator(".writer-warm-toggle");
  await expect(checkbox).not.toBeChecked();
  for (let i = 0; i < 20; i++) {
    if (i % 2 === 0) await checkbox.click();
    else await row.click({ position: { x: 90, y: 10 } });
    if (i % 2 === 0) await expect(checkbox).toBeChecked();
    else await expect(checkbox).not.toBeChecked();
    await expect(popover).toBeVisible();
  }
  for (const skin of ["Carbon", "Marino", "Cream"]) {
    await popover.getByRole("radio", { name: skin }).click();
    await checkbox.focus();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Space");
      if (i % 2 === 0) await expect(checkbox).toBeChecked();
      else await expect(checkbox).not.toBeChecked();
    }
  }
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await page.reload();
  await expect(page.locator(".writer-workspace")).toHaveAttribute("data-writer-warm-filter", "true");
  await eye.click();
  await expect(popover.getByRole("radio", { name: "Cream" })).toHaveAttribute("aria-checked", "true");
  await eye.click();
  await expect(popover).toHaveCount(0);
  await eye.click();
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await eye.click();
  await page.getByLabel("Editor de guion").click();
  await expect(popover).toHaveCount(0);

  await eye.click();
  const storageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") storageErrors.push(message.text()); });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.includes("writer.appearance")) throw new Error("Synthetic storage failure");
      return original.call(this, key, value);
    };
  });
  await popover.getByRole("checkbox", { name: "Confort visual / filtro cálido" }).click();
  await expect(popover.getByRole("checkbox", { name: "Confort visual / filtro cálido" })).not.toBeChecked();
  await expect(popover.getByRole("alert")).toContainText("No se pudo guardar");
  expect(storageErrors.some((message) => message.includes("Could not save Writer appearance preference"))).toBe(true);
});
