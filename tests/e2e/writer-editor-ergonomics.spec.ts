import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const scriptId = "11111111-1111-4111-8111-111111111111";

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: scriptId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{
    name: "sb-127-auth-token",
    value: "base64-" + b64({ access_token: token, refresh_token: "local-refresh", expires_at: 4102444800, token_type: "bearer", user: { id: scriptId } }),
    domain: "127.0.0.1",
    path: "/",
  }]);
}

async function openLongWriter(page: Page, context: BrowserContext, width = 1440) {
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux&writerScenes=150");
  await session(context);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
}

test("150-scene Writer keeps independent navigation, expandable analysis and local tools", async ({ page, context }) => {
  await openLongWriter(page, context);
  const geometry = await page.evaluate(() => {
    const scenes = document.querySelector<HTMLElement>(".writer-scene-region")!;
    const characters = document.querySelector<HTMLElement>(".writer-character-section > ul")!;
    const thumb = getComputedStyle(scenes, "::-webkit-scrollbar-thumb");
    const sceneMax = scenes.scrollHeight - scenes.clientHeight;
    scenes.scrollTop = sceneMax / 2;
    const sceneMidRatio = scenes.scrollTop / sceneMax;
    scenes.scrollTop = sceneMax;
    const sceneEndRatio = scenes.scrollTop / sceneMax;
    scenes.scrollTop = 0;
    return {
      sceneScrollable: scenes.scrollHeight > scenes.clientHeight,
      characterScrollable: characters.scrollHeight > characters.clientHeight,
      sceneMidRatio,
      sceneEndRatio,
      thumbMinHeight: thumb.minHeight,
    };
  });
  expect(geometry.sceneScrollable).toBe(true);
  expect(geometry.characterScrollable).toBe(true);
  expect(geometry.sceneMidRatio).toBeGreaterThan(0.45);
  expect(geometry.sceneMidRatio).toBeLessThan(0.55);
  expect(geometry.sceneEndRatio).toBe(1);
  expect(geometry.thumbMinHeight).toBe("40px");

  const characterToggle = page.locator(".writer-character-section-toggle");
  await characterToggle.click();
  await expect(characterToggle).toHaveAttribute("aria-expanded", "false");
  await characterToggle.click();
  await expect(characterToggle).toHaveAttribute("aria-expanded", "true");

  const timeline = page.locator(".writer-timeline-panel");
  if (!(await timeline.isVisible())) await page.locator(".writer-header").getByRole("button", { name: "Timeline" }).click();
  await timeline.getByRole("button", { name: /Expandir/ }).click();
  await expect(page.locator(".writer-workspace")).toHaveClass(/writer-workspace--timeline-expanded/);
  await timeline.getByRole("button", { name: "Narrative Pulse" }).click();
  await expect(timeline.getByRole("button", { name: /Contraer/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".writer-workspace")).not.toHaveClass(/writer-workspace--timeline-expanded/);

  await page.keyboard.press("Control+f");
  const search = page.getByRole("dialog", { name: "Buscar en Writer" });
  await search.getByRole("textbox", { name: "Buscar", exact: true }).fill("tropieza");
  await expect(search.getByText("1 de 1 resultados")).toBeVisible();
  await search.getByRole("button", { name: "Resultado siguiente" }).click();
  await expect(page.getByLabel("Editor de guion").locator(".writer-scene-target-highlight")).toHaveCount(1);

  await search.getByRole("tab", { name: "✦ Búsqueda inteligente" }).click();
  await search.getByLabel("Pregunta").fill("¿En qué parte del guion se tropieza María?");
  await search.getByRole("button", { name: "✦ Buscar inteligentemente" }).click();
  await expect(search.getByText(/María se tropieza/u)).toBeVisible();
  await expect(search.getByText(/US\$ 0\.00/u)).toBeVisible();
  await search.getByRole("button", { name: "Cerrar Buscar en Writer" }).click();

  const sound = page.getByRole("button", { name: "Sonido de máquina de escribir" });
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(page.getByRole("button", { name: "Sonido de máquina de escribir" })).toHaveAttribute("aria-pressed", "false");
});

test("Ideas, Replace All checkpoints and mobile geometry remain safe", async ({ page, context }) => {
  await openLongWriter(page, context);
  await page.getByRole("button", { name: /Ideas/ }).first().click();
  const ideas = page.getByRole("dialog", { name: "Ideas" });
  await ideas.getByLabel("¿Qué quieres explorar?").fill("Aumentar el conflicto");
  await ideas.getByRole("button", { name: "Conflicto" }).click();
  await ideas.getByRole("button", { name: "💡 Explorar direcciones" }).click();
  await expect(ideas.locator(".writer-idea-results article")).toHaveCount(5);
  await expect(ideas).toContainText("OpenAI 0 llamadas");
  await ideas.getByRole("button", { name: "Pensarlo juntos →" }).first().click();
  await expect(page.locator(".writer-observations-panel").getByLabel("Cuéntame qué decisión estás intentando tomar.")).toHaveValue(/Elevar el costo de la decisión/u);

  await page.keyboard.press("Control+h");
  const search = page.getByRole("dialog", { name: "Buscar en Writer" });
  await search.getByRole("textbox", { name: "Buscar", exact: true }).fill("Acción de prueba");
  await search.getByLabel("Reemplazar por").fill("Acción revisada");
  await search.getByRole("button", { name: "Todo el guion" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  const checkpointResponse = page.waitForResponse((response) => response.url().includes("/checkpoints") && response.request().method() === "POST");
  await search.getByRole("button", { name: "Reemplazar todos" }).click();
  expect((await checkpointResponse).status()).toBe(201);
  await expect(search.getByText("149 coincidencias reemplazadas.", { exact: true })).toBeVisible();
  const state = await (await page.request.get("http://127.0.0.1:54329/__writer_state")).json();
  expect(state.checkpoints).toHaveLength(1);
  await search.getByRole("button", { name: "Cerrar Buscar en Writer" }).click();

  await page.getByRole("button", { name: /Versiones/ }).click();
  const versions = page.getByRole("dialog", { name: "Versiones" });
  await expect(versions.getByText("Antes de Reemplazar todos", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await versions.getByRole("button", { name: "Restaurar" }).first().click();
  await expect(page.getByLabel("Editor de guion")).toContainText("Acción de prueba 1.");
  await versions.getByRole("button", { name: "Cerrar Versiones" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>(".writer-workspace, .writer-editor-area, .writer-paper-sheet")]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.left < -1 || rect.right > viewport + 1 || rect.width > viewport + 1);
    return { offenders: offenders.length, scrollWidth: document.documentElement.scrollWidth, viewport };
  });
  expect(geometry.offenders).toBe(0);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport + 1);
});
