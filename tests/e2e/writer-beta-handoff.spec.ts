import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import fs from "node:fs";

const scriptId = "11111111-1111-4111-8111-111111111111";
const sceneA = "11111111-1111-4111-8111-111111111101";
const sceneB = "11111111-1111-4111-8111-111111111108";
const blockB = "11111111-1111-4111-8111-111111111109";
const evidence = "test-results/writer-beta-handoff";

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64({
    access_token: token, refresh_token: "local-refresh", expires_at: 4102444800,
    token_type: "bearer", user: { id: scriptId },
  }), domain: "127.0.0.1", path: "/" }]);
}

async function openWriter(page: Page, context: BrowserContext, width = 1440) {
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await session(context);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
}

function ideaPayload() {
  return {
    ideas: [{
      id: "idea-handoff-1",
      title: "Volver incómodo el silencio",
      direction: "Hacer que el silencio confirme que ambos personajes conocen una información que evitan nombrar.",
      consequence: "La relación cambia sin convertir el encuentro en una pelea.",
      category: "Subtexto",
      references: [{
        id: `block:${blockB}`, sceneId: sceneB, sceneNumber: 2, sceneHeading: "EXT. CALLE - NOCHE",
        blockId: blockB, blockKind: "action", start: 0, end: 12, text: "Acción de prueba 2.",
        snippet: "Acción de prueba 2.", reason: "Referencia verificable del guion",
      }],
    }],
    sourceRevision: 7,
    metrics: { latencyMs: 130, chunks: 2, costMicrousd: 1400 },
  };
}

async function mockIdeasAndGuide(page: Page) {
  let ideaPosts = 0;
  let guidePosts = 0;
  let lastGuideBody: Record<string, unknown> | null = null;
  await page.route(`**/api/writer/scripts/${scriptId}/ideas`, async (route: Route) => {
    ideaPosts += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ideaPayload()) });
  });
  await page.route(`**/api/writer/scripts/${scriptId}/guided-writing**`, async (route: Route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session: null, messages: [] }) });
    }
    guidePosts += 1;
    lastGuideBody = route.request().postDataJSON() as Record<string, unknown>;
    await new Promise((resolve) => setTimeout(resolve, 120));
    const question = String(lastGuideBody.question ?? "");
    const response = {
      summary: "El silencio puede funcionar como una decisión compartida y no como ausencia de conflicto.",
      questions: [
        { id: "q1", text: "¿Quién rompe primero el acuerdo implícito?", referenceIds: [`scene:${sceneB}`] },
        { id: "q2", text: "¿Qué cambia si ninguno lo rompe?", referenceIds: [] },
      ],
      options: [],
      references: [],
      warnings: [],
      redirectedFromWritingRequest: false,
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      session: { id: "88888888-8888-4888-8888-888888888888", scriptId, scope: "scene", sceneId: lastGuideBody.sceneId, updatedAt: "2026-10-03T12:00:00Z" },
      messages: [
        { id: `user-${guidePosts}`, role: "user", content: question, response: null, documentHash: lastGuideBody.documentHash, sceneId: lastGuideBody.sceneId, createdAt: "2026-10-03T12:00:00Z" },
        { id: `assistant-${guidePosts}`, role: "assistant", content: null, response, documentHash: lastGuideBody.documentHash, sceneId: lastGuideBody.sceneId, createdAt: "2026-10-03T12:00:01Z" },
      ],
    }) });
  });
  return {
    get ideaPosts() { return ideaPosts; },
    get guidePosts() { return guidePosts; },
    get lastGuideBody() { return lastGuideBody; },
  };
}

