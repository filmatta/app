import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const scriptId = "11111111-1111-4111-8111-111111111111";
const sceneA = "11111111-1111-4111-8111-111111111101";
const sceneB = "11111111-1111-4111-8111-111111111108";
const blockA = "11111111-1111-4111-8111-111111111102";
const blockB = "11111111-1111-4111-8111-111111111109";

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64({
    access_token: token, refresh_token: "local-refresh", expires_at: 4102444800,
    token_type: "bearer", user: { id: scriptId },
  }), domain: "127.0.0.1", path: "/" }]);
}

function fixture() {
  return {
    elements: [
      element("66666666-6666-4666-8666-666666666661", sceneA, blockA, "setup", "Ventana observada", "ANA observa la VENTANA.", "suggested"),
      element("66666666-6666-4666-8666-666666666662", sceneB, blockB, "payoff", "Regreso a la ventana", "La segunda escena conserva un ID distinto.", "suggested"),
      element("66666666-6666-4666-8666-666666666663", sceneA, blockA, "setup", "Promesa pendiente", "ANA observa la VENTANA.", "unresolved"),
      element("66666666-6666-4666-8666-666666666664", sceneB, blockB, "payoff", "Momento no preparado", "La segunda escena conserva un ID distinto.", "orphan"),
    ],
    links: [{
      id: "77777777-7777-4777-8777-777777777771", scriptId, setupElementId: "66666666-6666-4666-8666-666666666661",
      payoffElementId: "66666666-6666-4666-8666-666666666662", status: "suggested", source: "ai",
      explanation: "La imagen reaparece como consecuencia.", confidence: "high", updatedAt: "2026-09-30T12:00:00Z",
    }],
    analysis: null,
  };
}

function element(id: string, sceneId: string, blockId: string, type: "setup" | "payoff", label: string, excerpt: string, status: string) {
  return { id, scriptId, sceneId, blockId, type, category: type === "setup" ? "elemento visual" : "callback", label, excerpt,
    explanation: "Relación narrativa que requiere decisión humana.", status, source: "ai", sourceHash: "a".repeat(64),
    fingerprint: `ai:${id}`, confidence: "high", updatedAt: "2026-09-30T12:00:00Z" };
}

async function mockSetupPayoff(page: Page) {
  const state = fixture();
  await page.route(`**/api/writer/scripts/${scriptId}/setup-payoff`, async (route: Route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state) });
    if (route.request().method() !== "PATCH") return route.fulfill({ status: 405, body: "{}" });
    const body = route.request().postDataJSON() as Record<string, string>;
    if (body.action === "linkStatus") {
      const link = state.links.find((item) => item.id === body.linkId);
      if (link) link.status = body.status;
    }
    if (body.action === "elementStatus") {
      const item = state.elements.find((candidate) => candidate.id === body.elementId);
      if (item) item.status = body.status;
    }
    if (body.action === "createLink") {
      state.links.push({ id: "77777777-7777-4777-8777-777777777772", scriptId,
        setupElementId: body.setupElementId, payoffElementId: body.payoffElementId, status: "confirmed", source: "user",
        explanation: "Relación manual.", confidence: "high", updatedAt: "2026-09-30T12:01:00Z" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ saved: true }) });
  });
  return state;
}

test.beforeEach(async ({ request, context }) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
});

test("desktop confirms, persists and navigates a suggested relation without editing the screenplay", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSetupPayoff(page);
  await page.goto(`/writer/${scriptId}`);
  await page.getByRole("button", { name: /^Observaciones/ }).click();
  const panel = page.locator(".writer-observations-panel");
  await panel.getByRole("button", { name: /Setup \/ Payoff/ }).click();
  await expect(panel.getByRole("heading", { name: "Setup / Payoff" })).toBeVisible();
  await panel.getByRole("button", { name: /Ventana observada/ }).click();
  await expect(panel.getByText("Estado: Sugerido")).toBeVisible();
  await panel.getByRole("button", { name: "Confirmar relación" }).click();
  await expect(panel.getByText("Estado: Confirmado")).toBeVisible();
  await panel.getByRole("button", { name: "Ir a Payoff" }).click();
  await expect(page.locator(`[data-block-id="${blockB}"]`)).toHaveClass(/writer-scene-target-highlight/);
  await page.reload();
  await page.getByRole("button", { name: /^Observaciones/ }).click();
  await page.locator(".writer-observations-panel").getByRole("button", { name: /Setup \/ Payoff/ }).click();
  await page.locator(".writer-observations-panel").getByRole("button", { name: /Ventana observada/ }).click();
  await expect(page.locator(".writer-observations-panel").getByText("Estado: Confirmado")).toBeVisible();
});

test("mobile exposes list, unresolved/orphan detail and manual linking without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("filmatta.writer.mobile-notice.v1:11111111-1111-4111-8111-111111111111", "dismissed"));
  await mockSetupPayoff(page);
  await page.goto(`/writer/${scriptId}`);
  await page.getByRole("button", { name: /^Navegar/ }).click();
  await page.getByRole("dialog", { name: "Navegar por el guion" }).getByRole("button", { name: "Setup / Payoff" }).click();
  const panel = page.locator(".writer-observations-panel");
  await expect(panel.getByRole("heading", { name: "Setup / Payoff" })).toBeVisible();
  await panel.getByRole("button", { name: /Promesa pendiente/ }).click();
  await expect(panel.getByText(/no encontramos una resolución posterior/)).toBeVisible();
  await panel.getByRole("button", { name: /Momento no preparado/ }).click();
  await expect(panel.getByText(/no encontramos una preparación clara/)).toBeVisible();
  await expect.poll(() => panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const linkSelectors = panel.locator(".writer-setup-payoff-form select");
  await linkSelectors.nth(0).selectOption("66666666-6666-4666-8666-666666666663");
  await linkSelectors.nth(1).selectOption("66666666-6666-4666-8666-666666666664");
  await panel.getByRole("button", { name: "Vincular payoff" }).click();
  await expect(panel.getByRole("button", { name: /✓ Promesa pendiente → Escena/ })).toBeVisible();
});
