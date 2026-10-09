import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const ownerId = "11111111-1111-4111-8111-111111111111";
const projectId = "33333333-3333-4333-8333-333333333333";
const writerId = "44444444-4444-4444-8444-444444444444";

async function authenticate(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: ownerId, exp: 4102444800, role: "authenticated", test_role: "user" })}.local-signature`;
  await context.addCookies([{
    name: "sb-127-auth-token",
    value: "base64-" + b64({
      access_token: token,
      refresh_token: "local-refresh",
      expires_at: 4102444800,
      token_type: "bearer",
      user: { id: ownerId },
    }),
    domain: "127.0.0.1",
    path: "/",
  }]);
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

type Session = {
  id: string; title: string; premise: string | null; projectId: string | null; writerId: string | null;
  createdAt: string; updatedAt: string;
};
type Message = {
  id: string; sessionId: string; role: "user" | "assistant"; content: string;
  parentMessageId: string | null; metadata: object; createdAt: string;
};
type Item = {
  id: string; sessionId: string; type: string; suggestedType: string | null; title: string | null; content: string;
  state: string; sourceMessageId: string | null; createdAt: string; updatedAt: string;
};
type Reaction = { messageId: string; emoji: string; active: boolean };

function mockCrear(page: Page) {
  const details = new Map<string, { session: Session; messages: Message[]; items: Item[]; reactions: Reaction[] }>();
  let sequence = 0;
  const id = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
  const now = () => new Date().toISOString();
  const list = () => [...details.values()].map((entry) => entry.session);

  page.route("**/api/crear/sessions**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const parts = path.split("/").filter(Boolean);
    const sessionId = parts[3];
    const action = parts[4];
    const itemId = parts[5];
    if (!sessionId) {
      if (method === "GET") return json(route, { sessions: list() });
      if (method === "POST") {
        const session: Session = { id: id(), title: "Idea sin título", premise: null, projectId: null, writerId: null, createdAt: now(), updatedAt: now() };
        const detail = { session, messages: [] as Message[], items: [] as Item[], reactions: [] as Reaction[] };
        details.set(session.id, detail);
        return json(route, detail, 201);
      }
    }
    const detail = details.get(sessionId);
    if (!detail) return json(route, { error: "Sesión no encontrada." }, 404);
    if (!action) {
      if (method === "GET") return json(route, detail);
      if (method === "PATCH") {
        detail.session.title = String(request.postDataJSON().title);
        return json(route, { session: detail.session });
      }
    }
    if (action === "messages" && method === "POST") {
      const body = request.postDataJSON() as { content: string; parentMessageId?: string | null };
      detail.messages.push({ id: id(), sessionId, role: "user", content: body.content, parentMessageId: body.parentMessageId ?? null, metadata: {}, createdAt: now() });
      detail.messages.push({ id: id(), sessionId, role: "assistant", content: "Hay una decisión potente en esa premisa.", parentMessageId: null, metadata: { blockIndex: 0, blockCount: 2 }, createdAt: now() });
      const suggestionSource = id();
      detail.messages.push({ id: suggestionSource, sessionId, role: "assistant", content: "¿Qué cambiaría si las Arcas desconocen a las demás?", parentMessageId: null, metadata: { blockIndex: 1, blockCount: 2, suggestions: [{ type: "world", title: "Regla de las Arcas", content: "Las Arcas desconocen a las demás." }] }, createdAt: now() });
      detail.items.push({ id: id(), sessionId, type: "pending", suggestedType: "world", title: "Regla de las Arcas", content: "Las Arcas desconocen a las demás.", state: "active", sourceMessageId: suggestionSource, createdAt: now(), updatedAt: now() });
      return json(route, { messages: detail.messages, items: detail.items });
    }
    if (action === "reactions" && method === "POST") {
      const body = request.postDataJSON() as Reaction;
      detail.reactions = detail.reactions.filter((entry) => !(entry.messageId === body.messageId && entry.emoji === body.emoji));
      if (body.active) detail.reactions.push(body);
      return json(route, { reactions: detail.reactions });
    }
    if (action === "items" && !itemId && method === "POST") {
      const body = request.postDataJSON() as { content: string; type: string; state: string; sourceMessageId?: string };
      const item: Item = { id: id(), sessionId, type: body.type, suggestedType: null, title: null, content: body.content, state: body.state, sourceMessageId: body.sourceMessageId ?? null, createdAt: now(), updatedAt: now() };
      detail.items.push(item);
      return json(route, { item }, 201);
    }
    if (action === "items" && itemId && method === "PATCH") {
      const item = detail.items.find((entry) => entry.id === itemId);
      if (!item) return json(route, { error: "No encontrado" }, 404);
      const patch = request.postDataJSON() as { state?: string; type?: string };
      Object.assign(item, patch, { updatedAt: now() });
      if (item.type === "pending" && (patch.state === "canon" || patch.state === "maybe")) item.type = item.suggestedType ?? "pending";
      return json(route, { item });
    }
    if (action === "items" && itemId && method === "DELETE") {
      detail.items = detail.items.filter((entry) => entry.id !== itemId);
      return json(route, { ok: true });
    }
    if (action === "convert" && method === "POST") return json(route, { projectId, writerId });
    return json(route, { error: "Ruta no simulada" }, 404);
  });
  return { details, list };
}

test("Crear keeps conversation, reply, reactions and decisions through reload, then opens Writer", async ({ page, context }) => {
  await authenticate(context);
  const fixture = mockCrear(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/crear");
  await expect(page.getByRole("heading", { name: /Tienes una idea/ })).toBeVisible();
  await page.getByRole("button", { name: /Empezar una idea/ }).click();
  await expect(page).toHaveURL(/\/crear\/00000000-/);
  const firstSession = fixture.list()[0].id;
  await expect(page.getByRole("button", { name: /Convertir en proyecto/ })).toBeDisabled();

  await page.getByRole("textbox", { name: "Mensaje" }).fill("La humanidad viaja en Arcas aisladas.");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  const pending = page.locator(".crear-structure-rail .crear-structure-section").filter({ hasText: "Pendientes" });
  await pending.getByRole("button", { name: "Canon" }).first().click();
  await expect(page.locator(".crear-structure-rail .crear-structure-section").filter({ hasText: "Mundo" })).toContainText("Las Arcas desconocen a las demás.");
  const suggestion = page.locator("article.crear-message").filter({ hasText: "¿Qué cambiaría si las Arcas" }).first();
  await expect(suggestion).toBeVisible();
  await suggestion.getByRole("button", { name: "Responder" }).click();
  await expect(page.getByText("Respondiendo a FILMATTA")).toBeVisible();
  await page.getByRole("textbox", { name: "Mensaje" }).fill("La tripulación no conoce a las otras naves.");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.locator("article.crear-message blockquote").first()).toContainText("¿Qué cambiaría");

  await suggestion.locator("summary[aria-label='Añadir una reacción']").click();
  await suggestion.getByRole("button", { name: /Reaccionar con 💡/ }).click();
  await expect(suggestion.getByRole("button", { name: /Reaccionar con 💡/ })).toHaveAttribute("aria-pressed", "true");
  await suggestion.getByRole("button", { name: "Canon" }).click();
  await expect(page.locator(".crear-structure-rail")).toContainText("¿Qué cambiaría si las Arcas");
  await page.locator("article.crear-message").filter({ hasText: "Hay una decisión potente" }).first().getByRole("button", { name: "Maybe" }).click();
  await expect(page.locator(".crear-structure-rail")).toContainText("Maybe");

  await page.reload();
  await expect(page.getByText("La humanidad viaja en Arcas aisladas.")).toBeVisible();
  await expect(page.locator("article.crear-message blockquote").first()).toContainText("¿Qué cambiaría");
  await expect(page.locator(".crear-structure-rail")).toContainText("¿Qué cambiaría si las Arcas");

  await page.getByRole("button", { name: /Nueva idea/ }).click();
  await expect(page).not.toHaveURL(new RegExp(`${firstSession}$`));
  await expect(page.locator("article.crear-message")).toHaveCount(0);
  await expect(page.locator(".crear-session-rail").getByRole("link", { name: /Idea sin título/ })).toHaveCount(2);
  await page.goto(`/crear/${firstSession}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Estructura/ }).click();
  await expect(page.getByRole("dialog", { name: "Estructura de la idea" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("dialog", { name: "Estructura de la idea" }).getByRole("button", { name: /Cerrar/ }).click();
  await page.getByRole("button", { name: /Convertir en proyecto/ }).click();
  await expect(page).toHaveURL(new RegExp(`/writer/${writerId}\\?project=${projectId}`));
});
