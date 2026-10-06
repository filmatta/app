import { expect, test, type BrowserContext, type Locator, type Page, type Route } from "@playwright/test";
import fs from "node:fs";

const scriptId = "11111111-1111-4111-8111-111111111111";
const sceneA = "11111111-1111-4111-8111-111111111101";
const sceneB = "11111111-1111-4111-8111-111111111108";
const evidence = "test-results/writer-beta-handoff";

async function session(context: BrowserContext) { const b64=(value:object)=>Buffer.from(JSON.stringify(value)).toString("base64url"); const token=`${b64({alg:"HS256",typ:"JWT"})}.${b64({sub:scriptId,exp:4102444800,role:"authenticated"})}.local-signature`; await context.addCookies([{name:"sb-127-auth-token",value:"base64-"+b64({access_token:token,refresh_token:"local-refresh",expires_at:4102444800,token_type:"bearer",user:{id:scriptId}}),domain:"127.0.0.1",path:"/"}]); }
function state() { const analysisVersion="narrative-pulse-v4:context-v1:aaaaaaaaaaaaaaaa"; return { currentSourceHash:"a".repeat(64),currentAnalysisVersion:analysisVersion, analysis:{id:"55555555-5555-4555-8555-555555555551",sourceHash:"a".repeat(64),analysisVersion,model:"gpt-5.6-terra",status:"fresh",errorCode:null,updatedAt:"2026-09-30T12:00:00Z"}, points:[{id:"66666666-6666-4666-8666-666666666661",analysisId:"55555555-5555-4555-8555-555555555551",sceneId:sceneA,intensity:28,signals:["activity"],note:"La escena establece una búsqueda contenida."},{id:"66666666-6666-4666-8666-666666666662",analysisId:"55555555-5555-4555-8555-555555555551",sceneId:sceneB,intensity:76,signals:["revelation","turn"],note:"La revelación cambia el objetivo."}], milestones:[{id:"77777777-7777-4777-8777-777777777771",scriptId,sceneId:sceneB,type:"midpoint",label:"Revelación central",explanation:"La información altera la dirección.",status:"suggested",source:"ai",sourceHash:"a".repeat(64),fingerprint:"ai:midpoint",movedByUser:false,updatedAt:"2026-09-30T12:00:00Z"}], zones:[{id:"88888888-8888-4888-8888-888888888881",analysisId:"55555555-5555-4555-8555-555555555551",startSceneId:sceneA,endSceneId:sceneB,type:"build",note:"La presión aumenta entre ambas escenas."}] }; }
async function mockPulse(page: Page) { const data=state(); let posts=0; await page.route(`**/api/writer/scripts/${scriptId}/narrative-pulse`,async(route:Route)=>{ const method=route.request().method(); if(method==="GET") return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)}); if(method==="POST"){posts+=1;return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});} const body=route.request().postDataJSON() as Record<string,string>; if(body.action==="status"){const item=data.milestones.find((value)=>value.id===body.milestoneId);if(item)item.status=body.status;} if(body.action==="move"){const item=data.milestones.find((value)=>value.id===body.milestoneId);if(item){item.sceneId=body.sceneId;item.status="confirmed";item.movedByUser=true;}} if(body.action==="create") data.milestones.push({...data.milestones[0],id:"77777777-7777-4777-8777-777777777772",sceneId:body.sceneId,type:body.type,label:body.label,status:"manual",source:"user",fingerprint:"user:1"}); return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({saved:true})}); }); return ()=>posts; }

function longSceneId(index: number) { return `11111111-1111-4111-8111-${(index * 3 + 1).toString(16).padStart(12, "0")}`; }
function denseState(count = 36) {
  const points = Array.from({ length: count }, (_, index) => ({
    id: `66666666-6666-4666-8666-${String(index + 1).padStart(12, "0")}`,
    analysisId: "55555555-5555-4555-8555-555555555552",
    sceneId: longSceneId(index),
    intensity: 14 + ((index * 19) % 83),
    signals: index % 7 === 0 ? ["revelation", "turn"] : ["activity"],
    note: `Lectura sintética verificable de la escena ${index + 1}.`,
    dimensions: { threat: (index * 13) % 100, pressure: (index * 17) % 100, stakes: (index * 11) % 100, emotion: (index * 23) % 100, revelation: (index * 29) % 100, urgency: (index * 31) % 100 },
    evidence: [`Acción de prueba ${index + 1}.`],
  }));
  const analysisVersion = "narrative-pulse-v4:context-v1:bbbbbbbbbbbbbbbb";
  return { currentSourceHash:"b".repeat(64), currentAnalysisVersion:analysisVersion, analysis:{id:"55555555-5555-4555-8555-555555555552",sourceHash:"b".repeat(64),analysisVersion,model:"gpt-5.6-terra",status:"fresh",errorCode:null,updatedAt:"2026-10-05T12:00:00Z"}, points, milestones:[], zones:[] };
}
async function mockDensePulse(page: Page, count = 36) {
  const data = denseState(count);
  await page.route(`**/api/writer/scripts/${scriptId}/narrative-pulse`, async (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) }));
}

