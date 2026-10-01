import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const scriptId = "11111111-1111-4111-8111-111111111111";
const sceneB = "11111111-1111-4111-8111-111111111108";
const blockB = "11111111-1111-4111-8111-111111111109";

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64({
    access_token: token, refresh_token: "local-refresh", expires_at: 4102444800,
    token_type: "bearer", user: { id: scriptId },
  }), domain: "127.0.0.1", path: "/" }]);
}

function response() {
  return {
    summary: "Ana mantiene la información bajo control al inicio y al final; el cambio todavía no es visible.",
    questions: [
      { id: "q1", text: "¿Qué debería descubrir la otra persona antes de salir?", referenceIds: [`scene:${sceneB}`] },
      { id: "q2", text: "¿Quieres que esta sea la primera ruptura del patrón de Ana?", referenceIds: [] },
    ],
    options: [{ id: "a", title: "Crear sospecha", change: "La escena termina con una contradicción detectable.", consequence: "La revelación se retrasa, pero la relación cambia.", referenceIds: [`scene:${sceneB}`] }],
    references: [{ referenceId: `scene:${sceneB}`, type: "scene", targetId: sceneB, sceneId: sceneB, blockId: blockB, label: "Escena 2 · EXT. CALLE - NOCHE", status: null, note: "La escena posterior muestra la consecuencia." }],
    warnings: [], redirectedFromWritingRequest: false,
  };
}

async function mockGuidedWriting(page: Page) {
  const conversations = new Map<string, { session: object | null; messages: object[] }>();
  let posts = 0;
  await page.route(`**/api/writer/scripts/${scriptId}/guided-writing**`, async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const scope = request.method() === "GET" ? url.searchParams.get("scope") ?? "scene" : "post";
    const sceneId = request.method() === "GET" ? url.searchParams.get("sceneId") : null;
    const key = `${scope}:${sceneId ?? "document"}`;
    if (request.method() === "GET") {
      const state = conversations.get(key) ?? { session: null, messages: [] };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state) });
    }
    if (request.method() !== "POST") return route.fulfill({ status: 405, body: "{}" });
    posts += 1;
    const body = request.postDataJSON() as Record<string, string | null>;
    const postKey = `${body.scope}:${body.sceneId ?? "document"}`;
    const state = conversations.get(postKey) ?? { session: null, messages: [] };
    const sessionValue = state.session ?? {
      id: "88888888-8888-4888-8888-888888888888", scriptId, scope: body.scope, sceneId: body.sceneId, updatedAt: "2026-09-30T12:00:00Z",
    };
    state.session = sessionValue;
    state.messages.push({
      id: `user-${posts}`, role: "user", content: body.question, response: null,
      documentHash: body.documentHash, sceneId: body.sceneId, createdAt: "2026-09-30T12:00:00Z",
    }, {
      id: `assistant-${posts}`, role: "assistant", content: null, response: response(),
      documentHash: body.documentHash, sceneId: body.sceneId, createdAt: "2026-09-30T12:00:01Z",
    });
    conversations.set(postKey, state);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...state, providerCalls: 1, costMicrousd: 1000, latencyMs: 120 }) });
  });
  return { conversations, get posts() { return posts; } };
}

test.beforeEach(async ({ request, context }) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
});

test("desktop sends an explicit scene question, follows a stable reference and preserves history", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await mockGuidedWriting(page);
  await page.goto(`/writer/${scriptId}`);
  await page.getByRole("button", { name: /^1 INT\. ESTUDIO/u }).click();
  await page.getByRole("button", { name: /^Observaciones/ }).click();
  const panel = page.locator(".writer-observations-panel");
  await panel.getByRole("button", { name: /Pensarlo juntos/ }).click();
  await expect(panel.getByRole("heading", { name: "¿Qué estás intentando resolver?" })).toBeVisible();
  await expect(panel.getByText(/Contexto:.*Escena 1/u)).toBeVisible();
  await panel.getByRole("button", { name: "Siento que esta escena no avanza." }).click();
  await expect(panel.getByLabel("Cuéntame qué decisión estás intentando tomar.")).toHaveValue("Siento que esta escena no avanza.");
  expect(api.posts).toBe(0);
  await panel.getByRole("button", { name: "Pensarlo juntos", exact: true }).click();
  await expect(panel.getByText("Lo que parece estar ocurriendo")).toBeVisible();
  await expect(panel.getByText(/¿Qué debería descubrir/u)).toBeVisible();
  await expect(panel.getByText("Crear sospecha")).toBeVisible();
  expect(api.posts).toBe(1);
  await panel.getByRole("button", { name: /Escena 2 · EXT. CALLE/u }).click();
  await expect(page.locator(`[data-block-id="${sceneB}"]`)).toHaveClass(/writer-scene-target-highlight/);
  await page.getByRole("button", { name: /^1 INT\. ESTUDIO/u }).click();
  await page.reload();
  await page.getByRole("button", { name: /^1 INT\. ESTUDIO/u }).click();
  await page.getByRole("button", { name: /^Observaciones/ }).click();
  await page.locator(".writer-observations-panel").getByRole("button", { name: /Pensarlo juntos/ }).click();
  await expect(page.locator(".writer-observations-panel").getByText("Crear sospecha")).toBeVisible();
});

test("mobile switches to document scope, submits with Enter and keeps the panel within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("filmatta.writer.mobile-notice.v1:11111111-1111-4111-8111-111111111111", "dismissed"));
  await mockGuidedWriting(page);
  await page.goto(`/writer/${scriptId}`);
  await page.getByRole("button", { name: /^Navegar/ }).click();
  await page.getByRole("dialog", { name: "Navegar por el guion" }).getByRole("button", { name: "Guided Writing" }).click();
  const panel = page.locator(".writer-observations-panel");
  await panel.getByRole("button", { name: "Todo el guion" }).click();
  await expect(panel.getByText(/Todo el guion · estructura/u)).toBeVisible();
  const input = panel.getByLabel("Cuéntame qué decisión estás intentando tomar.");
  await input.fill("¿Dónde conviene revelar la información?");
  await input.press("Enter");
  await expect(panel.getByText("Decisiones posibles")).toBeVisible();
  await expect.poll(() => panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
