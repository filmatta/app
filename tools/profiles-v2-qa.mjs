// Isolated real Test QA. Credentials remain in memory. Manifest contains fixture IDs only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { testContext, TEST_REF } from "./portfolio-test-context.mjs";
const base="http://127.0.0.1:3110", evidence=path.resolve("docs/review/profiles-v2"), run="profiles-v2-"+randomUUID();
const manifestPath=path.join(os.tmpdir(),"filmatta-profiles-v2-fixtures.json");
const report={run,project:TEST_REF,checks:[],screenshots:[],blocked:[],productionTouched:false};
const c=await testContext(), users=[], assets=[];
let server,browser,phase="initialization";
const secret=randomBytes(32).toString("hex"),cron=randomBytes(32).toString("hex");
const manifest={run,project:TEST_REF,users:[],assets:[]};
const persist=()=>fs.writeFileSync(manifestPath,JSON.stringify(manifest));
const say=message=>console.log(JSON.stringify({phase:message}));
const check=(ok,label)=>{if(!ok){console.log("FAIL",label);throw Error(label);}report.checks.push(label);console.log("PASS",label);};
const result=r=>{if(r.error){console.log(JSON.stringify({databaseErrorCode:r.error.code??r.error.statusCode??"unknown"}));throw Error("Test database operation failed");}return r.data;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function mux(p,method="GET",data){const r=await fetch("https://api.mux.com"+p,{method,headers:{Authorization:c.muxAuthorization,"Content-Type":"application/json"},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});if(r.status===404||r.status===204)return null;if(!r.ok)throw Error("Test Mux request failed");return(await r.json()).data;}
async function fixture(label,disciplines){
 const email=`${run}-${users.length}@example.invalid`,password=randomBytes(30).toString("base64url")+"aA1!";
 const user=result(await c.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:"Demostración "+label,qa_run:run}})).user;
 const u={id:user.id,email,password,client:c.client(c.anonKey),label};users.push(u);manifest.users.push({id:u.id,email,run});persist();
 result(await u.client.auth.signInWithPassword({email,password}));
 u.input={p_disciplines:disciplines,p_city:"Guadalajara",p_bio:"Perfil ficticio de demostración. Exploramos la luz, el encuadre y las historias que se construyen en equipo. Este material permite revisar FILMATTA; no representa a una persona real.",p_availability:"available",p_skills:["Iluminación natural","Composición"],p_equipment:["Cámara de cine","Ópticas fijas"],p_portfolio_items:[],p_is_public:false,p_contact_policy:"members_only",p_presentation:{portrait_url:"",stage_name:label+" · Demo ficticia",work_area:"Zona Poniente",rate_range:"",rate:{amount:"5000",currency:"MXN",unit:"day"},portfolio_mode:label==="Book"?"photographic":"audiovisual",book:[],credits:[{title:"La última luz · ficción",role:"Dirección de fotografía",year:"2026",start:"2026-03",company:"Estudio de demostración",production_type:"Cortometraje",description:"Crédito ficticio para revisar la presentación.",ongoing:true},{title:"Encuentros · ficción",role:"Fotografía",year:"2024",start:"2024",end:"2025",production_type:"Fotografía",description:"Material ficticio de QA."}]}};
 u.slug=result(await u.client.rpc("save_my_professional_portfolio",u.input));result(await u.client.rpc("initialize_my_profile_media"));return u;
}
async function login(page,user){await page.goto(base+"/login?next=%2Fmi-perfil");await page.getByLabel("Correo",{exact:true}).fill(user.email);await page.getByLabel("Contraseña",{exact:true}).fill(user.password);await page.locator("form").filter({has:page.locator('input[name="password"]')}).getByRole("button",{name:/Iniciar sesión/}).click();await page.waitForURL("**/mi-perfil",{timeout:60000});}
async function snap(page,name,width){await page.setViewportSize({width,height:950});await page.waitForTimeout(350);for (const frame of await page.locator('.pm-screen,.p2-cover,.p2-portrait').all()) { await frame.scrollIntoViewIfNeeded(); await page.waitForTimeout(180); } await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(800);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} ${width}px no overflow`);const file=`${name}-${width}.png`;await page.screenshot({path:path.join(evidence,file),fullPage:true,animations:"disabled"});report.screenshots.push(file);}
const meta={category:"work",title:"Demo video",role:"Dirección",year:"2026",description:"Material ficticio",media_type:"video",source:"external",url:"https://www.youtube.com/watch?v=aqz-KE-bpKQ",featured:false};
async function addImage(context,u,purpose,n){
 const source=path.resolve("public/images/editorial/"+(purpose==="portrait"||n===1?"talent-portrait-13306757":"monitor")+".webp");
 const dim=n===1?[800,1000]:n===2?[900,900]:[1440,900];
 const bytes=await sharp(source).resize(dim[0],dim[1],{fit:"cover"}).jpeg().withMetadata({exif:{IFD0:{Artist:"QA metadata must be stripped"}}}).toBuffer();
 const body={item:{...meta,category:"book",purpose,media_type:"image",source:"storage",url:"",title:purpose==="portfolio"?`Estudio visual ${n} · Demo`:purpose,image_crop:{x:50,y:45,zoom:1,frame:"auto"}},file:{name:"fixture.jpg",type:"image/jpeg",size:bytes.length}};
 const r=await context.request.post(base+"/api/portfolio/uploads",{data:body,headers:{Origin:base}});check(r.ok(),"real image reservation owner "+purpose);
 const upload=await r.json();result(await u.client.storage.from("profile-media").upload(upload.path,bytes,{contentType:"image/jpeg",upsert:false}));
 const complete=await context.request.post(`${base}/api/portfolio/media/${upload.id}/complete`,{headers:{Origin:base}});check(complete.ok(),"real decoded image completion "+purpose);
 if(purpose!=="portfolio")result(await u.client.rpc("set_my_profile_identity_image",{p_kind:purpose,p_id:upload.id}));
 return upload.id;
}
async function webhook(type,id){const event=JSON.stringify({type,id:"qa-"+randomUUID(),environment:{id:c.muxEnv},data:{id}}),t=Math.floor(Date.now()/1000);return fetch(base+"/api/mux/webhooks",{method:"POST",headers:{"Content-Type":"application/json","mux-signature":`t=${t},v1=${createHmac("sha256",secret).update(`${t}.${event}`).digest("hex")}`},body:event});}
async function local(){
 if(fs.existsSync(manifestPath))throw Error("Existing fixture manifest; cleanup first");persist();fs.mkdirSync(evidence,{recursive:true});
 phase="fixtures";say(phase);const owner=await fixture("Cine",["Dirección","Dirección de fotografía"]),photo=await fixture("Book",["Actuación","Modelaje"]),other=await fixture("Incompleto",["Foto fija"]);
 const anon=c.client(c.anonKey);check(result(await anon.rpc("get_profile_media",{p_slug:owner.slug}))===null,"remote draft private");
 const childEnv={...process.env,NEXT_PUBLIC_SUPABASE_URL:`https://${TEST_REF}.supabase.co`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:c.anonKey,SUPABASE_SERVICE_ROLE_KEY:c.serviceKey,MUX_TOKEN_ID:c.muxTokenId,MUX_TOKEN_SECRET:c.muxTokenSecret,MUX_EXPECTED_ENVIRONMENT_ID:c.muxEnv,MUX_EXPECTED_ENVIRONMENT_TYPE:"development",MUX_WEBHOOK_SECRET:secret,CRON_SECRET:cron,PORTFOLIO_DIRECT_UPLOADS_ENABLED:"true",BILLING_ENABLED:"false",SECURITY_RATE_LIMIT_SECRET:randomBytes(32).toString("hex")};delete childEnv.VERCEL;delete childEnv.VERCEL_ENV;
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port","3110"],{env:childEnv,stdio:["ignore","ignore","ignore"],windowsHide:true});
 for(let i=0;i<90;i++){try{if((await fetch(base+"/login",{signal:AbortSignal.timeout(2000)})).ok)break;}catch{}if(i===89)throw Error("QA server failed");await sleep(1000);}
 browser=await chromium.launch({channel:"chrome",headless:true});const context=await browser.newContext({viewport:{width:1440,height:950}}),page=await context.newPage();page.setDefaultTimeout(30000);
 phase="real product login";say(phase);await login(page,owner);check(true,"real product password login Auth + RLS");
 phase="images";say(phase);owner.portrait=await addImage(context,owner,"portrait",1);owner.cover=await addImage(context,owner,"cover",0);for(let n=1;n<=3;n++)await addImage(context,owner,"portfolio",n);
 const original=result(await owner.client.from("profile_media").select("storage_path,derivative_path").eq("id",owner.portrait).single());
 check(!!(await other.client.storage.from("profile-media").download(original.derivative_path)).error,"non-owner draft image denied");
 const response=await context.request.get(`${base}/api/portfolio/media/${owner.portrait}/resource`);check(response.ok(),"owner image resource");
 const derived=await response.json();const bytes=Buffer.from(await(await fetch(derived.image)).arrayBuffer());check(!(await sharp(bytes).metadata()).exif,"remote image derivative has no EXIF");
 phase="private data and Bio";say(phase);
 result(await owner.client.rpc("save_my_private_contact",{p_data:{instagram_username:"demo_privado",whatsapp_e164:"+442079460018",preferred_contact:"whatsapp",contact_visibility:"private"}}));
 check(result(await other.client.from("profile_private_settings").select("instagram_username")).length===0,"remote contacts invisible to non-owner");
 check(!!(await owner.client.rpc("save_my_private_contact",{p_data:{instagram_username:"demo",whatsapp_e164:"",preferred_contact:"none",contact_visibility:"public"}})).error,"forged public visibility denied remotely");
 result(await owner.client.rpc("save_my_project_preferences",{p_preferences:{formats:["Cortometraje"],open_formats:true,themes:{},participation:{},conditions:{}}}));
 for(const row of JSON.parse(fs.readFileSync("tests/profiles/bio-cases.json","utf8"))){const attempt=await owner.client.rpc("save_my_professional_portfolio",{...owner.input,p_bio:row.text,p_presentation:{...owner.input.p_presentation,portrait_media_id:owner.portrait,cover_media_id:owner.cover}});check(Boolean(attempt.error)===row.blocked,"remote Bio case "+report.checks.filter(x=>x.startsWith("remote Bio case")).length);}
 owner.input.p_presentation.portrait_media_id=owner.portrait;owner.input.p_presentation.cover_media_id=owner.cover;result(await owner.client.rpc("save_my_professional_portfolio",owner.input));
 phase="Mux direct upload";say(phase);
 // Official small Mux QA sample. New test:true fixture is needed; existing Test assets have incompatible policies.
 const sample=Buffer.from(await(await fetch("https://muxed.s3.amazonaws.com/leds.mp4")).arrayBuffer());
 const reservation=await context.request.post(base+"/api/portfolio/uploads",{headers:{Origin:base},data:{item:{...meta,source:"mux",url:"",title:"Reel de demostración · Test"},file:{name:"qa.mp4",type:"video/mp4",size:sample.length}}});check(reservation.ok(),"real Mux direct upload reservation");const reserved=await reservation.json();owner.reel=reserved.id;
 check((await fetch(reserved.uploadUrl,{method:"PUT",headers:{"Content-Type":"video/mp4"},body:sample})).ok,"real bytes uploaded directly to Mux Test");
 const localRow=result(await owner.client.from("profile_media").select("mux_upload_id").eq("id",reserved.id).single());let asset;
 for(let i=0;i<50;i++){const u=await mux("/video/v1/uploads/"+localRow.mux_upload_id);if(u.asset_id){asset=await mux("/video/v1/assets/"+u.asset_id);if(!assets.includes(asset.id)){assets.push(asset.id);manifest.assets.push({id:asset.id,item:reserved.id});persist();}if(asset.status==="ready")break;}await sleep(1500);}
 check(asset?.status==="ready","Mux Test canonical asset ready");check(asset.playback_ids?.every(p=>p.policy==="signed"),"Mux fixture signed only");
 for(const type of["video.asset.created","video.asset.ready","video.asset.ready"])check((await webhook(type,asset.id)).ok,"local signed webhook with real canonical asset "+type);
 const ready=result(await owner.client.from("profile_media").select("status,duration_seconds").eq("id",reserved.id).single());check(ready.status==="ready"&&ready.duration_seconds===asset.duration,"remote ready and exact verified duration");
 result(await owner.client.rpc("manage_my_profile_media",{p_id:reserved.id,p_action:"reel"}));check(!!(await other.client.rpc("manage_my_profile_media",{p_id:reserved.id,p_action:"reel"})).error,"remote reel non-owner rejected");
 check((await context.request.post(base+"/api/portfolio/uploads",{headers:{Origin:base},data:{item:{...meta,source:"mux",url:""},file:{name:"oversize.mp4",type:"video/mp4",size:5000000001}}})).status()===400,"declared >5GB denied before provider URL");
 const pending=await context.request.post(base+"/api/portfolio/uploads",{headers:{Origin:base},data:{item:{...meta,source:"mux",url:"",title:"Cancel QA"},file:{name:"cancel.mp4",type:"video/mp4",size:1000}}});check(pending.ok(),"pending cancellation fixture");const pendingItem=await pending.json();
 check((await context.request.post(`${base}/api/portfolio/media/${pendingItem.id}/cancel`,{headers:{Origin:base}})).ok(),"real waiting upload cancelled through product");
 check(result(await owner.client.from("profile_media").select("terminal_reason").eq("id",pendingItem.id).single()).terminal_reason==="cancelled","cancelled attempt is terminal");
 result(await owner.client.rpc("manage_my_profile_media",{p_id:pendingItem.id,p_action:"archive"}));
 report.blocked.push("Local signed playback requires the existing non-extractable Preview signing secret; verify in Preview. Local webhook delivery is not provider-to-Preview delivery.");
 result(await owner.client.rpc("save_my_profile_media",{p_id:null,p_data:meta}));
 phase="editor interactions";say(phase);await page.reload();await page.getByRole("button",{name:"Editar perfil",exact:true}).click();await page.getByRole("button",{name:"Editar bio",exact:true}).click();await page.getByLabel("Bio breve").fill("Instagram: demo_privado");await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();check(await page.getByRole("dialog").count()===1,"invalid Bio is not falsely saved");await page.getByRole("button",{name:"Cerrar editor"}).click();await page.getByRole("button",{name:"Editar bio",exact:true}).click();check(await page.getByLabel("Bio breve").inputValue()==="Instagram: demo_privado","Bio draft preserved between sections");await page.getByLabel("Bio breve").fill(owner.input.p_bio);await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});
 await page.getByRole("button",{name:"Publicar",exact:true}).click();await page.getByLabel("Perfil público y compartible").check();await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});owner.input.p_is_public=true;
 phase="visual QA";say(phase);
 const publicContext=await browser.newContext(),publicPage=await publicContext.newPage();await publicPage.goto(base+"/perfiles/"+owner.slug);await publicPage.getByRole("heading",{name:"Cine · Demo ficticia",exact:true}).waitFor();
 check(!(await publicPage.content()).includes("442079460018")&&!(await publicPage.content()).includes("demo_privado"),"public HTML has no private contact fields");
 const positions=await publicPage.evaluate(()=>({bio:document.querySelector('#about')?.getBoundingClientRect().top,reel:document.querySelector('#reel')?.getBoundingClientRect().top,video:document.querySelector('#videos')?.getBoundingClientRect().top,book:document.querySelector('#book')?.getBoundingClientRect().top,cv:document.querySelector('#credits')?.getBoundingClientRect().top}));check(positions.bio<positions.reel&&positions.reel<positions.video&&positions.video<positions.book&&positions.book<positions.cv,"fixed Bio Reel Videos Book CV hierarchy");
 for(const w of[360,390,768,1280,1440]){await snap(publicPage,"public-profile",w);await snap(page,"owner-editor",w);}
 await publicPage.setViewportSize({width:1440,height:950});const aligned=await publicPage.evaluate(()=>Math.abs(document.querySelector('.p2-nav').getBoundingClientRect().top-document.querySelector('.p2-aside').getBoundingClientRect().top)<2);check(aligned,"desktop sidebar aligned with navigation");
 await publicPage.getByRole("button",{name:/Ampliar Estudio visual 1/}).click();await publicPage.getByRole("dialog").waitFor();await publicPage.keyboard.press("ArrowRight");await snap(publicPage,"book-lightbox",390);await publicPage.keyboard.press("Escape");check(await publicPage.getByRole("dialog").count()===0,"Book keyboard navigation and Escape");
 await context.clearCookies();await login(page,photo);photo.portrait=await addImage(context,photo,"portrait",1);for(let n=1;n<=3;n++)await addImage(context,photo,"portfolio",n);photo.input.p_is_public=true;photo.input.p_presentation.portrait_media_id=photo.portrait;result(await photo.client.rpc("save_my_professional_portfolio",photo.input));await publicPage.goto(base+"/perfiles/"+photo.slug);check(await publicPage.locator('#reel').count()===0,"photo-only profile publishes without empty reel");for(const w of[390,1440])await snap(publicPage,"photo-only",w);
 for(const route of["/descubre/perfiles","/descubre/talento","/perfiles","/talento"]){await publicPage.goto(base+route);check((await publicPage.locator('main').count())>0,"route "+route);for(const w of[390,1440])await snap(publicPage,route.replaceAll('/','-').slice(1),w);}
 result(await owner.client.rpc("save_my_professional_portfolio",{...owner.input,p_is_public:false}));check(result(await anon.rpc("get_profile_media",{p_slug:owner.slug}))===null,"remote unpublication revokes public media");result(await owner.client.rpc("save_my_professional_portfolio",owner.input));
 phase="local QA complete";say(phase);fs.writeFileSync(path.join(evidence,"qa-report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({demoSlugs:users.map(u=>u.slug),manifest:manifestPath,local:base}));
}
async function cleanup(){
 phase="fixture cleanup";say(phase);
 for(const u of users){const auth=result(await c.admin.auth.admin.getUserById(u.id)).user;if(auth.user_metadata.qa_run!==run)throw Error("Foreign fixture guard");const rows=result(await c.admin.from("profile_media").select("id,storage_path,derivative_path,mux_upload_id").eq("owner_id",u.id));for(const row of rows){if(row.mux_upload_id){const upload=await mux("/video/v1/uploads/"+row.mux_upload_id);if(upload?.asset_id){const asset=await mux("/video/v1/assets/"+upload.asset_id);if(asset?.passthrough!==`filmatta:portfolio:${row.id}`)throw Error("Wrong asset association");await mux("/video/v1/assets/"+asset.id,"DELETE");}else if(upload?.status==="waiting")await mux("/video/v1/uploads/"+upload.id+"/cancel","PUT");}const folder=`${u.id}/${row.id}`; const objects=result(await c.admin.storage.from("profile-media").list(folder)); const files=[...new Set([...objects.map(o=>folder+"/"+o.name),row.storage_path,row.derivative_path].filter(Boolean))];if(files.length)result(await c.admin.storage.from("profile-media").remove(files));}result(await c.admin.auth.admin.deleteUser(u.id));}
 fs.rmSync(manifestPath);await browser?.close();server?.kill();say("Only this run fixtures removed");
}
try{await local();}catch{console.error(JSON.stringify({failedPhase:phase,detailsSuppressed:true,manifest:manifestPath}));}
const rl=readline.createInterface({input:process.stdin});for await(const line of rl){try{const command=JSON.parse(line);if(command.action==="cleanup"){await cleanup();break;}if(command.action==="info")console.log(JSON.stringify({phase,slugs:users.map(u=>u.slug),checks:report.checks.length}));}catch{console.error("QA command failed; details suppressed.");}}
