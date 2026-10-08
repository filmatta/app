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
  const drag = await action.evaluate((block) => {
    const textNode = block.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) throw new Error("Expected text node");
    const text = textNode.textContent ?? "";
    const from = text.indexOf("prisma de obsidiana");
    const rectAt = (start: number, end: number) => {
      const range = document.createRange();
      range.setStart(textNode, start); range.setEnd(textNode, end);
      const rect = range.getBoundingClientRect();
      return { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 };
    };
    return { start: rectAt(from, from + 1), end: rectAt(from + 18, from + 19) };
  });
  await page.mouse.move(drag.start.left, drag.start.y);
  await page.mouse.down();
  await page.mouse.move(drag.end.right, drag.end.y, { steps: 12 });
  const tagMenu = page.getByRole("menu", { name: "Etiquetar como" });
  await expect(tagMenu).toHaveCount(0);
  await page.mouse.up();
  await expect(tagMenu).toBeVisible();
  await expect(tagMenu).toHaveCount(1);
  await tagMenu.getByRole("menuitem", { name: "Props / utilería" }).click();
  await expect.poll(() => posted.filter((item) => item.action === "manual").length).toBe(1);
  expect(posted.find((item) => item.action === "manual")).toMatchObject({ name: "prisma de obsidiana", category: "prop", sceneId, blockId: actionId });
  await page.getByRole("tab", { name: "Props / utilería" }).click();
  await expect(page.getByRole("tabpanel").getByText("prisma de obsidiana", { exact: true })).toBeVisible();
  await action.locator("[data-writer-breakdown-label]").hover();
  await expect(page.getByRole("tooltip")).toContainText("Props / utilería · prisma de obsidiana");
  expect(await action.textContent()).toBe(before);
  await expect(page.getByRole("button", { name: "Etiquetar elemento" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Etiquetar elemento" }).click();
  await action.click();
  await page.keyboard.press("End");
  for (let index = 0; index < 3; index += 1) await page.keyboard.press("Control+Shift+ArrowLeft");
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("prisma de obsidiana");
  await action.click({ button: "right" });
  const contextMenu = page.getByRole("menu", { name: "Acciones del bloque" });
  await expect(contextMenu).toBeVisible();
  await contextMenu.getByRole("menuitem", { name: /Etiquetar como/ }).click();
  await page.getByRole("menu", { name: "Categorías de Breakdown" }).getByRole("menuitem", { name: "Props / utilería" }).click();
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

test("keyboard tagging and narrow viewport keep one anchored menu and Escape exits in two steps", async ({ page, context }) => {
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
  await page.route(`**/api/writer/scripts/${scriptId}/breakdown`, async (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ elements: [], pendingCount: 0, analysis: null }) }));
  await page.setViewportSize({ width: 390, height: 620 });
  await page.goto(`/writer/${scriptId}`);
  const action = page.locator(`p[data-block-id="${actionId}"]`);
  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Una tarjeta de acceso");
  await page.getByRole("button", { name: "Etiquetar elemento" }).click();
  await action.click();
  await page.keyboard.press("End");
  for (let index = 0; index < 4; index += 1) await page.keyboard.press("Control+Shift+ArrowLeft");
  const tagMenu = page.getByRole("menu", { name: "Etiquetar como" });
  await expect(tagMenu).toBeVisible();
  const box = await tagMenu.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(620);
  await page.keyboard.press("Escape");
  await expect(tagMenu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Etiquetar elemento" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Etiquetar elemento" })).toHaveAttribute("aria-pressed", "false");
  await page.setViewportSize({ width: 1440, height: 900 });
  const tagButton = page.getByRole("button", { name: "Etiquetar elemento" });
  for (const skin of ["Carbon", "Marino", "Cream"]) {
    await page.getByRole("button", { name: "Apariencia de Writer" }).click();
    await page.getByRole("dialog", { name: "Apariencia de Writer" }).getByRole("radio", { name: skin }).click();
    await page.getByRole("button", { name: "Apariencia de Writer" }).click();
    const inactive = await tagButton.evaluate((button) => getComputedStyle(button).backgroundColor);
    await tagButton.click();
    await expect(tagButton).toHaveAttribute("aria-pressed", "true");
    const active = await tagButton.evaluate((button) => getComputedStyle(button).backgroundColor);
    expect(active).not.toBe(inactive);
    await tagButton.click();
  }
});

test("Breakdown plus creates an unlinked manual entity and prevents duplicate creation", async ({ page, context }) => {
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
  const elements: WriterBreakdownElement[] = [];
  const posted: Array<Record<string, unknown>> = [];
  await page.route(`**/api/writer/scripts/${scriptId}/breakdown`, async (route: Route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ elements, pendingCount: 0, analysis: null }) });
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    posted.push(payload);
    if (payload.action === "manual") {
      elements.push({ id: crypto.randomUUID(), scriptId, category: payload.category as WriterBreakdownElement["category"], name: String(payload.name), status: "confirmed", source: "user", canonicalIdentityKey: null, note: null, assetId: null, fingerprint: "user:unlinked", revision: 1, appearances: [] });
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: elements[0].id, breakdown: { elements, pendingCount: 0, analysis: null } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ detected: 0, breakdown: { elements, pendingCount: 0, analysis: null } }) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  await page.getByRole("tab", { name: "Props / utilería" }).click();
  await page.getByRole("button", { name: "Agregar elemento manual" }).click();
  const dialog = page.getByRole("dialog", { name: "Agregar elemento" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nombre").fill("Máquina de humo");
  await expect(dialog.getByLabel("Categoría")).toHaveValue("prop");
  await dialog.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Máquina de humo.*Ver/ })).toBeVisible();
  expect(posted.filter((item) => item.action === "manual")).toHaveLength(1);
  expect(posted.find((item) => item.action === "manual")).toMatchObject({ name: "Máquina de humo", category: "prop", sceneId: null });
  expect(elements[0].appearances).toHaveLength(0);
  await page.reload();
  await page.getByRole("tab", { name: "Props / utilería" }).click();
  await expect(page.getByRole("button", { name: /Máquina de humo.*Ver/ })).toBeVisible();
  await page.getByRole("button", { name: "Agregar elemento manual" }).click();
  await dialog.getByLabel("Nombre").fill("máquina de humo");
  await expect(dialog.getByText(/ya existe como Props/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Agregar", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Ver elemento existente" }).click();
  await expect(dialog).toHaveCount(0);
  expect(elements).toHaveLength(1);
  await page.getByRole("button", { name: /Detectar elementos/ }).click();
  await expect(page.getByRole("button", { name: /Máquina de humo.*Ver/ })).toBeVisible();
  expect(elements[0].appearances).toHaveLength(0);
});
