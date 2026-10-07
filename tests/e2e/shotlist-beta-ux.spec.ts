import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import * as XLSX from "xlsx";

const userId = "11111111-1111-4111-8111-111111111111";
const shotlistId = "44444444-4444-4444-8444-444444444444";
const previewAssetId = "55555555-5555-4555-8555-555555555555";
const previewPanelId = "66666666-6666-4666-8666-666666666666";
const evidence = "output/screenshots/shotlist-beta-ux-v1";
const carbonEvidence = "output/screenshots/shotlist-carbon-polish-v1";
const carbonV2Evidence = "output/screenshots/shotlist-carbon-ux-v2";

type Shot = {
  id: string; shotlistId: string; groupId: string; sourceBlockId: null; origin: "manual";
  shotType: string; composition: string | null; subject: string; angle: string; movement: string;
  support: string | null; lens: string | null; setup: string | null; durationSeconds: number | null;
  status: "pending" | "ready"; description: string | null; intention: string | null; notes: string | null;
  assetId: null; position: number; sourceRevision: null; revision: number;
};
type Group = { id: string; shotlistId: string; sourceSceneId: null; sourceSceneTitle: null; title: string; position: number; sourceStatus: "manual"; revision: number; shots: Shot[] };

async function session(context: BrowserContext) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: userId, exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64({ access_token: token, refresh_token: "local-refresh", expires_at: 4102444800, token_type: "bearer", user: { id: userId } }), domain: "127.0.0.1", path: "/" }]);
}

function fixture() {
  const groups: Group[] = [
    group("401", "INT. RADIO K-17 / CABINA — NOCHE", 0, 5),
    group("402", "EXT. AZOTEA — AMANECER", 1, 3, 5),
  ];
  return { id: shotlistId, scriptId: null, title: "LA FRECUENCIA — Shotlist Beta", sourceRevision: null, revision: 1, groups };
}

function group(suffix: string, title: string, position: number, count: number, offset = 0): Group {
  const id = `44444444-4444-4444-8444-444444444${suffix}`;
  return { id, shotlistId, sourceSceneId: null, sourceSceneTitle: null, title, position, sourceStatus: "manual", revision: 1, shots: Array.from({ length: count }, (_, index) => shot(id, index + offset, index)) };
}

function shot(groupId: string, index: number, position: number): Shot {
  return {
    id: `44444444-4444-4444-8444-${String(index + 100).padStart(12, "0")}`, shotlistId, groupId,
    sourceBlockId: null, origin: "manual", shotType: ["Plano general", "Plano medio", "Primer plano"][index % 3]!,
    composition: index % 2 ? "Regla de tercios" : "Centrada", subject: ["Mara entra en cuadro", "El técnico revisa la consola", "La alarma cambia a rojo"][index % 3]!,
    angle: index % 3 === 2 ? "Picado" : "A nivel", movement: index % 3 === 0 ? "Travelling lateral" : "Fijo",
    support: index % 3 === 0 ? "Dolly" : "Trípode", lens: ["24 mm", "50 mm", "85 mm"][index % 3]!,
    setup: String.fromCharCode(65 + (index % 3)), durationSeconds: 4 + index, status: index % 4 === 0 ? "ready" : "pending",
    description: "Cobertura de prueba local para verificar la Beta UX sin tocar datos reales.", intention: null,
    notes: index % 3 === 0 ? "Confirmar continuidad y reflejos." : null, assetId: null, position, sourceRevision: null, revision: 1,
  };
}

