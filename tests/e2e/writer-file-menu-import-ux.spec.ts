import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";

const scriptId = "11111111-1111-4111-8111-111111111111";
const actionId = "11111111-1111-4111-8111-111111111102";

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64({
    access_token: token,
    refresh_token: "local-refresh",
    expires_at: 4102444800,
    token_type: "bearer",
    user: { id: scriptId },
  }), domain: "127.0.0.1", path: "/" }]);
}

async function openWriter(page: Page, context: BrowserContext) {
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
}

test.beforeEach(async ({ page, context }) => openWriter(page, context));

test("application menus keep one surface open and preserve the screenplay context", async ({ page }) => {
  const menuBar = page.getByLabel("Menú de aplicación de Writer");
  await page.locator(`[data-block-id="${actionId}"]`).click();

  await menuBar.getByRole("button", { name: "Archivo", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Archivo" })).toBeVisible();
  await menuBar.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Archivo" })).toHaveCount(0);
  const edit = page.getByRole("menu", { name: "Editar" });
  await expect(edit).toBeVisible();
  await edit.getByText("Cambiar tipo de bloque", { exact: true }).click();
  await expect(edit.getByRole("menuitem", { name: "Acción", exact: true }).last()).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(edit).toHaveCount(0);

  await menuBar.getByRole("button", { name: "Archivo", exact: true }).click();
  await page.getByRole("menu", { name: "Archivo" }).getByRole("menuitem", { name: "Importar guion…" }).click();
  await expect(page.getByRole("dialog", { name: "Importar guion" })).toBeVisible();
  await page.getByRole("dialog", { name: "Importar guion" }).getByRole("button", { name: "Cerrar" }).click();

  await menuBar.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByRole("menu", { name: "Editar" }).getByRole("menuitem", { name: "Buscar…" }).click();
  await expect(page.getByRole("dialog", { name: "Buscar en Writer" })).toBeVisible();
});

test("Shotlist query failure is not presented as Generate and Cream keeps readable contrast", async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
  await page.route(`**/api/writer/scripts/${scriptId}/shotlists`, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "fixture" }) }));
  await page.reload();
  const assistant = page.getByRole("complementary", { name: "Asistente" });
  await expect(assistant.getByRole("button", { name: "Reintentar consulta de Shotlist" })).toBeVisible();
  await expect(assistant.getByRole("button", { name: "GENERAR SHOTLIST" })).toHaveCount(0);

  const menuBar = page.getByLabel("Menú de aplicación de Writer");
  await menuBar.getByRole("button", { name: "Ver", exact: true }).click();
  const view = page.getByRole("menu", { name: "Ver" });
  await view.getByText("Apariencia", { exact: true }).click();
  await view.getByRole("menuitemcheckbox", { name: "Cream" }).click();
  await expect(page.locator(".writer-workspace")).toHaveAttribute("data-writer-skin", "cream");
  await page.waitForTimeout(250);

  const ratios = await page.evaluate(() => {
    const luminance = (rgb: string) => {
      const values = rgb.match(/[\d.]+/gu)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      const linear = values.map((value) => {
        const channel = value / 255;
        return channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    };
    return [".writer-scene-link", ".writer-sidebar-title strong", ".writer-shotlist-footer-button"].map((selector) => {
      const node = document.querySelector<HTMLElement>(selector)!;
      const style = getComputedStyle(node);
      let parent: HTMLElement | null = node;
      let background = style.backgroundColor;
      while (parent && (background === "rgba(0, 0, 0, 0)" || background === "transparent")) {
        parent = parent.parentElement;
        if (parent) background = getComputedStyle(parent).backgroundColor;
      }
      const foregroundL = luminance(style.color);
      const backgroundL = luminance(background);
      return { selector, color: style.color, background, ratio: (Math.max(foregroundL, backgroundL) + .05) / (Math.min(foregroundL, backgroundL) + .05) };
    });
  });
  for (const result of ratios) expect(result.ratio, `${result.selector}: ${result.color} on ${result.background}`).toBeGreaterThanOrEqual(4.5);
});

test("final menu and header geometry stay inside the viewport at approved widths", async ({ page }) => {
  const evidence = "test-results/writer-file-menu-import-ux";
  fs.mkdirSync(evidence, { recursive: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const geometry = await page.locator(".writer-app-menu, .writer-header, .writer-editor-area, .writer-toolbar").evaluateAll((nodes) => nodes
      .filter((node) => (node as HTMLElement).getClientRects().length > 0)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { className: (node as HTMLElement).className, left: rect.left, right: rect.right, width: rect.width };
      }));
    for (const rect of geometry) {
      expect(rect.left, `${viewport.width}px ${rect.className}`).toBeGreaterThanOrEqual(-1);
      expect(rect.right, `${viewport.width}px ${rect.className}`).toBeLessThanOrEqual(viewport.width + 1);
      expect(rect.width, `${viewport.width}px ${rect.className}`).toBeLessThanOrEqual(viewport.width + 1);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Apariencia de Writer" }).click();
  await page.getByRole("dialog", { name: "Apariencia de Writer" }).getByRole("radio", { name: "Cream" }).click();
  await page.keyboard.press("Escape");
  await page.getByLabel("Menú de aplicación de Writer").getByRole("button", { name: "Archivo", exact: true }).click();
  await page.screenshot({ path: `${evidence}/writer-cream-menu-1440x900.png` });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  const notice = page.getByRole("dialog", { name: "Writer en móvil" });
  if (await notice.isVisible()) await notice.getByRole("button", { name: "Entendido" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${evidence}/writer-mobile-390x844.png` });
});