test("Assistant reopen is stable for ten cycles and preserves width and selected section", async ({ page, context }) => {
  await openWriter(page, context);
  const assistant = page.getByRole("complementary", { name: "Asistente" });
  const guideTab = assistant.getByRole("button", { name: "Guía", exact: true });
  await guideTab.click();
  const splitter = page.getByRole("separator", { name: "Cambiar ancho del Asistente" });
  await splitter.focus();
  await page.keyboard.press("ArrowLeft");
  const expectedWidth = await splitter.getAttribute("aria-valuenow");
  const baseline = await headerGeometry(page);

  for (let cycle = 0; cycle < 10; cycle += 1) {
    await page.getByRole("button", { name: "Ocultar Asistente" }).click();
    await expect(assistant).toBeHidden();
    await page.getByRole("button", { name: "Mostrar Asistente" }).click();
    await expect(assistant).toBeVisible();
    await expect(guideTab).toHaveAttribute("aria-current", "page");
    await expect(splitter).toHaveAttribute("aria-valuenow", expectedWidth!);
    const current = await headerGeometry(page);
    expect(Math.abs(current.headerLeft - baseline.headerLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(current.headerRight - baseline.headerRight)).toBeLessThanOrEqual(1);
    expect(Math.abs(current.actionsRight - baseline.actionsRight)).toBeLessThanOrEqual(1);
    expect(current.wrapped).toBe(false);
  }
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/assistant-header-1440x900.png` });
});

test("Ideas stays non-modal, uses one explicit request, navigates centrally and keeps Guide prompt clean", async ({ page, context }) => {
  await openWriter(page, context);
  const api = await mockIdeasAndGuide(page);
  await page.locator(`[data-block-id="${sceneA}"]`).click();
  await page.getByRole("button", { name: /Ideas/ }).first().click();
  const panel = page.locator("#writer-timeline-panel");
  const ideas = panel.locator(".writer-ideas-panel");
  await expect(ideas).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Ideas" })).toHaveCount(0);
  expect(api.ideaPosts).toBe(0);
  await panel.getByRole("button", { name: "Timeline", exact: true }).click();
  await panel.getByRole("button", { name: "Ideas", exact: true }).click();
  expect(api.ideaPosts).toBe(0);

  await ideas.getByRole("button", { name: "Esta escena" }).click();
  await ideas.getByLabel("¿Qué quieres explorar?").fill("¿Cómo volver incómodo este encuentro sin una pelea?");
  await ideas.getByRole("button", { name: "Subtexto" }).click();
  await ideas.getByRole("button", { name: "Explorar direcciones" }).click();
  await expect(ideas.getByRole("heading", { name: "Volver incómodo el silencio" })).toBeVisible();
  expect(api.ideaPosts).toBe(1);
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/ideas-panel-1440x900.png` });

  const reference = ideas.getByRole("button", { name: /Ver en guion/ });
  await reference.click();
  await expect(page.locator(`[data-block-id="${blockB}"]`)).toHaveClass(/writer-scene-target-highlight/);
  await expect(page.locator(".writer-scene-list > li").nth(1)).toHaveClass(/is-active/);
  await expect.poll(() => page.evaluate((blockId) => {
    const scroller = document.querySelector<HTMLElement>(".writer-paper");
    const target = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
    if (!scroller || !target) return false;
    const container = scroller.getBoundingClientRect();
    const block = target.getBoundingClientRect();
    const delta = Math.abs((block.top + block.height / 2) - (container.top + container.height / 2));
    const atEnd = Math.abs(scroller.scrollTop - (scroller.scrollHeight - scroller.clientHeight)) <= 2;
    const fullyVisible = block.top >= container.top - 1 && block.bottom <= container.bottom + 1;
    return (delta <= container.height * .3 || (atEnd && fullyVisible)) && scroller.scrollLeft === 0;
  }, blockB)).toBe(true);

  await ideas.getByRole("button", { name: "Pensarlo juntos →" }).click();
  const assistant = page.getByRole("complementary", { name: "Asistente" });
  const composer = assistant.getByLabel("Cuéntame qué decisión estás intentando tomar.");
  await expect(assistant.getByText("Volver incómodo el silencio")).toBeVisible();
  await expect(composer).toHaveValue("");
  expect(api.guidePosts).toBe(0);
  const exactQuestion = "Quiero que el encuentro entre A y B sea incómodo sin una pelea";
  await composer.fill(exactQuestion);
  await assistant.getByRole("button", { name: "Pensarlo juntos", exact: true }).click();
  await expect(assistant.getByText("Lo que parece estar ocurriendo")).toBeVisible();
  expect(api.guidePosts).toBe(1);
  expect(api.lastGuideBody?.question).toBe(exactQuestion);
  expect((api.lastGuideBody?.ideaContext as Record<string, unknown>)?.title).toBe("Volver incómodo el silencio");
  expect((api.lastGuideBody?.ideaContext as Record<string, unknown>)?.sceneId).toBe(sceneA);
  await expect(assistant.locator(".writer-guided-message.is-user")).toHaveText(/Quiero que el encuentro entre A y B sea incómodo sin una pelea/u);
  const responsePosition = await assistant.locator(".writer-guided-response").evaluate((node) => {
    const scroller = node.closest<HTMLElement>(".writer-observations-scroll");
    if (!scroller) return null;
    const responseRect = node.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return responseRect.top - scrollerRect.top;
  });
  expect(responsePosition).not.toBeNull();
  expect(responsePosition!).toBeGreaterThanOrEqual(-2);
  await page.screenshot({ path: `${evidence}/guide-response-start-1440x900.png` });

  await composer.fill("Quiero comparar una segunda consecuencia");
  await assistant.getByRole("button", { name: "Pensarlo juntos", exact: true }).click();
  await expect(assistant.getByText("Pensando con el contexto actual…")).toBeVisible();
  await assistant.locator(".writer-observations-scroll").dispatchEvent("wheel", { deltaY: -80 });
  await expect(assistant.getByRole("button", { name: "Ver nueva respuesta" })).toBeVisible();
  await assistant.getByRole("button", { name: "Ver nueva respuesta" }).click();
  await expect(assistant.getByRole("button", { name: "Ver nueva respuesta" })).toHaveCount(0);
});

