import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const scriptId = "11111111-1111-4111-8111-111111111111";
const sceneA = "11111111-1111-4111-8111-111111111101";
const sceneB = "11111111-1111-4111-8111-111111111108";

async function session(context: BrowserContext) { const b64=(value:object)=>Buffer.from(JSON.stringify(value)).toString("base64url"); const token=`${b64({alg:"HS256",typ:"JWT"})}.${b64({sub:scriptId,exp:4102444800,role:"authenticated"})}.local-signature`; await context.addCookies([{name:"sb-127-auth-token",value:"base64-"+b64({access_token:token,refresh_token:"local-refresh",expires_at:4102444800,token_type:"bearer",user:{id:scriptId}}),domain:"127.0.0.1",path:"/"}]); }
function state() { return { currentSourceHash:"a".repeat(64), analysis:{id:"55555555-5555-4555-8555-555555555551",sourceHash:"a".repeat(64),analysisVersion:"narrative-pulse-v1",model:"gpt-5.6-terra",status:"fresh",errorCode:null,updatedAt:"2026-09-30T12:00:00Z"}, points:[{id:"66666666-6666-4666-8666-666666666661",analysisId:"55555555-5555-4555-8555-555555555551",sceneId:sceneA,intensity:28,signals:["activity"],note:"La escena establece una búsqueda contenida."},{id:"66666666-6666-4666-8666-666666666662",analysisId:"55555555-5555-4555-8555-555555555551",sceneId:sceneB,intensity:76,signals:["revelation","turn"],note:"La revelación cambia el objetivo."}], milestones:[{id:"77777777-7777-4777-8777-777777777771",scriptId,sceneId:sceneB,type:"midpoint",label:"Revelación central",explanation:"La información altera la dirección.",status:"suggested",source:"ai",sourceHash:"a".repeat(64),fingerprint:"ai:midpoint",movedByUser:false,updatedAt:"2026-09-30T12:00:00Z"}], zones:[{id:"88888888-8888-4888-8888-888888888881",analysisId:"55555555-5555-4555-8555-555555555551",startSceneId:sceneA,endSceneId:sceneB,type:"build",note:"La presión aumenta entre ambas escenas."}] }; }
async function mockPulse(page: Page) { const data=state(); let posts=0; await page.route(`**/api/writer/scripts/${scriptId}/narrative-pulse`,async(route:Route)=>{ const method=route.request().method(); if(method==="GET") return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)}); if(method==="POST"){posts+=1;return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});} const body=route.request().postDataJSON() as Record<string,string>; if(body.action==="status"){const item=data.milestones.find((value)=>value.id===body.milestoneId);if(item)item.status=body.status;} if(body.action==="move"){const item=data.milestones.find((value)=>value.id===body.milestoneId);if(item){item.sceneId=body.sceneId;item.status="confirmed";item.movedByUser=true;}} if(body.action==="create") data.milestones.push({...data.milestones[0],id:"77777777-7777-4777-8777-777777777772",sceneId:body.sceneId,type:body.type,label:body.label,status:"manual",source:"user",fingerprint:"user:1"}); return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({saved:true})}); }); return ()=>posts; }

test.beforeEach(async({request,context})=>{await request.get("http://127.0.0.1:54329/__scenario?value=writer-ux");await session(context);});

test("desktop keeps Observations active while splitters and Timeline Pulse switch work together",async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  const posts=await mockPulse(page);
  await page.goto(`/writer/${scriptId}`);

  const observationsButton=page.getByRole("button",{name:/Observaciones/});
  const observations=page.getByRole("complementary",{name:"Observaciones"});
  const reviewTab=page.getByRole("navigation",{name:"Secciones de Observaciones"}).getByRole("button",{name:/Revisión/});
  await expect(observationsButton).toHaveAttribute("aria-expanded","true");
  await expect(observations).toBeVisible();
  await expect(reviewTab).toHaveAttribute("aria-current","page");

  const rightSplitter=page.getByRole("separator",{name:"Cambiar ancho del panel de observaciones"});
  await expect(rightSplitter).toHaveAttribute("aria-valuenow","360");
  await rightSplitter.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(rightSplitter).toHaveAttribute("aria-valuenow","376");

  const panel=page.locator("#writer-timeline-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("button",{name:"Narrative Pulse",exact:true}).click();
  await expect(panel.getByRole("heading",{name:"Intensidad narrativa"})).toBeVisible();
  await expect(panel.locator(".writer-pulse-point")).toHaveCount(2);
  await expect(observations).toBeVisible();
  await expect(reviewTab).toHaveAttribute("aria-current","page");
  await expect(rightSplitter).toHaveAttribute("aria-valuenow","376");
  await expect.poll(posts).toBe(0);

  await panel.getByRole("button",{name:"Timeline",exact:true}).click();
  await expect(observations).toBeVisible();
  await expect(reviewTab).toHaveAttribute("aria-current","page");
  await expect(rightSplitter).toHaveAttribute("aria-valuenow","376");
  await panel.getByRole("button",{name:"Narrative Pulse",exact:true}).click();
  await panel.getByRole("button",{name:/Escena 2: INT\. ESTUDIO/}).press("Enter");
  await expect(page.locator(`[data-block-id="${sceneB}"]`)).toHaveClass(/writer-scene-target-highlight/);
  await panel.getByRole("button",{name:/Revelación central/}).last().click();
  await panel.getByRole("button",{name:"Confirmar"}).click();
  await expect(panel.getByRole("button",{name:/Revelación central/}).last()).toBeVisible();
  await panel.getByRole("button",{name:"+ Añadir hito"}).click();
  await panel.getByLabel("Nombre").fill("Primera decisión irreversible");
  await panel.getByRole("button",{name:"Guardar hito"}).click();
  await expect(panel.locator(".writer-pulse-milestone-list").getByRole("button",{name:/Primera decisión irreversible/})).toBeVisible();
});

test("mobile Pulse fits, keeps drawer behavior and navigates by tap",async({page})=>{await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>localStorage.setItem("filmatta.writer.mobile-notice.v1:11111111-1111-4111-8111-111111111111","dismissed"));await mockPulse(page);await page.goto(`/writer/${scriptId}`);const observations=page.getByRole("complementary",{name:"Observaciones"});await expect(observations).toBeHidden();await expect(page.getByRole("separator").first()).toBeHidden();await page.getByRole("button",{name:/Navegar/}).click();let navigate=page.getByRole("dialog",{name:"Navegar por el guion"});await navigate.getByRole("button",{name:/Observaciones/}).click();await expect(observations).toBeVisible();await observations.getByRole("button",{name:"Cerrar",exact:true}).click();await page.getByRole("button",{name:/Navegar/}).click();navigate=page.getByRole("dialog",{name:"Navegar por el guion"});await navigate.getByRole("button",{name:"Timeline"}).click();const panel=page.locator("#writer-timeline-panel");await panel.getByRole("button",{name:"Narrative Pulse",exact:true}).click();await expect(panel.getByRole("heading",{name:"Intensidad narrativa"})).toBeVisible();await expect.poll(()=>panel.evaluate((element)=>element.scrollWidth<=element.clientWidth+1)).toBe(true);await panel.getByRole("button",{name:/Escena 1: INT\. ESTUDIO/}).press("Enter");await expect(page.locator(`[data-block-id="${sceneA}"]`)).toHaveClass(/writer-scene-target-highlight/);});