async function mockShotlistApi(page: Page, configure?: (state: ReturnType<typeof fixture>) => void) {
  const state = fixture();
  configure?.(state);
  let createdSequence = 0;
  await page.route(`**/api/writer/production-assets/${previewAssetId}`, (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#090909"/><path d="M80 710h1440M160 640l310-310 250 245 210-180 500 315" fill="none" stroke="#dce8eb" stroke-width="18"/><circle cx="1170" cy="250" r="110" fill="none" stroke="#ed5a55" stroke-width="18"/><rect x="110" y="90" width="420" height="120" rx="18" fill="#111" stroke="#79c8df" stroke-width="10"/><text x="150" y="165" fill="#f1efe9" font-family="Arial" font-size="58">PLANO 01 · QA</text></svg>` }));
  await page.route(`**/api/shotlists/${shotlistId}{,/**}`, async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const tail = url.pathname.slice(`/api/shotlists/${shotlistId}`.length);
    if (request.method() === "GET" && tail === "/proposals") return json(route, { proposals: [] });
    if (request.method() === "GET" && tail === "/storyboard") return json(route, { shotlist: { id: shotlistId, title: state.title, scriptId: null, revision: 1 }, groups: state.groups.map((group) => ({ ...group, shots: group.shots.map((item, index) => ({ ...item, contextHash: `context-${item.id}`, panels: group === state.groups[0] && index === 0 ? [{ id: previewPanelId, shotlistId, shotId: item.id, position: 0, currentRevisionId: "77777777-7777-4777-8777-777777777777", currentRevision: { id: "77777777-7777-4777-8777-777777777777", panelId: previewPanelId, revisionNumber: 1, schemaVersion: 1, baseAssetId: null, visualNote: "Mara frente a la consola", logicalWidth: 1600, logicalHeight: 900, contentKind: "drawing", contentHash: "preview", sourceShotRevision: 1, sourceContextHash: `context-${item.id}`, createdAt: "2026-10-06T00:00:00.000Z" }, approvedRevisionId: null, acknowledgedContextHash: null, previewAssetId, previewRevisionId: "77777777-7777-4777-8777-777777777777", renderStatus: "ready" }] : [] })) })) });
    if (request.method() === "GET" && tail === "/import") return json(route, { scripts: [] });
    if (request.method() === "POST" && tail === "/import") return route.fallback();
    if (request.method() === "GET" && tail === "") return json(route, { shotlist: state, sourceChanges: { renamed: [], reordered: false, missing: [], added: [] } });
    if (request.method() === "PATCH" && tail === "") {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (body.action === "previewDelete") {
        const ids = body.shotIds as string[];
        const shots = state.groups.flatMap((item) => item.shots).filter((item) => ids.includes(item.id)).map((item) => ({ id: item.id, revision: item.revision }));
        return json(route, { saved: false, shots, impact: { shots: shots.length, panels: 0, approvals: 0, productionItems: 0 } });
      }
      if (body.action === "updateShot") {
        const target = state.groups.flatMap((item) => item.shots).find((item) => item.id === body.shotId);
        if (target && target.revision !== body.expectedRevision) return json(route, { error: "El plano cambió en otra pestaña.", code: "conflict" }, 409);
        if (target) { Object.assign(target, body.changes); target.revision += 1; state.revision += 1; }
        return json(route, { saved: true, revision: target?.revision ?? 1 });
      }
      if (body.action === "reorderShot") {
        const targetGroup = state.groups.find((item) => item.shots.some((shot) => shot.id === body.shotId));
        if (!targetGroup) return json(route, { error: "Plano no encontrado" }, 404);
        const index = targetGroup.shots.findIndex((item) => item.id === body.shotId);
        const [moved] = targetGroup.shots.splice(index, 1);
        targetGroup.shots.splice(Number(body.targetIndex), 0, moved!);
        targetGroup.shots.forEach((item, next) => { item.position = next; item.revision += 1; });
        state.revision += 1;
        return json(route, { saved: true });
      }
      if (body.action === "deleteShots") {
        const ids = body.shotIds as string[];
        for (const group of state.groups) group.shots = group.shots.filter((item) => !ids.includes(item.id));
        state.revision += 1;
        return json(route, { saved: true, id: ids.length });
      }
      if (body.action === "addGroup") {
        const id = `44444444-4444-4444-8444-${String(state.groups.length + 500).padStart(12, "0")}`;
        const target = typeof body.targetIndex === "number" ? body.targetIndex : state.groups.length;
        state.groups.splice(target, 0, { id, shotlistId, sourceSceneId: null, sourceSceneTitle: null, title: String(body.title), position: target, sourceStatus: "manual", revision: 1, shots: [] });
        state.groups.forEach((item, index) => { item.position = index; }); state.revision += 1;
        return json(route, { saved: true, id });
      }
      if (body.action === "addShot") {
        const targetGroup = state.groups.find((item) => item.id === body.groupId)!;
        const target = typeof body.targetIndex === "number" ? body.targetIndex : targetGroup.shots.length;
        const created = shot(targetGroup.id, state.groups.flatMap((item) => item.shots).length + 30 + createdSequence++, target);
        Object.assign(created, { shotType: "General", composition: null, subject: "", angle: "A nivel", movement: "Fijo", support: null, lens: null, setup: null, durationSeconds: null, status: "pending", description: null, intention: null, notes: null });
        targetGroup.shots.splice(target, 0, created); targetGroup.shots.forEach((item, index) => { item.position = index; }); state.revision += 1;
        return json(route, { saved: true, id: created.id });
      }
      return json(route, { saved: true });
    }
    return json(route, { error: "Ruta de fixture no preparada" }, 404);
  });
  return state;
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function openShotlist(page: Page, context: BrowserContext, width: number, height: number, configure?: (state: ReturnType<typeof fixture>) => void) {
  await page.request.get("http://127.0.0.1:54329/__scenario?value=shotlist-ux");
  await session(context);
  await page.setViewportSize({ width, height });
  const state = await mockShotlistApi(page, configure);
  await page.goto(`/shotlists/${shotlistId}`);
  await expect(page.getByRole("heading", { name: "Lista de planos" })).toBeVisible();
  if (!configure) await expect(page.getByText("8 planos visibles")).toBeVisible();
  return state;
}

test("desktop grid, keyboard, filters, badges, menus and dialogs produce visible persistent results", async ({ page, context }) => {
  fs.mkdirSync(evidence, { recursive: true });
  const state = await openShotlist(page, context, 1600, 1000);

  const first = page.getByRole("row", { name: /Plano 1:/u });
  await first.focus();
  await first.press("ArrowDown");
  await expect(page.getByRole("row", { name: /Plano 2:/u })).toHaveClass(/is-selected/u);

  await page.getByRole("button", { name: "◉ Asistido" }).click();
  await expect(page.getByText("IA: 0 llamadas")).toBeVisible();
  await page.getByRole("button", { name: "✎ Libre" }).click();

  await page.getByRole("button", { name: /Filtros/u }).click();
  const filterDialog = page.getByRole("dialog", { name: "Filtrar planos" });
  await filterDialog.getByLabel("Columna").selectOption("lens");
  await filterDialog.getByRole("checkbox", { name: /Seleccionar todos/u }).uncheck();
  await filterDialog.getByRole("checkbox", { name: /50 mm/u }).check();
  await filterDialog.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("3 de 8")).toBeVisible();
  await expect(page.getByRole("row", { name: /Plano 2:/u })).toBeVisible();
  await expect(page.getByRole("row", { name: /Plano 1:/u })).toHaveCount(0);
  await page.screenshot({ path: `${evidence}/01-grid-filtro-activo.png` });
  await page.getByRole("button", { name: "Limpiar filtros" }).click();

  const lens = page.getByRole("row", { name: /Plano 1:/u }).getByRole("button", { name: /Óptica: 24 mm/u });
  await lens.click();
  await page.getByRole("option", { name: "50 mm", exact: true }).click();
  await expect(page.getByRole("row", { name: /Plano 1:/u }).getByRole("button", { name: "Óptica: 50 mm", exact: true })).toBeVisible();
  await page.getByRole("row", { name: /Plano 1:/u }).getByRole("button", { name: "Óptica: 50 mm", exact: true }).click();
  const lensOptions = page.getByRole("listbox", { name: "Óptica" });
  await expect(lensOptions.getByRole("option", { name: "8 mm", exact: true })).toBeVisible();
  await expect(lensOptions.getByRole("option", { name: "300 mm", exact: true })).toBeVisible();
  await page.screenshot({ path: `${evidence}/06-focales-y-personalizada.png` });
  await lensOptions.getByLabel("Personalizada").fill("43 mm");
  await lensOptions.getByRole("button", { name: "Usar" }).click();
  await expect(page.getByRole("row", { name: /Plano 1:/u }).getByRole("button", { name: "Óptica: 43 mm", exact: true })).toBeVisible();
  await expect(page.getByText("● Guardado")).toBeVisible();
  await expect.poll(() => state.groups[0]!.shots[0]!.lens).toBe("43 mm");
  await page.getByRole("row", { name: /Plano 2:/u }).click();
  await page.getByRole("row", { name: /Plano 1:/u }).click();
  await expect(page.getByRole("row", { name: /Plano 1:/u }).getByRole("button", { name: "Óptica: 43 mm", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Archivo" }).click();
  await expect(page.getByRole("menu", { name: "Archivo" })).toBeVisible();
  await page.screenshot({ path: `${evidence}/02-menubar-grid-inspector.png` });
  await page.keyboard.press("Escape");

  const newSceneTrigger = page.getByRole("button", { name: "＋ Nueva escena" });
  await newSceneTrigger.click();
  await expect(newSceneTrigger).toHaveAttribute("aria-expanded", "true");
  const newScene = page.getByRole("dialog", { name: "Nueva escena" });
  await newScene.getByLabel("Nombre").fill("INT. BODEGA — DÍA");
  await page.screenshot({ path: `${evidence}/03-popup-nueva-escena.png` });
  await newScene.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByText("INT. BODEGA — DÍA", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "⇩ Importar" }).click();
  const importDialog = page.getByRole("dialog", { name: "Importar a Shotlist" });
  await expect(importDialog.getByRole("tab", { name: "Desde Writer" })).toBeVisible();
  await expect(importDialog.getByRole("tab", { name: "Desde archivo" })).toBeVisible();
  await importDialog.getByRole("tab", { name: "Desde archivo" }).click();
  const fileInput = importDialog.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: "shotlist.csv", mimeType: "text/csv", buffer: Buffer.from("Plano,Escena,Descripción,Óptica\n1,1,Plano general,35 mm\n2,1,Primer plano,85 mm", "utf8") });
  await expect(importDialog.getByText("2 filas", { exact: true })).toBeVisible();
  await expect(importDialog.getByRole("heading", { name: "Mapeo de columnas" })).toBeVisible();

  const sheet = XLSX.utils.aoa_to_sheet([["Plano", "Escena", "Descripción", "Óptica"], ["3", "2", "Detalle de manos", "50 mm"]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Cobertura");
  const xls = XLSX.write(workbook, { type: "buffer", bookType: "biff8" });
  await fileInput.setInputFiles({ name: "shotlist.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from(xls) });
  await expect(importDialog.getByText("1 filas", { exact: true })).toBeVisible();
  await expect(importDialog.getByText("Detalle de manos", { exact: true })).toBeVisible();
  const firstMapping = importDialog.locator(".shotlist-import-mapping select").first();
  await firstMapping.selectOption("scene");
  await expect(importDialog.getByText(/mapeo duplicado/u)).toBeVisible();
  await expect(importDialog.getByRole("button", { name: "Incorporar" })).toBeDisabled();
  await firstMapping.selectOption("number");
  await page.screenshot({ path: `${evidence}/04-popup-importar-sin-salir.png` });
  await importDialog.getByRole("button", { name: "Cerrar" }).click();

  await page.getByRole("button", { name: "⇧ Exportar" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Exportar Shotlist" });
  await expect(exportDialog.getByText("PDF tabular horizontal")).toBeVisible();
  await expect(exportDialog.getByText(/no desde una captura del grid/u)).toBeVisible();
});

test("touch-size viewport keeps contextual insertion reachable without hover", async ({ page, context }) => {
  fs.mkdirSync(evidence, { recursive: true });
  await openShotlist(page, context, 390, 844);
  await page.getByRole("button", { name: "Cerrar inspector" }).click();
  const insert = page.getByRole("button", { name: "Añadir plano aquí" }).first();
  await expect(insert).toBeVisible();
  await insert.click();
  await page.getByRole("button", { name: "Cerrar inspector" }).click();
  await expect(page.getByText("9 planos visibles")).toBeVisible();
  await page.screenshot({ path: `${evidence}/05-mobile-insercion-sin-hover.png` });
});

test("Carbon menubar, full-width scene bands and final insertion remain functional", async ({ page, context }) => {
  fs.mkdirSync(carbonEvidence, { recursive: true });
  const state = await openShotlist(page, context, 1440, 900);

  const menu = page.getByRole("navigation", { name: "Menú de aplicación de Shotlist" });
  const brand = page.getByRole("link", { name: "FILMATTA" });
  const menuBox = await menu.boundingBox();
  const brandBox = await brand.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(brandBox).not.toBeNull();
  expect(menuBox!.y).toBeLessThan(brandBox!.y);
  await expect(page.getByRole("button", { name: "Atrás en FILMATTA" })).toBeDisabled();

  await page.getByRole("button", { name: "Formato" }).click();
  for (const column of ["Descripción", "Composición", "Soporte", "Setup", "Duración", "Observaciones", "Storyboard"]) {
    const option = page.getByRole("menuitemcheckbox", { name: column });
    if (await option.getAttribute("aria-checked") === "false") await option.click();
  }
  await page.keyboard.press("Escape");

  const scroller = page.locator(".shotlist-grid-scroll");
  const firstGroup = page.locator(".shotlist-group").first();
  const firstRow = page.locator(".shotlist-row").first();
  await expect.poll(async () => {
    const groupWidth = (await firstGroup.boundingBox())?.width ?? 0;
    const rowWidth = (await firstRow.boundingBox())?.width ?? 0;
    return Math.abs(groupWidth - rowWidth);
  }).toBeLessThanOrEqual(1);
  await scroller.evaluate((node) => { node.scrollLeft = node.scrollWidth / 2; });
  await page.screenshot({ path: `${carbonEvidence}/01-carbon-menubar-escena-ancho-completo.png` });
  await scroller.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  await expect(firstGroup.getByRole("button", { name: "Acciones de INT. RADIO K-17 / CABINA — NOCHE", exact: true })).toBeVisible();

  const finalInsert = page.getByRole("button", { name: /Añadir plano después del último de/u }).last();
  await finalInsert.focus();
  await expect(finalInsert).toBeVisible();
  await page.screenshot({ path: `${carbonEvidence}/02-insercion-final-shotlist.png` });
  await finalInsert.click();
  await expect(page.getByText("9 planos visibles")).toBeVisible();
  expect(state.groups.at(-1)!.shots).toHaveLength(4);
  const persisted = await page.evaluate(async (id) => (await fetch(`/api/shotlists/${id}`, { cache: "no-store" })).json(), shotlistId);
  expect(persisted.shotlist.groups.at(-1).shots).toHaveLength(4);

  await page.getByRole("button", { name: "＋ Nueva escena" }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva escena" });
  await dialog.getByLabel("Nombre").fill("ESCENA VACÍA QA");
  await dialog.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByRole("button", { name: /Añadir plano después del último de/u }).last()).toBeVisible();
});

test("storyboard preview uses the representative panel in row and inspector without writes", async ({ page, context }) => {
  fs.mkdirSync(carbonEvidence, { recursive: true });
  await openShotlist(page, context, 1440, 900);
  const mutations: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/storyboard") && request.method() !== "GET") mutations.push(request.method()); });

  const firstRow = page.getByRole("row", { name: /Plano 1:/u });
  await firstRow.getByRole("button", { name: "Vista previa del storyboard del plano 1" }).click();
  const dialog = page.getByRole("dialog", { name: "Plano 01" });
  const dialogImage = dialog.getByRole("img", { name: "Storyboard del plano 1" });
  await expect(dialogImage).toHaveAttribute("src", `/api/writer/production-assets/${previewAssetId}`);
  await expect(dialog.getByRole("link", { name: "Abrir en Storyboard" })).toHaveAttribute("href", `/shotlists/${shotlistId}/storyboard/shots/${fixture().groups[0]!.shots[0]!.id}?panel=${previewPanelId}`);
  await page.screenshot({ path: `${carbonEvidence}/03-popup-preview-storyboard.png` });
  await page.keyboard.press("Escape");

  const inspector = page.locator(".shotlist-inspector");
  const inspectorImage = inspector.getByRole("img", { name: "Storyboard del plano 1" });
  await expect(inspectorImage).toHaveAttribute("src", `/api/writer/production-assets/${previewAssetId}`);
  await inspectorImage.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${carbonEvidence}/04-miniatura-storyboard-inspector.png` });

  const secondRow = page.getByRole("row", { name: /Plano 2:/u });
  await secondRow.getByRole("button", { name: "Vista previa del storyboard del plano 2" }).click();
  const emptyDialog = page.getByRole("dialog", { name: "Plano 02" });
  await expect(emptyDialog.getByText("Este plano aún no tiene storyboard.").first()).toBeVisible();
  await expect(emptyDialog.getByRole("img")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(mutations).toEqual([]);
});

test("Carbon V2 value filters, empty scene, assistance and export work through visible controls", async ({ page, context }) => {
  fs.mkdirSync(carbonV2Evidence, { recursive: true });
  const state = await openShotlist(page, context, 1440, 900);
  await page.screenshot({ path: `${carbonV2Evidence}/01-workspace-carbon.png` });

  await page.getByRole("button", { name: "◉ Asistido" }).click();
  const guide = page.locator(".shotlist-assisted-guide");
  const head = page.locator(".shotlist-grid-head");
  await expect(guide).toBeVisible();
  expect((await guide.boundingBox())!.y + (await guide.boundingBox())!.height).toBeLessThanOrEqual((await head.boundingBox())!.y + 1);
  await page.screenshot({ path: `${carbonV2Evidence}/03-asistido-sin-recorte.png` });
  await page.getByRole("button", { name: "✎ Libre" }).click();

  await page.getByRole("button", { name: /Filtros/u }).click();
  let dialog = page.getByRole("dialog", { name: "Filtrar planos" });
  await dialog.getByRole("checkbox", { name: /Seleccionar todos/u }).uncheck();
  await dialog.getByRole("checkbox", { name: /RADIO K-17/u }).check();
  await dialog.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("5 de 8")).toBeVisible();
  await page.getByRole("button", { name: /Filtros/u }).click();
  dialog = page.getByRole("dialog", { name: "Filtrar planos" });
  await dialog.getByLabel("Columna").selectOption("lens");
  await dialog.getByRole("checkbox", { name: /Seleccionar todos/u }).uncheck();
  await dialog.getByRole("checkbox", { name: /24 mm/u }).check();
  await dialog.getByRole("checkbox", { name: /50 mm/u }).check();
  await page.screenshot({ path: `${carbonV2Evidence}/04-filtros-valores-multiples.png` });
  await dialog.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("4 de 8")).toBeVisible();
  const visibleIds = await page.locator(".shotlist-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-shot-id")));
  expect(visibleIds).toEqual([state.groups[0]!.shots[0]!.id, state.groups[0]!.shots[1]!.id, state.groups[0]!.shots[3]!.id, state.groups[0]!.shots[4]!.id]);
  await page.getByRole("button", { name: /Filtros/u }).click();
  dialog = page.getByRole("dialog", { name: "Filtrar planos" });
  await dialog.getByLabel("Columna").selectOption("lens");
  await dialog.getByRole("checkbox", { name: /50 mm/u }).uncheck();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: /Filtros/u }).click();
  dialog = page.getByRole("dialog", { name: "Filtrar planos" });
  await dialog.getByLabel("Columna").selectOption("lens");
  await expect(dialog.getByRole("checkbox", { name: /50 mm/u })).toBeChecked();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "⇧ Exportar" }).click();
  await expect(page.getByRole("dialog", { name: "Exportar Shotlist" }).getByText("Resultado filtrado (4 planos)")).toBeVisible();
  await page.screenshot({ path: `${carbonV2Evidence}/06-exportar-sin-marcos.png` });
  await page.getByRole("dialog", { name: "Exportar Shotlist" }).getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Limpiar filtros" }).click();

  await page.getByRole("button", { name: "＋ Nueva escena" }).click();
  await page.getByRole("dialog", { name: "Nueva escena" }).getByLabel("Nombre").fill("INT. ARCHIVO QA — NOCHE");
  await page.getByRole("dialog", { name: "Nueva escena" }).getByRole("button", { name: "Crear" }).click();
  const empty = page.locator(".shotlist-group").last();
  await expect(empty.getByText("Esta escena aún no tiene planos.")).toBeVisible();
  await expect(empty.getByRole("button", { name: /Añadir plano después del último de/u })).toBeVisible();
  await page.screenshot({ path: `${carbonV2Evidence}/02-escena-vacia-anadir-plano.png` });
  await empty.getByRole("button", { name: /Añadir plano después del último de/u }).click();
  await expect(empty.getByRole("row")).toHaveCount(1);
  expect(state.groups.at(-1)!.shots).toHaveLength(1);
  await expect(empty.getByRole("row").getByRole("textbox", { name: "Acción" })).toBeFocused();
  const persisted = await page.evaluate(async (id) => (await fetch(`/api/shotlists/${id}`, { cache: "no-store" })).json(), shotlistId);
  expect(persisted.shotlist.groups.at(-1).shots).toHaveLength(1);
});

test("value catalogue includes a custom lens beyond the first 240 mounted rows", async ({ page, context }) => {
  await page.request.get("http://127.0.0.1:54329/__scenario?value=shotlist-ux");
  await session(context);
  const state = await mockShotlistApi(page);
  const target = state.groups[1]!;
  for (let index = target.shots.length; index < 3000; index += 1) target.shots.push(shot(target.id, index + 100, index));
  target.shots.at(-1)!.lens = "43 mm";
  await page.goto(`/shotlists/${shotlistId}`);
  await page.getByRole("button", { name: "＋ Plano" }).click();
  await expect(page.locator(".shotlist-summary")).toContainText("3006");
  expect(await page.locator(".shotlist-row").count()).toBeLessThan(3006);
  await page.getByRole("button", { name: /Filtros/u }).click();
  const dialog = page.getByRole("dialog", { name: "Filtrar planos" });
  await dialog.getByLabel("Columna").selectOption("lens");
  await expect(dialog.getByRole("checkbox", { name: /43 mm/u })).toBeVisible();
});

test("value checkbox label, Space, search, none and Escape keep one applied filter state", async ({ page, context }) => {
  const state = await openShotlist(page, context, 1440, 900);
  await page.getByRole("button", { name: /Filtros/u }).click();
  let dialog = page.getByRole("dialog", { name: "Filtrar planos" });
  await dialog.getByLabel("Columna").selectOption("lens");
  const all = dialog.getByRole("checkbox", { name: /Seleccionar todos/u });
  await all.uncheck();
  await dialog.getByRole("textbox", { name: "Buscar valor" }).fill("50");
  await dialog.getByText("Seleccionar resultados").click();
  await expect(dialog.getByRole("checkbox", { name: /50 mm/u })).toBeChecked();
  await dialog.getByRole("textbox", { name: "Buscar valor" }).fill("");
  expect(await all.evaluate((node: HTMLInputElement) => node.indeterminate)).toBe(true);
  await all.focus();
  await all.press("Space");
  await expect(all).toBeChecked();
  await all.press("Space");
  await expect(all).not.toBeChecked();
  await dialog.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("0 de 8")).toBeVisible();
  await page.getByRole("button", { name: /Filtros/u }).click();
  dialog = page.getByRole("dialog", { name: "Filtrar planos" });
  await dialog.getByLabel("Columna").selectOption("lens");
  await dialog.getByRole("checkbox", { name: /24 mm/u }).check();
  await dialog.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("3 de 8")).toBeVisible();
  expect(await page.locator(".shotlist-row").first().getAttribute("data-shot-id")).toBe(state.groups[0]!.shots[0]!.id);
  await page.getByRole("button", { name: /Filtros/u }).click();
  dialog = page.getByRole("dialog", { name: "Filtrar planos" });
  await dialog.getByLabel("Columna").selectOption("lens");
  await dialog.getByRole("checkbox", { name: /50 mm/u }).check();
  await dialog.press("Escape");
  await page.getByRole("button", { name: /Filtros/u }).click();
  dialog = page.getByRole("dialog", { name: "Filtrar planos" });
  await dialog.getByLabel("Columna").selectOption("lens");
  await expect(dialog.getByRole("checkbox", { name: /50 mm/u })).not.toBeChecked();
});

test("reselecting the current Writer source keeps its visible scene preview", async ({ page, context }) => {
  await openShotlist(page, context, 834, 900);
  const sourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await page.route(`**/api/shotlists/${shotlistId}/import**`, (route) => {
    const selected = new URL(route.request().url()).searchParams.get("scriptId");
    return json(route, selected ? { script: { id: sourceId, title: "Guion QA", revision: 1 }, scenes: [{ sceneId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", heading: "INT. ESCENA QA - NOCHE", context: "Acción sintética." }] } : { scripts: [{ id: sourceId, title: "Guion QA", revision: 1, updatedAt: "2026-10-07T00:00:00Z" }] });
  });
  await page.getByRole("button", { name: "⇩ Importar" }).click();
  const dialog = page.getByRole("dialog", { name: "Importar a Shotlist" });
  const selector = dialog.getByLabel("Guion propio");
  await selector.selectOption(sourceId);
  await expect(dialog.getByText("INT. ESCENA QA - NOCHE")).toBeVisible();
  await selector.selectOption(sourceId);
  await expect(dialog.getByText("INT. ESCENA QA - NOCHE")).toBeVisible();
  await selector.selectOption("");
  await expect(dialog.getByText("INT. ESCENA QA - NOCHE")).toHaveCount(0);
  await selector.selectOption(sourceId);
  await expect(dialog.getByText("INT. ESCENA QA - NOCHE")).toBeVisible();
});

test("Writer handoff, Storyboard and Production keep their approved surfaces", async ({ page, context }) => {
  await session(context);
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");
  await page.route(`**/api/writer/scripts/${userId}/shotlists`, (route) => json(route, { shotlists: [{ id: shotlistId, title: "LA FRECUENCIA — Shotlist Beta" }] }));
  await page.goto(`/writer/${userId}`);
  await expect(page.getByLabel("Editor de guion")).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir shotlist" })).toBeVisible();
  await page.request.get("http://127.0.0.1:54329/__scenario?value=shotlist-ux");
  await page.getByRole("button", { name: "Abrir shotlist" }).click();
  await expect(page).toHaveURL(`/shotlists/${shotlistId}`);
  await expect(page.getByRole("heading", { name: "Lista de planos" })).toBeVisible();

  await page.unrouteAll({ behavior: "wait" });
  await page.goto(`/shotlists/${shotlistId}/storyboard`);
  await expect(page.getByRole("navigation", { name: "Ruta" }).getByText("Storyboard", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LA FRECUENCIA — Shotlist Beta" })).toBeVisible();

  await page.goto("/production");
  await expect(page.getByRole("heading", { name: "De la escena al plan de rodaje." })).toBeVisible();
  await expect(page.getByText("Writer y Shotlist permanecen intactos")).toBeVisible();
});

test("V3 selection, clipboard, history, context and splitters use visible controls", async ({ page, context }) => {
  test.setTimeout(120000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await openShotlist(page, context, 1440, 900);
  fs.mkdirSync("output/screenshots/shotlist-interaction-v3", { recursive: true });
  await page.screenshot({ path: "output/screenshots/shotlist-interaction-v3/01-before-selection-1440.png" });

  const first = page.getByRole("checkbox", { name: "Seleccionar plano 1" });
  await first.check();
  await page.getByRole("checkbox", { name: "Seleccionar plano 3" }).click({ modifiers: ["Shift"] });
  await expect(page.getByText("3 planos seleccionados")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Seleccionar plano 2" })).toBeChecked();
  await expect(first).toHaveCSS("border-top-left-radius", "50%");
  await page.screenshot({ path: "output/screenshots/shotlist-interaction-v3/02-selection-1440.png" });

  await page.getByRole("button", { name: "Copiar", exact: true }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).includes("Plano 01")).toBe(true);
  const beforePaste = state.groups[0]!.shots.length;
  await page.getByRole("button", { name: "Pegar", exact: true }).click();
  await expect.poll(() => state.groups[0]!.shots.length).toBe(beforePaste + 3);
  await page.getByRole("button", { name: "Deshacer edición" }).click();
  await expect.poll(() => state.groups[0]!.shots.length).toBe(beforePaste);
  await page.getByRole("button", { name: "Rehacer edición" }).click();
  await expect.poll(() => state.groups[0]!.shots.length).toBe(beforePaste + 3);

  const selected = page.locator(".shotlist-row").filter({ has: page.getByRole("checkbox", { name: "Seleccionar plano 2" }) });
  await selected.click({ button: "right", position: { x: 78, y: 17 } });
  await expect(page.getByRole("menu", { name: "Acciones de planos" }).getByRole("menuitem", { name: "Duplicar (3)" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Acciones de planos" })).toHaveCount(0);

  await page.getByRole("button", { name: "Eliminar (3)" }).click();
  const dialog = page.getByRole("dialog", { name: "Eliminar 3 plano(s)" });
  await expect(dialog).toContainText("no se puede deshacer");
  await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("checkbox", { name: "Seleccionar plano 1", exact: true })).toBeChecked();

  const left = page.getByRole("separator", { name: "Ajustar ancho de escenas" });
  await left.focus();
  await left.press("ArrowRight");
  await expect(left).toHaveAttribute("aria-valuenow", "276");
  await left.dblclick();
  await expect(left).toHaveAttribute("aria-valuenow", "260");
  const right = page.getByRole("separator", { name: "Ajustar ancho del inspector" });
  await right.focus();
  await right.press("ArrowLeft");
  await expect(right).toHaveAttribute("aria-valuenow", "336");
  await page.screenshot({ path: "output/screenshots/shotlist-interaction-v3/03-after-interaction-1440.png" });

  await page.getByRole("button", { name: "Eliminar (3)" }).click();
  await page.getByRole("dialog", { name: "Eliminar 3 plano(s)" }).getByRole("button", { name: "Eliminar definitivamente" }).click();
  await expect.poll(() => state.groups[0]!.shots.length).toBe(5);
  await expect(page.getByRole("button", { name: "Deshacer edición" })).toBeDisabled();
  await page.reload();
  await expect(page.getByText("8 planos visibles")).toBeVisible();
});

test("V3 all filtered rows and prunes hidden selection", async ({ page, context }) => {
  test.setTimeout(90000);
  const state = await openShotlist(page, context, 1440, 900, (fixtureState) => {
    fixtureState.groups[0] = group("401", "INT. RADIO K-17 / CABINA — NOCHE", 0, 600);
    fixtureState.groups[1] = group("402", "EXT. AZOTEA — AMANECER", 1, 0);
  });
  // La primera pintura viene del fixture SSR (8 filas); una mutación visible fuerza
  // la recarga cliente con el fixture grande de esta prueba.
  await page.getByRole("button", { name: "＋ Plano" }).click();
  await expect(page.getByText("601 planos", { exact: false }).first()).toBeVisible();
  await page.getByRole("checkbox", { name: "Seleccionar todos los planos filtrados" }).check();
  await expect(page.getByText("601 planos seleccionados")).toBeVisible();
  await page.getByPlaceholder("Buscar descripción u observaciones…").fill("Mara");
  await expect(page.getByText("200 planos seleccionados")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("salieron de la selección");
  await page.getByRole("button", { name: /MANUAL · INT. RADIO/u }).click();
  await expect(page.getByText("200 planos seleccionados")).toBeVisible();
  await page.getByRole("button", { name: /MANUAL · INT. RADIO/u }).click();
  const footer = page.getByRole("button", { name: /Añadir plano después del último de INT. RADIO/u });
  await footer.click();
  await expect.poll(() => state.groups[0]!.shots.length).toBe(602);
  await expect(page.getByText("El plano nuevo se muestra temporalmente")).toBeVisible();
  await expect(page.locator(`[data-shot-id="${state.groups[0]!.shots.at(-1)!.id}"]`)).toBeVisible();
});

test("V3 responsive plus, search focus and sidebar persistence", async ({ page, context }) => {
  test.setTimeout(90000);
  await openShotlist(page, context, 834, 900);
  fs.mkdirSync("output/screenshots/shotlist-interaction-v3", { recursive: true });
  const end = page.getByRole("button", { name: /Añadir plano después del último de/u }).first();
  await expect(end).toBeVisible();
  await page.screenshot({ path: "output/screenshots/shotlist-interaction-v3/04-tablet-834.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Cerrar inspector" }).click();
  await expect(end).toBeVisible();
  await page.screenshot({ path: "output/screenshots/shotlist-interaction-v3/05-mobile-390.png" });
  await end.click();
  await expect(page.getByRole("button", { name: "Cerrar inspector" })).toBeVisible();
  await page.screenshot({ path: "output/screenshots/shotlist-interaction-v3/05b-mobile-added-390.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  const search = page.getByPlaceholder("Buscar descripción u observaciones…");
  await search.click();
  await expect(search).toBeFocused();
  await expect(search).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: "output/screenshots/shotlist-interaction-v3/06-search-focus-1440.png" });
  const left = page.getByRole("separator", { name: "Ajustar ancho de escenas" });
  await left.focus(); await left.press("ArrowRight");
  await expect(left).toHaveAttribute("aria-valuenow", "276");
  await page.reload();
  await expect(page.getByRole("separator", { name: "Ajustar ancho de escenas" })).toHaveAttribute("aria-valuenow", "276");
});

test("V3 clipboard read denial uses explicit paste and deletion blocks Production dependencies", async ({ page, context }) => {
  test.setTimeout(90000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await openShotlist(page, context, 1440, 900);
  await page.getByRole("checkbox", { name: "Seleccionar plano 1", exact: true }).check();
  await page.getByRole("button", { name: "Copiar", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, "readText", { value: () => Promise.reject(new Error("denied")) }));
  await page.getByRole("button", { name: "Pegar", exact: true }).click();
  const fallback = page.getByRole("dialog", { name: "Pegar planos" });
  await expect(fallback).toBeVisible();
  await fallback.getByRole("textbox", { name: "Texto copiado de los planos" }).fill(copied);
  await fallback.getByRole("button", { name: "Comprobar y pegar" }).click();
  await expect.poll(() => state.groups[0]!.shots.length).toBe(6);

  await page.route(`**/api/shotlists/${shotlistId}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.action !== "previewDelete") return route.fallback();
    return json(route, { saved: false, shots: [{ id: state.groups[0]!.shots[0]!.id, revision: state.groups[0]!.shots[0]!.revision }], impact: { shots: 1, panels: 0, approvals: 0, productionItems: 1 } });
  });
  await page.getByRole("button", { name: "Eliminar (1)" }).click();
  const dialog = page.getByRole("dialog", { name: "Eliminar 1 plano(s)" });
  await expect(dialog).toContainText("Production impiden eliminar");
  await expect(dialog.getByRole("button", { name: "Eliminar definitivamente" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect.poll(() => state.groups[0]!.shots.length).toBe(6);
});

test("V3 external revision conflict does not fake Undo or overwrite a field", async ({ page, context }) => {
  test.setTimeout(90000);
  const state = await openShotlist(page, context, 1440, 900);
  const firstAction = page.locator(`[data-shot-id="${state.groups[0]!.shots[0]!.id}"]`).getByRole("textbox", { name: "Acción" });
  await firstAction.fill("Acción editada para QA");
  await firstAction.press("Tab");
  await expect.poll(() => state.groups[0]!.shots[0]!.subject).toBe("Acción editada para QA");
  await expect(page.getByRole("button", { name: "Deshacer edición" })).toBeEnabled();
  state.revision += 1; // Simula otra pestaña; el clic siguiente sigue siendo sobre el control visible.
  await page.getByRole("button", { name: "Deshacer edición" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "cambió en otra pestaña" })).toBeVisible();
  expect(state.groups[0]!.shots[0]!.subject).toBe("Acción editada para QA");
});

test("V3 checkbox keyboard, Shift range, context singleton and editable text keep distinct actions", async ({ page, context }) => {
  await openShotlist(page, context, 1440, 900);
  const first = page.getByRole("checkbox", { name: "Seleccionar plano 1", exact: true });
  const third = page.getByRole("checkbox", { name: "Seleccionar plano 3", exact: true });
  await first.focus();
  await first.press("Space");
  await expect(first).toBeChecked();
  await page.keyboard.down("Shift");
  await third.click();
  await page.keyboard.up("Shift");
  await expect(page.getByText("3 planos seleccionados")).toBeVisible();
  await page.getByRole("row", { name: /Plano 4:/u }).click({ button: "right", position: { x: 76, y: 17 } });
  await expect(page.getByText("1 plano seleccionado")).toBeVisible();
  await expect(page.getByRole("menu", { name: "Acciones de planos" }).getByRole("menuitem", { name: "Eliminar", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const action = page.getByRole("row", { name: /Plano 4:/u }).getByRole("textbox", { name: "Acción" });
  await action.click({ button: "right" });
  await expect(page.getByRole("menu", { name: "Acciones de planos" })).toHaveCount(0);
  await action.press("Delete");
  await expect(page.getByRole("dialog", { name: /Eliminar/u })).toHaveCount(0);
});

test("V3 splitter pointer drag survives a storage failure without moving the document", async ({ page, context }) => {
  const state = await openShotlist(page, context, 1440, 900);
  const left = page.getByRole("separator", { name: "Ajustar ancho de escenas" });
  const right = page.getByRole("separator", { name: "Ajustar ancho del inspector" });
  const before = state.groups[0]!.shots.map((shot) => shot.id);
  const box = (await left.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 32, box.y + 100, { steps: 4 });
  await page.mouse.up();
  await expect(left).toHaveAttribute("aria-valuenow", "292");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("filmatta:shotlist:panel-widths:")) throw new Error("storage unavailable");
      return original.call(this, key, value);
    };
  });
  await right.focus();
  await right.press("ArrowLeft");
  await expect(right).toHaveAttribute("aria-valuenow", "336");
  await expect(page.getByRole("status").filter({ hasText: "no pudimos conservarlo" })).toBeVisible();
  expect(state.groups[0]!.shots.map((shot) => shot.id)).toEqual(before);
});