test("caret selection uses the active end scene without saving or launching analysis", async ({ page, context }) => {
  await openWriter(page, context);
  let writeRequests = 0;
  page.on("request", (request) => {
    if (request.method() !== "GET" && /assistant|guided-writing|narrative-pulse|\/api\/writer\/scripts\/[^/]+$/u.test(request.url())) writeRequests += 1;
  });
  await page.locator(`[data-block-id="${sceneA}"]`).click();
  await expect(page.locator(".writer-scene-list > li").first()).toHaveClass(/is-active/);
  await page.locator(`[data-block-id="${sceneB}"]`).click();
  await expect(page.locator(".writer-scene-list > li").nth(1)).toHaveClass(/is-active/);
  await page.waitForTimeout(300);
  expect(writeRequests).toBe(0);
});

test("Ideas distinguishes an unavailable provider and preserves the user's prompt", async ({ page, context }) => {
  await openWriter(page, context, 1024);
  let requests = 0;
  await page.route(`**/api/writer/scripts/${scriptId}/ideas`, async (route) => {
    requests += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "provider_unavailable", error: "Ideas con IA no está disponible en este entorno." }),
    });
  });
  await page.getByRole("button", { name: /Ideas/ }).first().click();
  const ideas = page.locator(".writer-ideas-panel");
  const prompt = ideas.getByLabel("¿Qué quieres explorar?");
  const question = "¿Cómo cambia la escena si nadie responde?";
  await prompt.fill(question);
  await ideas.getByRole("button", { name: "Explorar direcciones" }).click();
  await expect(ideas.getByRole("status")).toContainText("no está disponible");
  await expect(ideas.locator(".writer-tool-message")).toHaveClass(/is-unavailable/);
  await expect(prompt).toHaveValue(question);
  expect(requests).toBe(1);
});

async function headerGeometry(page: Page) {
  return page.locator(".writer-header").evaluate((header) => {
    const headerRect = header.getBoundingClientRect();
    const actions = header.querySelector<HTMLElement>(".writer-header-actions")!.getBoundingClientRect();
    const visible = [...header.querySelectorAll<HTMLElement>("button, input")].filter((node) => node.getClientRects().length > 0);
    return {
      headerLeft: headerRect.left,
      headerRight: headerRect.right,
      actionsRight: actions.right,
      wrapped: visible.some((node) => {
        const rect = node.getBoundingClientRect();
        return rect.top < headerRect.top - 1 || rect.bottom > headerRect.bottom + 1;
      }),
    };
  });
}
