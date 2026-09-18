import { test, expect, type BrowserContext } from "@playwright/test";

// Local transport sessions exercise the existing server role lookup; no remote Auth.
async function session(context: BrowserContext, role: "user" | "admin") {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "11111111-1111-4111-8111-111111111111", exp: 4102444800, role: "authenticated", test_role: role })}.local-signature`;
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64({ access_token: token, refresh_token: "local-refresh", expires_at: 4102444800, token_type: "bearer", user: { id: "11111111-1111-4111-8111-111111111111" } }), domain: "127.0.0.1", path: "/" }]);
}

for (const role of ["user", "admin"] as const) {
  test(`account ${role}: desktop panel, shared alignment and screenshots`, async ({ page, context }) => {
    await session(context, role);
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/mis-servicios");
      const trigger = page.getByRole("button", { name: "Mi cuenta", exact: true });
      await trigger.click();
      const panel = page.getByRole("navigation", { name: "Menú de cuenta", exact: true });
      await expect(panel).toBeVisible();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      const id = await trigger.getAttribute("aria-controls");
      const bounds = await page.locator(`[id="${id}"]`).boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(240);
      expect(bounds!.width).toBeLessThanOrEqual(280);
      const button = await trigger.boundingBox();
      expect(Math.abs(bounds!.x + bounds!.width - button!.x - button!.width)).toBeLessThan(1);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1000);
      await expect(panel.getByRole("link", { name: "Mis servicios", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(panel.getByText("Mi FILMATTA", { exact: false })).toBeVisible();
      await expect(panel.getByRole("link", { name: "Panel admin", exact: true })).toHaveCount(role === "admin" ? 1 : 0);
      const alignment = await page.locator(".global-header-inner").evaluate(header => {
        const visible = [...header.querySelectorAll<HTMLElement>(".nav-trigger")].filter(el => el.getClientRects().length);
        return visible.map(el => {
          const rect = el.getBoundingClientRect();
          const text = el.querySelector("span")?.firstChild ?? el.firstChild;
          const range = document.createRange();
          range.selectNodeContents(text!);
          const label = range.getBoundingClientRect();
          const caret = el.querySelector("svg")?.getBoundingClientRect();
          return { label: el.textContent, center: rect.y + rect.height / 2, height: rect.height, baselineBox: label.bottom, caretCenter: caret ? caret.y + caret.height / 2 : null };
        });
      });
      for (const item of alignment) {
        expect(item.height).toBe(44);
        expect(Math.abs(item.center - alignment[0].center)).toBeLessThan(1);
        expect(Math.abs(item.baselineBox - alignment[0].baselineBox)).toBeLessThan(1);
        if (item.caretCenter !== null) expect(Math.abs(item.caretCenter - item.center)).toBeLessThan(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `docs/review/account-dropdown-${role}-${width}.png`, animations: "disabled", style: "nextjs-portal{visibility:hidden}" });
    }
  });
}

test("account click outside, Escape, Tab and route navigation", async ({ page, context }) => {
  await session(context, "admin");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tools");
  const trigger = page.getByRole("button", { name: "Mi cuenta", exact: true });
  const panel = page.getByRole("navigation", { name: "Menú de cuenta", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("link", { name: "Mi perfil profesional", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(panel).not.toBeVisible();
  const links = [
    ["Mi perfil profesional", "/mi-perfil"], ["Mis locaciones", "/mis-locaciones"],
    ["Mis servicios", "/mis-servicios"], ["Mi aprendizaje", "/cuenta#mis-cursos"],
    ["Mi suscripción", "/cuenta/suscripcion"], ["Configuración / cuenta", "/cuenta#configuracion"], ["Panel admin", "/admin"],
  ];
  for (const [label, href] of links) {
    await page.goto("/tools");
    await trigger.click();
    await panel.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(`http://127.0.0.1:3105${href}`);
    await expect(panel).not.toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (href.includes("#")) {
      await trigger.click();
      await expect(panel.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "location");
      await page.keyboard.press("Escape");
    }
  }
  await page.goto("/tools");
  await trigger.click();
  await panel.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3105/");
});

test("mobile keeps account links in its existing drawer only", async ({ page, context }) => {
  await session(context, "user");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools");
  await expect(page.getByRole("button", { name: "Mi cuenta", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Menú", exact: false }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("link", { name: "Mis servicios", exact: true })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Administrar FILMATTA" })).toHaveCount(0);
  await drawer.getByRole("link", { name: "Mis servicios", exact: true }).click();
  await expect(page).toHaveURL(/\/mis-servicios$/);
  await expect(drawer).not.toBeVisible();
});
