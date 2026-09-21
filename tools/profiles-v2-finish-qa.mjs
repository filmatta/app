// Continue visual QA using only identified fixtures and genuine Supabase Auth sessions.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { testContext, TEST_REF } from "./portfolio-test-context.mjs";
const c=await testContext(),m=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),"filmatta-profiles-v2-fixtures.json"),"utf8"));
const base="http://127.0.0.1:3110",evidence=path.resolve("docs/review/profiles-v2"),checks=[],screenshots=[];
const check=(ok,label)=>{console.log(ok?"PASS":"FAIL",label);if(!ok)throw Error(label);checks.push(label);};
const result=r=>{if(r.error)throw Error("Test database operation failed");return r.data;};
let browser,phase="fixture session";
async function session(user,context){
 const auth=result(await c.admin.auth.admin.getUserById(user.id)).user;check(auth.user_metadata.qa_run===m.run,"owned fixture guard");
 const link=result(await c.admin.auth.admin.generateLink({type:"magiclink",email:user.email}));
 let cookies=[];const client=createServerClient(`https://${TEST_REF}.supabase.co`,c.anonKey,{cookies:{getAll:()=>cookies,setAll:v=>cookies=v}});
 result(await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:"magiclink"}));
 await context.addCookies(cookies.map(k=>({name:k.name,value:k.value,domain:"127.0.0.1",path:"/",httpOnly:false,secure:false,sameSite:"Lax"})));
 return {client,profile:result(await client.from("professional_profiles").select("*").eq("user_id",user.id).single())};
}
async function capture(page,name,width){
 await page.setViewportSize({width,height:950});await page.waitForTimeout(300);
 if(!await page.getByRole("dialog").count())for(const frame of await page.locator('.pm-screen,.p2-cover,.p2-portrait').all()){await frame.scrollIntoViewIfNeeded();await page.waitForTimeout(350);}
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(1000);
 await page.locator('html').waitFor();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} ${width}px no overflow`);
 const file=`${name}-${width}.png`;await page.screenshot({path:path.join(evidence,file),fullPage:true,animations:"disabled"});screenshots.push(file);
}
try{
 browser=await chromium.launch({channel:"chrome",headless:true});const ownerContext=await browser.newContext(),ownerPage=await ownerContext.newPage();ownerPage.setDefaultTimeout(30000);
 const owner=await session(m.users[0],ownerContext);await ownerPage.goto(base+"/mi-perfil");await ownerPage.getByRole("button",{name:"Editar perfil",exact:true}).click();
 if(!process.argv.includes("--skip-images")){
 phase="identity uploader UI";console.log(phase);await ownerPage.getByRole("button",{name:"Editar identidad",exact:true}).click();
 const picture=ownerPage.locator('.pe-identity-upload--portrait');const bytes=await sharp('public/images/editorial/talent-portrait-13306757.webp').resize(800,800).jpeg().toBuffer();
 await picture.locator('input[type="file"]').setInputFiles({name:"new-portrait.jpg",mimeType:"image/jpeg",buffer:bytes});await picture.getByLabel("Encuadre horizontal").fill("65");await picture.getByRole("button",{name:"Guardar imagen",exact:true}).click();
 await picture.getByRole("button",{name:"Guardar imagen",exact:true}).waitFor();await ownerPage.waitForTimeout(1000);
 const changed=result(await owner.client.from("professional_profiles").select("presentation").eq("user_id",m.users[0].id).single());check(changed.presentation.portrait_media_id!==owner.profile.presentation.portrait_media_id,"real UI replaces portrait only after validation");
 for(const w of[390,1440])await capture(ownerPage,"identity-editor",w);
 await picture.locator('input[type="file"]').setInputFiles({name:"invalid.jpg",mimeType:"image/jpeg",buffer:Buffer.from("not an image")});await picture.getByRole("button",{name:"Guardar imagen",exact:true}).click();await picture.getByRole("alert").waitFor();check(result(await owner.client.from("professional_profiles").select("presentation").eq("user_id",m.users[0].id).single()).presentation.portrait_media_id===changed.presentation.portrait_media_id,"invalid image replacement preserves previous identity");await ownerPage.getByRole("button",{name:"Cerrar editor"}).click();
 }
 phase="owner UI sections";console.log(phase);await ownerPage.getByRole("button",{name:"Preferencias de proyectos · privadas",exact:true}).click();console.log("preferences dialog opened");await ownerPage.getByRole("button",{name:"Guardar preferencias",exact:true}).waitFor();console.log("preferences loaded");check(await ownerPage.getByLabel("Desnudez total",{exact:true}).inputValue()==="unspecified","UI sensitive preference defaults unspecified");for(const w of[390,1440])await capture(ownerPage,"preferences-editor",w);await ownerPage.getByRole("button",{name:"Cerrar editor"}).click();
 await ownerPage.getByRole("button",{name:"Editar créditos",exact:true}).click();check(await ownerPage.getByLabel("Productora / cliente (opcional)").count()>0,"extended CV fields use existing credits");for(const w of[390,1440])await capture(ownerPage,"career-editor",w);await ownerPage.getByRole("button",{name:"Cerrar editor"}).click();
 const publicContext=await browser.newContext(),page=await publicContext.newPage();phase="public visual";console.log(phase);await page.goto(base+"/perfiles/"+owner.profile.slug);
 for(const w of[360,390,768,1280,1440]){await capture(page,"public-profile",w);await capture(ownerPage,"owner-editor",w);}
 check(await page.locator('#book img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)),"Book real images loaded in public profile");
 phase="photo-only fixture";console.log(phase);const photoContext=await browser.newContext(),photo=await session(m.users[1],photoContext);
 for(let n=1;n<= (process.argv.includes("--skip-book") ? 0 : 3);n++){
  const body=await sharp('public/images/editorial/'+(n===1?'talent-portrait-13306757':'monitor')+'.webp').resize(n===1?800:1200,n===1?1000:n===2?1200:800).jpeg().toBuffer();
  const r=await photoContext.request.post(base+'/api/portfolio/uploads',{headers:{Origin:base},data:{item:{category:'book',title:'Book ficticio '+n,role:'',year:'2026',description:'Demostración, no es una persona real.',media_type:'image',source:'storage',url:'',featured:false},file:{name:'book.jpg',type:'image/jpeg',size:body.length}}});check(r.ok(),'photo-only image reservation');const uploaded=await r.json();result(await photo.client.storage.from('profile-media').upload(uploaded.path,body,{contentType:'image/jpeg'}));check((await photoContext.request.post(`${base}/api/portfolio/media/${uploaded.id}/complete`,{headers:{Origin:base}})).ok(),'photo-only image attested');
 }
 const p=photo.profile;result(await photo.client.rpc('save_my_professional_portfolio',{p_disciplines:p.disciplines,p_city:p.city,p_bio:p.bio,p_availability:p.availability,p_skills:p.skills,p_equipment:p.equipment,p_portfolio_items:p.portfolio_items,p_presentation:p.presentation,p_is_public:true,p_contact_policy:p.contact_policy}));
 await page.goto(base+'/perfiles/'+p.slug);check(await page.locator('#reel').count()===0,'photo-only published profile has no empty reel');for(const w of[390,1440])await capture(page,'photo-only',w);
 for(const route of['/descubre/perfiles','/descubre/talento','/perfiles','/talento']){await page.goto(base+route);check(await page.locator('main').count()>0,'route '+route);for(const w of[390,1440])await capture(page,route.replaceAll('/','-').slice(1),w);}
 phase="privacy postflight";console.log(phase);const privateContext=await browser.newContext(),incomplete=await session(m.users[2],privateContext);check(result(await c.client(c.anonKey).rpc('get_profile_media',{p_slug:incomplete.profile.slug}))===null,'incomplete fixture remains private');
 fs.writeFileSync(path.join(evidence,'visual-qa-report.json'),JSON.stringify({project:TEST_REF,run:m.run,checks,screenshots,viewportEmulated:true,physicalMobile:false},null,2));console.log(JSON.stringify({done:true,publicDemo:owner.profile.slug,photoDemo:p.slug}));
}catch(error){console.error(JSON.stringify({failedPhase:phase,errorType:error.name,reason:String(error.message).slice(0,550).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g,"[redacted]"),detailsSuppressed:true}));process.exitCode=1;}finally{await browser?.close();}
