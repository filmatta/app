import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import { detectWriterBreakdownRules, type WriterBreakdownElement } from "../../lib/writer/production";
import type { WriterDocument } from "../../lib/writer/document";

const scriptId = "11111111-1111-4111-8111-111111111111";
const sceneId = "11111111-1111-4111-8111-111111111101";
const actionId = "11111111-1111-4111-8111-111111111102";
const addedText = "Mara abre un cajón. Dentro encuentra una pistola.";
const metaphor = "La noticia fue un disparo al corazón.";

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64({ access_token: token, refresh_token: "local-refresh", expires_at: 4102444800, token_type: "bearer", user: { id: scriptId } }), domain: "127.0.0.1", path: "/" }]);
}

function appearance(id: string, excerpt: string) {
  return { id: `${id}-appearance`, sceneId, blockId: actionId, excerpt, nature: "used" as const, fromOffset: 0, toOffset: excerpt.length, sourceRevision: 1, stale: false };
}

test("same-document Breakdown reanalysis uses the saved revision, refreshes inline and preserves human decisions", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
  const confirmed: WriterBreakdownElement = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", scriptId, category: "prop", name: "Llave maestra", status: "confirmed", source: "user", canonicalIdentityKey: null, note: "Decisión humana", assetId: null, fingerprint: "human:confirmed:key", revision: 3, appearances: [appearance("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "Mara conserva la llave maestra.")],
  };
  const dismissed: WriterBreakdownElement = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", scriptId, category: "prop", name: "Pistola metafórica", status: "dismissed", source: "ai", canonicalIdentityKey: null, note: "Descartado por el usuario", assetId: null, fingerprint: "human:dismissed:metaphor", revision: 4, appearances: [appearance("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", metaphor)],
  };
  let elements: WriterBreakdownElement[] = [confirmed, dismissed];
  const rejected = new Set<string>([dismissed.fingerprint]);
  let posts = 0;
  let savedSourceObserved = false;
  await page.route(`**/api/writer/scripts/${scriptId}/breakdown`, async (route: Route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ elements, pendingCount: 0, analysis: null }) });
    }
    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON() as { elementId: string; action: string; status: string };
      const target = elements.find((element) => element.id === payload.elementId);
      if (target && payload.action === "status" && payload.status === "dismissed") {
        rejected.add(target.fingerprint);
        elements = elements.map((element) => element.id === target.id ? { ...element, status: "dismissed" } : element);
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ saved: true, breakdown: { elements, pendingCount: elements.filter((element) => element.status === "suggested").length } }) });
    }
    posts += 1;
    const stateResponse = await page.request.get("http://127.0.0.1:54329/__writer_state");
    const state = await stateResponse.json() as { revision: number; document: WriterDocument };
    const source = JSON.stringify(state.document);
    savedSourceObserved = source.includes(addedText) && source.includes(metaphor) && state.revision > 1;
    const props = detectWriterBreakdownRules(state.document).filter((candidate) => candidate.category === "prop" && !rejected.has(candidate.fingerprint));
    const detected = props.map<WriterBreakdownElement>((candidate, index) => ({
      id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, "0")}`,
      scriptId,
      category: candidate.category,
      name: candidate.name,
      status: "suggested",
      source: candidate.source,
      canonicalIdentityKey: null,
      note: null,
      assetId: null,
      fingerprint: candidate.fingerprint,
      revision: 1,
      appearances: [{ id: `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, "0")}`, sceneId: candidate.sceneId, blockId: candidate.blockId, excerpt: candidate.excerpt, nature: candidate.nature, fromOffset: candidate.fromOffset ?? null, toOffset: candidate.toOffset ?? null, sourceRevision: state.revision, stale: false }],
    }));
    elements = [confirmed, dismissed, ...detected];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ detected: detected.length, candidates: [], reusedScenes: 0, revision: state.revision, partial: false, breakdown: { elements, pendingCount: detected.length, analysis: { status: "completed", stale: false, sourceRevision: state.revision, scope: "document", errorCode: null, model: "local-rules-v1", updatedAt: new Date().toISOString() } } }) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  await page.getByRole("tab", { name: "Props / utilería" }).click();
  await expect(page.getByRole("tabpanel").getByText("Llave maestra", { exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText("pistola", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Detectar elementos/ }).click();
  await expect(page.getByRole("tabpanel").getByText("pistola", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tabpanel").getByText("cajón", { exact: true })).toHaveCount(0);
  await page.evaluate(() => { (window as Window & { __breakdownMountToken?: string }).__breakdownMountToken = crypto.randomUUID(); });
  const mountToken = await page.evaluate(() => (window as Window & { __breakdownMountToken?: string }).__breakdownMountToken);

  const action = page.locator(`p[data-block-id="${actionId}"]`);
  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(` ${addedText} ${metaphor}`);
  await expect.poll(async () => {
    const response = await page.request.get("http://127.0.0.1:54329/__writer_state");
    return JSON.stringify((await response.json() as { document: WriterDocument }).document).includes(addedText);
  }, { timeout: 15_000 }).toBe(true);
  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube");

  await page.getByRole("button", { name: /Reanalizar todo/ }).click();
  await expect(page.getByRole("tabpanel").getByText("pistola", { exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText("cajón", { exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText(/disparo|corazón/iu)).toHaveCount(0);
  await expect(page.getByRole("tabpanel").getByText("Pistola metafórica", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tabpanel").getByText("Llave maestra", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Por revisar 2" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { __breakdownMountToken?: string }).__breakdownMountToken)).toBe(mountToken);

  await page.getByRole("button", { name: /Reanalizar todo/ }).click();
  await expect(page.getByRole("tabpanel").getByText("pistola", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("tabpanel").getByText("cajón", { exact: true })).toHaveCount(1);

  await page.getByLabel("Más opciones").click();
  await page.getByRole("button", { name: "Ver descartados (1)" }).click();
  await expect(page.getByRole("tabpanel").getByText("Pistola metafórica", { exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText("Descartado · 1 aparición")).toBeVisible();
  expect(posts).toBe(3);
  expect(savedSourceObserved).toBe(true);

  await page.getByRole("tab", { name: "Props / utilería" }).click();
  const baselineTop = await page.locator(".writer-breakdown-list").evaluate((node) => node.getBoundingClientRect().top);
  const scope = page.getByRole("button", { name: "Mostrar elementos detectados" });
  for (let index = 0; index < 30; index += 1) {
    await scope.click();
    const menu = page.getByRole("menu", { name: "Mostrar elementos detectados" });
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1441);
    await menu.getByRole("menuitemradio", { name: "Escena actual" }).click();
    await expect(menu).toHaveCount(0);
    await scope.click();
    await menu.getByRole("menuitemradio", { name: "Todo el guion" }).click();
    await page.getByRole("tab", { name: "Personajes" }).click();
    await page.getByRole("tab", { name: "Props / utilería" }).click();
    const top = await page.locator(".writer-breakdown-list").evaluate((node) => node.getBoundingClientRect().top);
    expect(Math.abs(top - baselineTop), `Breakdown list shift at iteration ${index + 1}`).toBeLessThanOrEqual(1);
  }
  await page.getByRole("tabpanel").getByRole("button", { name: /pistola.*Ver/iu }).click();
  await page.getByRole("button", { name: "Esto no es un elemento" }).click();
  await expect(page.getByRole("tabpanel").getByText("pistola", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Reanalizar todo/ }).click();
  await expect(page.getByRole("tabpanel").getByText("pistola", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tabpanel").getByText("Llave maestra", { exact: true })).toBeVisible();
});

test("physical inventory appears after save and a dismissed occurrence stays dismissed after reload and reanalysis", async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
  let elements: WriterBreakdownElement[] = [];
  const dismissed = new Set<string>();
  await page.route(`**/api/writer/scripts/${scriptId}/breakdown`, async (route: Route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ elements, pendingCount: elements.filter((element) => element.status === "suggested").length, analysis: null }) });
    }
    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON() as { elementId: string; action: string; status: string };
      const target = elements.find((element) => element.id === payload.elementId);
      if (target && payload.action === "status" && payload.status === "dismissed") {
        dismissed.add(target.fingerprint);
        elements = elements.map((element) => element.id === target.id ? { ...element, status: "dismissed" } : element);
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ saved: true, breakdown: { elements, pendingCount: elements.filter((element) => element.status === "suggested").length } }) });
    }
    const state = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json() as { revision: number; document: WriterDocument };
    const candidates = detectWriterBreakdownRules(state.document).filter((candidate) => candidate.category === "prop" && !dismissed.has(candidate.fingerprint));
    const detected = candidates.map<WriterBreakdownElement>((candidate, index) => ({
      id: `dddddddd-dddd-4ddd-8ddd-${String(index + 1).padStart(12, "0")}`,
      scriptId,
      category: candidate.category,
      name: candidate.name,
      status: "suggested",
      source: "rule",
      canonicalIdentityKey: null,
      note: null,
      assetId: null,
      fingerprint: candidate.fingerprint,
      revision: 1,
      appearances: [{ id: `eeeeeeee-eeee-4eee-8eee-${String(index + 1).padStart(12, "0")}`, sceneId: candidate.sceneId, blockId: candidate.blockId, excerpt: candidate.excerpt, nature: candidate.nature, fromOffset: candidate.fromOffset ?? null, toOffset: candidate.toOffset ?? null, sourceRevision: state.revision, stale: false }],
    }));
    elements = [...elements.filter((element) => element.status === "dismissed"), ...detected];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ detected: detected.length, candidates: [], reusedScenes: 0, revision: state.revision, partial: false, breakdown: { elements, pendingCount: detected.length, analysis: { status: "completed", stale: false, sourceRevision: state.revision, scope: "document", errorCode: null, model: "local-rules-v1", updatedAt: new Date().toISOString() } } }) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  await page.getByRole("tab", { name: "Props / utilería" }).click();
  const action = page.locator(`p[data-block-id="${actionId}"]`);
  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Mara entra.");
  await expect(page.locator(".writer-save-status")).toContainText("Guardado en la nube");
  await page.getByRole("button", { name: /Detectar elementos/ }).click();
  await expect(page.getByRole("tabpanel").getByText("cámara", { exact: true })).toHaveCount(0);

  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Mara entra con una cámara, una mochila y un paraguas.");
  await expect.poll(async () => JSON.stringify((await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json() as { document: WriterDocument }).document).includes("Mara entra con una cámara, una mochila y un paraguas.")).toBe(true);
  await page.getByRole("button", { name: /Reanalizar todo/ }).click();
  for (const name of ["cámara", "mochila", "paraguas"]) await expect(page.getByRole("tabpanel").getByText(name, { exact: true })).toBeVisible();
  await page.getByRole("tabpanel").getByRole("button", { name: /cámara.*Ver/iu }).click();
  await page.getByRole("button", { name: "Esto no es un elemento" }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Props / utilería" }).click();
  await page.getByRole("button", { name: /Reanalizar todo|Detectar elementos/ }).click();
  await expect(page.getByRole("tabpanel").getByText("cámara", { exact: true })).toHaveCount(0);
  for (const name of ["mochila", "paraguas"]) await expect(page.getByRole("tabpanel").getByText(name, { exact: true })).toHaveCount(1);
});