test.beforeEach(async({request,context})=>{await request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");await session(context);});

test("desktop keeps Observations active while splitters and Timeline Pulse switch work together",async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  const posts=await mockPulse(page);
  await page.goto(`/writer/${scriptId}`);

  const observationsButton=page.getByRole("button",{name:"Asistente",exact:true});
  const observations=page.getByRole("complementary",{name:"Asistente"});
  const reviewTab=page.getByRole("navigation",{name:"Secciones del Asistente"}).getByRole("button",{name:"Formato"});
  await expect(observationsButton).toHaveAttribute("aria-expanded","true");
  await expect(observations).toBeVisible();
  await expect(reviewTab).toHaveAttribute("aria-current","page");

  const rightSplitter=page.getByRole("separator",{name:"Cambiar ancho del Asistente"});
  await expect(rightSplitter).toHaveAttribute("aria-valuenow","360");
  await rightSplitter.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(rightSplitter).toHaveAttribute("aria-valuenow","376");

  const panel=page.locator("#writer-timeline-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("button",{name:"Narrative Pulse",exact:true}).click();
  await expect(panel.getByRole("heading",{name:"Intensidad narrativa"})).toBeVisible();
  await expect(panel.locator(".writer-pulse-point")).toHaveCount(2);
  await expect(panel.locator(".writer-pulse-point").first()).toHaveAttribute("data-raw-intensity", "28");
  await expect(panel.locator(".writer-pulse-point").last()).toHaveAttribute("data-raw-intensity", "76");
  const displayed = await panel.locator(".writer-pulse-point").evaluateAll((nodes) => nodes.map((node) => Number((node as HTMLElement).dataset.displayIntensity)));
  expect(displayed[1] - displayed[0]).toBeGreaterThanOrEqual(65);
  await expect.poll(() => pulseAlignmentError(panel)).toBeLessThan(1);
  const pulsePoints = panel.locator(".writer-pulse-point");
  await pulsePoints.first().click();
  await expect(panel.locator(".writer-pulse-detail").getByRole("heading", { name: /INT\. ESTUDIO/ })).toBeVisible();
  await expect(page.locator(".writer-scene-list > li").first()).toHaveClass(/is-active/);
  await expect(page.locator(`[data-block-id="${sceneA}"]`)).toHaveClass(/writer-scene-target-highlight/);
  await expect(panel.getByRole("heading", { name: "Intensidad narrativa" })).toBeVisible();
  await pulsePoints.last().press("Space");
  await expect(page.locator(".writer-scene-list > li").nth(1)).toHaveClass(/is-active/);
  await expect(page.locator(`[data-block-id="${sceneB}"]`)).toHaveClass(/writer-scene-target-highlight/);
  await panel.locator(".writer-pulse-canvas").click({ position: { x: 8, y: 8 } });
  await expect(pulsePoints.last()).not.toHaveClass(/is-selected/);
  await expect(page.locator(".writer-scene-list > li").nth(1)).toHaveClass(/is-active/);
  await pulsePoints.first().press("Enter");
  await page.keyboard.press("Escape");
  await expect(pulsePoints.first()).not.toHaveClass(/is-selected/);
  await expect(page.locator(".writer-scene-list > li").first()).toHaveClass(/is-active/);
  const timelineSplitter = page.getByRole("separator", { name: "Cambiar altura de Timeline y Narrative Pulse" });
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await page.getByRole("button", { name: "Ocultar Asistente" }).click();
    await expect(observations).toBeHidden();
    await expect.poll(() => pulseAlignmentError(panel)).toBeLessThan(1);
    await page.getByRole("button", { name: "Mostrar Asistente" }).click();
    await expect(observations).toBeVisible();
    await timelineSplitter.focus();
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => pulseAlignmentError(panel)).toBeLessThan(1);
    await page.keyboard.press("ArrowDown");
    await panel.getByRole("button", { name: "Expandir vista" }).click();
    await expect.poll(() => pulseAlignmentError(panel)).toBeLessThan(1);
    await panel.getByRole("button", { name: "Contraer vista" }).click();
    await pulsePoints.first().press("Enter");
    await expect(panel.locator(".writer-pulse-detail").getByRole("heading", { name: /INT\. ESTUDIO/ })).toBeVisible();
  }
  await expect(observations).toBeVisible();
  await expect(reviewTab).toHaveAttribute("aria-current","page");
  await expect(rightSplitter).toHaveAttribute("aria-valuenow","376");
  await expect.poll(posts).toBe(0);

  await panel.getByRole("button",{name:"Timeline",exact:true}).click();
  await expect(observations).toBeVisible();
  await expect(reviewTab).toHaveAttribute("aria-current","page");
  await expect(rightSplitter).toHaveAttribute("aria-valuenow","376");
  await panel.getByRole("button",{name:"Narrative Pulse",exact:true}).click();
  await panel.locator(".writer-pulse-point").last().press("Enter");
  await expect(page.locator(`[data-block-id="${sceneB}"]`)).toHaveClass(/writer-scene-target-highlight/);
  await panel.getByRole("button",{name:/Revelación central/}).last().click();
  await panel.getByRole("button",{name:"Confirmar"}).click();
  await expect(panel.getByRole("button",{name:/Revelación central/}).last()).toBeVisible();
  await panel.getByRole("button",{name:"Añadir hito"}).click();
  await panel.getByLabel("Nombre").fill("Primera decisión irreversible");
  await panel.getByRole("button",{name:"Guardar hito"}).click();
  await expect(panel.locator(".writer-pulse-milestone-list").getByRole("button",{name:/Primera decisión irreversible/})).toBeVisible();
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/pulse-hitos-carbon-1440x900.png` });
  await panel.locator(".writer-pulse-lower").screenshot({ path: `${evidence}/hitos-carbon-detail.png` });
  await panel.locator(".writer-pulse-milestone-list").evaluate((node) => node.scrollIntoView({ block: "center" }));
  await panel.locator(".writer-pulse-milestone-list").screenshot({ path: `${evidence}/hitos-carbon-controls.png` });
  const appearance = page.getByRole("button", { name: "Apariencia de Writer" });
  await appearance.click();
  let popover = page.getByRole("dialog", { name: "Apariencia de Writer" });
  await popover.getByRole("radio", { name: "Marino" }).click();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${evidence}/pulse-hitos-marino-1440x900.png` });
  await panel.locator(".writer-pulse-lower").screenshot({ path: `${evidence}/hitos-marino-detail.png` });
  await panel.locator(".writer-pulse-milestone-list").evaluate((node) => node.scrollIntoView({ block: "center" }));
  await panel.locator(".writer-pulse-milestone-list").screenshot({ path: `${evidence}/hitos-marino-controls.png` });
  await appearance.click();
  popover = page.getByRole("dialog", { name: "Apariencia de Writer" });
  await popover.getByRole("radio", { name: "Cream" }).click();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${evidence}/pulse-hitos-cream-1440x900.png` });
  await panel.locator(".writer-pulse-lower").screenshot({ path: `${evidence}/hitos-cream-detail.png` });
  await panel.locator(".writer-pulse-milestone-list").evaluate((node) => node.scrollIntoView({ block: "center" }));
  await panel.locator(".writer-pulse-milestone-list").screenshot({ path: `${evidence}/hitos-cream-controls.png` });
});

test("mobile Pulse fits, keeps drawer behavior and navigates by tap",async({page})=>{await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>localStorage.setItem("filmatta.writer.mobile-notice.v1:11111111-1111-4111-8111-111111111111","dismissed"));await mockPulse(page);await page.goto(`/writer/${scriptId}`);const observations=page.getByRole("complementary",{name:"Asistente"});await expect(observations).toBeHidden();await expect(page.getByRole("separator").first()).toBeHidden();await page.getByRole("button",{name:/Navegar/}).click();let navigate=page.getByRole("dialog",{name:"Navegar por el guion"});await navigate.getByRole("button",{name:/Asistente/}).click();await expect(observations).toBeVisible();await observations.getByRole("button",{name:"Cerrar",exact:true}).click();await page.getByRole("button",{name:/Navegar/}).click();navigate=page.getByRole("dialog",{name:"Navegar por el guion"});await navigate.getByRole("button",{name:"Timeline"}).click();const panel=page.locator("#writer-timeline-panel");await panel.getByRole("button",{name:"Narrative Pulse",exact:true}).click();await expect(panel.getByRole("heading",{name:"Intensidad narrativa"})).toBeVisible();await expect.poll(()=>panel.evaluate((element)=>element.scrollWidth<=element.clientWidth+1)).toBe(true);fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:`${evidence}/pulse-mobile-390x844.png`});await panel.locator(".writer-pulse-point").first().press("Enter");await expect(page.locator(`[data-block-id="${sceneA}"]`)).toHaveClass(/writer-scene-target-highlight/);await expectTooltipInsideViewport(page,page.getByRole("tooltip"));await expect(panel).toBeVisible();await expect(panel.getByRole("heading",{name:"Intensidad narrativa"})).toBeVisible();});

test("40-scene Pulse keeps canonical point navigation reliable through layout and scroll changes", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await page.request.get("http://127.0.0.1:54329/__scenario?value=writer-ux&writerPulseDense=1");
  await mockDensePulse(page, 40);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/writer/${scriptId}`);
  const panel = page.locator("#writer-timeline-panel");
  await panel.getByRole("button", { name: "Narrative Pulse", exact: true }).click();
  const points = panel.locator(".writer-pulse-point");
  await expect(points).toHaveCount(40);
  const scroller = panel.locator(".writer-pulse-scroll");
  const results: Array<{ phase: string; expected: string; actual: string | null; contractVerified: boolean }> = [];
  const interactionContract: Array<{ method: "click" | "Enter" | "Space" | "tap"; phase: string; sceneId: string; activeScene: boolean; centered: boolean; highlighted: boolean }> = [];

  const selectAtRealCoordinates = async (index: number, phase: string, verifyContract = false) => {
    const target = points.nth(index);
    await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
    await target.evaluate((element) => {
      const scroller = element.closest<HTMLElement>(".writer-pulse-scroll");
      if (scroller) scroller.scrollLeft = Math.max(0, (element as HTMLElement).offsetLeft - scroller.clientWidth / 2);
    });
    await expect.poll(async () => {
      const [targetBox, scrollBox] = await Promise.all([target.boundingBox(), scroller.boundingBox()]);
      const viewport = page.viewportSize();
      return Boolean(targetBox && scrollBox && viewport && targetBox.x >= Math.max(0, scrollBox.x) && targetBox.x + targetBox.width <= Math.min(viewport.width, scrollBox.x + scrollBox.width) && targetBox.y >= 0 && targetBox.y + targetBox.height <= viewport.height);
    }).toBe(true);
    const box = await target.boundingBox();
    expect(box, `missing hit target in ${phase}`).not.toBeNull();
    const hit = await page.evaluate(({ x, y }) => { const element = document.elementFromPoint(x, y) as HTMLElement | null; return { sceneId: element?.closest<HTMLElement>("[data-pulse-scene-id]")?.dataset.pulseSceneId ?? null, tag: element?.tagName ?? null, className: element?.className?.toString() ?? null, ariaLabel: element?.getAttribute("aria-label") ?? null, parentTag: element?.parentElement?.tagName ?? null, parentClass: element?.parentElement?.className?.toString() ?? null, parentAria: element?.parentElement?.getAttribute("aria-label") ?? null }; }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
    expect(hit.sceneId, `hit target mismatch in ${phase}: ${JSON.stringify(hit)}`).toBe(longSceneId(index));
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    const expected = longSceneId(index);
    await expect(panel.locator(".writer-pulse-point.is-selected")).toHaveAttribute("data-pulse-scene-id", expected);
    await expect(page.locator(`.writer-scene-list > li[data-writer-scene-id="${expected}"]`)).toHaveClass(/is-active/);
    if (verifyContract) {
      await expectWriterSceneNavigation(page, expected);
      interactionContract.push({ method: "click", phase, sceneId: expected, activeScene: true, centered: true, highlighted: true });
    }
    const actual = await page.locator(".writer-scene-list > li.is-active").getAttribute("data-writer-scene-id");
    results.push({ phase, expected, actual, contractVerified: verifyContract });
  };
  const alternate = async (count: number, phase: string) => {
    for (let cycle = 0; cycle < count; cycle += 1) await selectAtRealCoordinates(cycle % 2 ? 31 : 3, phase, cycle === 0);
  };

  await alternate(50, "baseline");

  for (let cycle = 0; cycle < 20; cycle += 1) {
    await page.setViewportSize({ width: cycle % 2 ? 1024 : 1440, height: cycle % 3 ? 820 : 900 });
    await expect.poll(() => pulseAlignmentError(panel)).toBeLessThan(1);
    await selectAtRealCoordinates(cycle % 2 ? 28 : 5, "viewport-resize", cycle === 0);
  }

  for (let cycle = 0; cycle < 20; cycle += 1) {
    await panel.getByRole("button", { name: "Timeline", exact: true }).click();
    await panel.getByRole("button", { name: "Narrative Pulse", exact: true }).click();
    await selectAtRealCoordinates(cycle % 2 ? 30 : 4, "timeline-pulse", cycle === 0);
  }

  for (let cycle = 0; cycle < 20; cycle += 1) {
    await panel.getByRole("button", { name: cycle % 2 ? "Contraer vista" : "Expandir vista" }).click();
    await expect.poll(() => pulseAlignmentError(panel)).toBeLessThan(1);
    await selectAtRealCoordinates(cycle % 2 ? 27 : 6, "expand-collapse", cycle === 0);
  }

  for (let cycle = 0; cycle < 20; cycle += 1) {
    await scroller.evaluate((element, ratio) => { element.scrollLeft = (element.scrollWidth - element.clientWidth) * ratio; }, cycle % 2 ? 1 : 0);
    await selectAtRealCoordinates(cycle % 2 ? 34 : 1, "horizontal-scroll", cycle === 0);
  }

  for (const index of [8, 17, 26, 39]) {
    const method = index % 2 ? "Space" as const : "Enter" as const;
    await points.nth(index).press(method);
    await expectWriterSceneNavigation(page, longSceneId(index));
    interactionContract.push({ method, phase: "keyboard", sceneId: longSceneId(index), activeScene: true, centered: true, highlighted: true });
  }
  await points.nth(12).dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 8, isPrimary: true });
  await points.nth(12).dispatchEvent("pointerup", { pointerType: "touch", pointerId: 8, isPrimary: true });
  await points.nth(12).dispatchEvent("click", { detail: 1 });
  await expectWriterSceneNavigation(page, longSceneId(12));
  interactionContract.push({ method: "tap", phase: "touch-sequence", sceneId: longSceneId(12), activeScene: true, centered: true, highlighted: true });

  const tooltipIndices = await points.evaluateAll((nodes) => {
    const values = nodes.map((node, index) => ({ index, y: Number((node as HTMLElement).dataset.plotY) }));
    return [0, values.reduce((best, value) => value.y > best.y ? value : best).index, nodes.length - 1];
  });
  for (const index of tooltipIndices) {
    const point = points.nth(index);
    await point.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
    await point.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expectTooltipInsideViewport(page, tooltip);
  }
  await page.setViewportSize({ width: 1024, height: 820 });
  const lateralPoint = points.last();
  await lateralPoint.evaluate((element) => {
    const container = element.closest<HTMLElement>(".writer-pulse-scroll");
    if (container) container.scrollLeft = Math.max(0, (element as HTMLElement).offsetLeft - container.clientWidth / 2);
  });
  await expect.poll(async () => {
    const [pointBox, scrollBox] = await Promise.all([lateralPoint.boundingBox(), scroller.boundingBox()]);
    const viewport = page.viewportSize();
    return Boolean(pointBox && scrollBox && viewport && pointBox.x >= Math.max(0, scrollBox.x) && pointBox.x + pointBox.width <= Math.min(viewport.width, scrollBox.x + scrollBox.width));
  }).toBe(true);
  await lateralPoint.hover();
  await expectTooltipInsideViewport(page, page.getByRole("tooltip"));
  await page.setViewportSize({ width: 1440, height: 900 });

  await panel.locator(".writer-pulse-canvas").click({ position: { x: 8, y: 8 } });
  await expect(panel.locator(".writer-pulse")).toHaveAttribute("data-pulse-selection", "overview");
  await page.locator(`.writer-scene-list > li[data-writer-scene-id="${longSceneId(20)}"] .writer-scene-link`).click();
  await expect(panel.locator(".writer-pulse")).toHaveAttribute("data-pulse-selection", "overview");

  expect(results).toHaveLength(130);
  expect(results.filter((result) => result.expected !== result.actual), JSON.stringify(results.filter((result) => result.expected !== result.actual))).toEqual([]);
  expect(results.filter((result) => result.contractVerified).map((result) => result.phase)).toEqual(["baseline", "viewport-resize", "timeline-pulse", "expand-collapse", "horizontal-scroll"]);
  expect(new Set(interactionContract.map((item) => item.method))).toEqual(new Set(["click", "Enter", "Space", "tap"]));
  fs.mkdirSync(evidence, { recursive: true });
  await testInfo.attach("pulse-selection-ledger", { body: Buffer.from(JSON.stringify(results, null, 2)), contentType: "application/json" });
  await testInfo.attach("pulse-navigation-contract", { body: Buffer.from(JSON.stringify(interactionContract, null, 2)), contentType: "application/json" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${evidence}/pulse-dense-overview-1440x900.png`, fullPage: false });
  await selectAtRealCoordinates(20, "violent-scene-evidence");
  await page.screenshot({ path: `${evidence}/pulse-dense-violent-scene-1440x900.png`, fullPage: false });
  await selectAtRealCoordinates(2, "quiet-scene-evidence");
  await page.screenshot({ path: `${evidence}/pulse-dense-quiet-scene-1440x900.png`, fullPage: false });
  await panel.getByRole("button", { name: "Expandir vista" }).click();
  await expect.poll(() => pulseAlignmentError(panel)).toBeLessThan(1);
  await page.screenshot({ path: `${evidence}/pulse-dense-expanded-1440x900.png`, fullPage: false });
});

test.describe("Pulse real touch activation", () => {
  test.use({ hasTouch: true });
  test("tap on a point resolves the canonical scene and keeps the navigation contract", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 820 });
    await mockPulse(page);
    await page.goto(`/writer/${scriptId}`);
    const panel = page.locator("#writer-timeline-panel");
    await panel.getByRole("button", { name: "Narrative Pulse", exact: true }).click();
    await panel.locator(".writer-pulse-point").last().tap();
    await expect(panel.locator(".writer-pulse-point.is-selected")).toHaveAttribute("data-pulse-scene-id", sceneB);
    await expectWriterSceneNavigation(page, sceneB);
    await testInfo.attach("pulse-real-touch-contract", { body: Buffer.from(JSON.stringify({ method: "tap", sceneId: sceneB, activeScene: true, centered: true, highlighted: true }, null, 2)), contentType: "application/json" });
  });
});

async function pulseAlignmentError(panel: Locator) {
  return panel.locator(".writer-pulse-canvas").evaluate((canvas) => {
    const path = canvas.querySelector<SVGPathElement>(".writer-pulse-curve")?.getAttribute("d") ?? "";
    const coordinates = [...path.matchAll(/[ML]([\d.]+),([\d.]+)/gu)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
    const bounds = canvas.getBoundingClientRect();
    const points = [...canvas.querySelectorAll<HTMLElement>(".writer-pulse-point")].map((point) => {
      const rect = point.getBoundingClientRect();
      return { x: rect.left + rect.width / 2 - bounds.left + canvas.scrollLeft, y: rect.top + rect.height / 2 - bounds.top };
    });
    return Math.max(0, ...points.map((point, index) => Math.hypot(point.x - coordinates[index].x, point.y - coordinates[index].y)));
  });
}

async function expectWriterSceneNavigation(page: Page, sceneId: string) {
  await expect(page.locator(`.writer-scene-list > li[data-writer-scene-id="${sceneId}"]`)).toHaveClass(/is-active/);
  const block = page.locator(`[data-block-id="${sceneId}"]`);
  await expect(block).toHaveClass(/writer-scene-target-highlight/);
  await expect.poll(() => block.evaluate((element) => {
    const paper = element.closest<HTMLElement>(".writer-paper");
    if (!paper) return false;
    const paperRect = paper.getBoundingClientRect();
    const blockRect = element.getBoundingClientRect();
    const delta = Math.abs((blockRect.top + blockRect.height / 2) - (paperRect.top + paperRect.height / 2));
    const atStart = paper.scrollTop <= 2;
    const atEnd = Math.abs(paper.scrollTop - (paper.scrollHeight - paper.clientHeight)) <= 2;
    const fullyVisible = blockRect.top >= paperRect.top - 1 && blockRect.bottom <= paperRect.bottom + 1;
    return delta <= paperRect.height * .3 || ((atStart || atEnd) && fullyVisible);
  })).toBe(true);
}

async function expectTooltipInsideViewport(page: Page, tooltip: Locator) {
  await expect.poll(async () => {
    const box = await tooltip.boundingBox();
    const viewport = page.viewportSize();
    return Boolean(box && viewport && box.x >= 9 && box.y >= 9 && box.x + box.width <= viewport.width - 9 && box.y + box.height <= viewport.height - 9);
  }).toBe(true);
}
