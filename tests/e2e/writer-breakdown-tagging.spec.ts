import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import type { WriterBreakdownElement } from "../../lib/writer/production";

const scriptId = "11111111-1111-4111-8111-111111111111";
const sceneId = "11111111-1111-4111-8111-111111111101";
const actionId = "11111111-1111-4111-8111-111111111102";

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64({ access_token: token, refresh_token: "local-refresh", expires_at: 4102444800, token_type: "bearer", user: { id: scriptId } }), domain: "127.0.0.1", path: "/" }]);
}

test("Etiquetar creates a manual occurrence without changing screenplay text and survives reload/reanalysis", async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
  const elements: WriterBreakdownElement[] = [];
  const posted: Array<Record<string, unknown>> = [];
  await page.route(`**/api/writer/scripts/${scriptId}/breakdown`, async (route: Route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ elements, pendingCount: 0, analysis: null }) });
    }
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    posted.push(payload);
    if (payload.action === "removeManualAppearance") {
      const element = elements.find((item) => item.id === payload.elementId);
      if (element) element.appearances = element.appearances.filter((item) => item.id !== payload.appearanceId);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ saved: true, breakdown: { elements, pendingCount: 0, analysis: null } }) });
    }
    if (payload.action === "manual") {
      const name = String(payload.name);
      const existing = elements.find((element) => element.name === name && element.category === payload.category);
      if (existing) {
        existing.appearances.push({ id: crypto.randomUUID(), sceneId, blockId: actionId, excerpt: name, nature: "inferred", fromOffset: Number(payload.fromOffset), toOffset: Number(payload.toOffset), sourceRevision: 2, stale: false, manual: true });
      } else {
        elements.push({ id: crypto.randomUUID(), scriptId, category: payload.category as WriterBreakdownElement["category"], name, status: "confirmed", source: "user", canonicalIdentityKey: null, note: null, assetId: null, fingerprint: `user:${name}`, revision: 1, appearances: [{ id: crypto.randomUUID(), sceneId, blockId: actionId, excerpt: name, nature: "inferred", fromOffset: Number(payload.fromOffset), toOffset: Number(payload.toOffset), sourceRevision: 2, stale: false, manual: true }] });
      }
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ created: true, reused: Boolean(existing), breakdown: { elements, pendingCount: 0, analysis: null } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ detected: 0, breakdown: { elements, pendingCount: 0, analysis: null } }) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  const action = page.locator(`p[data-block-id="${actionId}"]`);
  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Sobre la repisa descansa un prisma de obsidiana");
  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube");
  const before = await action.textContent();
  await page.getByRole("button", { name: "Etiquetar elemento" }).click();
  await expect(page.getByRole("button", { name: "Etiquetar elemento" })).toHaveAttribute("aria-pressed", "true");
  await action.click();
  await page.keyboard.press("End");
  for (let index = 0; index < 3; index += 1) await page.keyboard.press("Control+Shift+ArrowLeft");
  const tagMenu = page.getByRole("menu", { name: "Etiquetar como" });
  await expect(tagMenu).toBeVisible();
  await tagMenu.getByRole("menuitem", { name: "Props / utilería" }).click();
  await expect.poll(() => posted.filter((item) => item.action === "manual").length).toBe(1);
  expect(posted.find((item) => item.action === "manual")).toMatchObject({ name: "prisma de obsidiana", category: "prop", sceneId, blockId: actionId });
  await page.getByRole("tab", { name: "Props / utilería" }).click();
  await expect(page.getByRole("tabpanel").getByText("prisma de obsidiana", { exact: true })).toBeVisible();
  expect(await action.textContent()).toBe(before);
  await page.getByRole("button", { name: "Etiquetar elemento" }).click();
  await action.click();
  await page.keyboard.press("End");
  for (let index = 0; index < 3; index += 1) await page.keyboard.press("Control+Shift+ArrowLeft");
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("prisma de obsidiana");
  await page.keyboard.press("Shift+F10");
  const contextMenu = page.getByRole("menu", { name: "Acciones del bloque" });
  await expect(contextMenu).toBeVisible();
  await contextMenu.getByRole("menuitem", { name: /Etiquetar elemento como/ }).click();
  await contextMenu.getByRole("menu", { name: "Categorías de Breakdown" }).getByRole("menuitem", { name: "Props / utilería" }).click();
  await expect.poll(() => posted.filter((item) => item.action === "manual").length).toBe(2);
  expect(elements).toHaveLength(1);
  expect(elements[0].appearances).toHaveLength(2);

  await page.reload();
  await page.getByRole("tab", { name: "Props / utilería" }).click();
  await expect(page.getByRole("tabpanel").getByText("prisma de obsidiana", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /prisma de obsidiana.*Ver/ }).click();
  await page.getByRole("button", { name: "Quitar etiqueta" }).first().click();
  await expect.poll(() => posted.filter((item) => item.action === "removeManualAppearance").length).toBe(1);
  expect(elements[0].appearances).toHaveLength(1);
  expect(await action.textContent()).toBe(before);
  await page.getByRole("button", { name: /Detectar elementos/ }).click();
  await expect(page.getByRole("button", { name: /prisma de obsidiana.*Ver/ })).toBeVisible();
});
