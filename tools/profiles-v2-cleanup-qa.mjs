// Continue visual QA using only identified fixtures and genuine Supabase Auth sessions.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import Mux from "@mux/mux-node";
import load from "../tests/load.mjs";
import { chromium } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { testContext, testSql, TEST_REF } from "./portfolio-test-context.mjs";
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
try {
 browser=await chromium.launch({channel:"chrome",headless:true});const context=await browser.newContext(),u=await session(m.users[2],context);
 const all=result(await c.admin.from('profile_media').select('owner_id').in('status',['uploading','processing']));check(all.every(row=>m.users.some(u=>u.id===row.owner_id)),'cleanup pending rows belong only to this QA');
 const bytes=await sharp('public/images/editorial/monitor.webp').resize(256).jpeg().toBuffer(),metadata={category:'book',title:'Cleanup fixture',role:'',year:'',description:'Temporary QA',media_type:'image',source:'storage',url:'',featured:false};
 const reserve=()=>u.client.rpc('reserve_my_profile_upload',{p_data:metadata,p_size:bytes.length,p_mime:'image/jpeg',p_extension:'jpg'});
 const first=result(await reserve()),second=result(await reserve());check(!!(await reserve()).error,'remote pending cap rejects third attempt');
 const row=result(await u.client.from('profile_media').select('*').eq('id',second).single());result(await u.client.storage.from('profile-media').upload(row.storage_path,bytes,{contentType:'image/jpeg'}));
 const ownerContext=await browser.newContext(),owner=await session(m.users[0],ownerContext);check(!!(await owner.client.storage.from('profile-media').upload(row.storage_path,bytes,{contentType:'image/jpeg',upsert:true})).error,'cross-owner storage overwrite rejected remotely');
 result(await c.admin.from('profile_media').update({expires_at:'2020-01-01T00:00:00Z'}).in('id',[first,second]));
 const fixtureAdmin={storage:c.admin.storage,from(table){if(table!=='profile_media')throw Error('Unexpected table');const builder=c.admin.from(table);return new Proxy(builder,{get(target,prop){if(['select','update'].includes(prop))return (...args)=>target[prop](...args).in('owner_id',m.users.map(u=>u.id));const value=target[prop];return typeof value==='function'?value.bind(target):value;}});}};
 const mux=new Mux({tokenId:c.muxTokenId,tokenSecret:c.muxTokenSecret});const api=load('lib/profiles/mux-media.ts',{'@/lib/supabase/admin':{createAdminClient:()=>fixtureAdmin},'@/lib/mux/server':{createValidatedMuxContext:async()=>({mux,environment:{id:'kospfo',type:'development'}}),isMuxNotFoundError:e=>e?.status===404}});
 await api.cleanPortfolioMedia();const terminal=result(await u.client.from('profile_media').select('id,status,terminal_reason,review_reason').in('id',[first,second]));check(terminal.find(r=>r.id===first)?.terminal_reason==='expired','missing original expires after real Storage check');check(terminal.find(r=>r.id===second)?.review_reason==='image-finalization-required','received original preserved for explicit verification');
 const complete=await context.request.post(`${base}/api/portfolio/media/${second}/complete`,{headers:{Origin:base}});check(complete.ok(),'received expired image can be explicitly verified by owner');await api.cleanPortfolioMedia();check(result(await u.client.from('profile_media').select('status').eq('id',second).single()).status==='ready','repeated cleanup preserves verified image');
 for(const id of[first,second]){const r=result(await u.client.from('profile_media').select('storage_path,derivative_path').eq('id',id).eq('owner_id',m.users[2].id).single());const paths=[r.storage_path,r.derivative_path].filter(Boolean);if(!/^[0-9a-f-]{36}$/.test(id)||!/^[0-9a-f-]{36}$/.test(m.users[2].id)||paths.some(p=>!p.startsWith(`${m.users[2].id}/${id}/`)||p.includes('..')))throw Error('Foreign fixture path');if(paths.length)result(await c.admin.storage.from('profile-media').remove(paths));testSql(`delete from public.profile_media where id='${id}' and owner_id='${m.users[2].id}' and title='Cleanup fixture' and description='Temporary QA' and source='storage'`);}
 check(result(await u.client.from('profile_media').select('id').in('id',[first,second])).length===0,'cleanup test rows and files removed; demo preserved');
 fs.writeFileSync(path.join(evidence,'cleanup-integration-report.json'),JSON.stringify({project:TEST_REF,checks,transport:'real Supabase Storage and database; fixture-scoped reconciliation module',scheduledCron:false},null,2));
}catch(error){console.error(JSON.stringify({failedPhase:phase,reason:String(error.message).slice(0,250)}));process.exitCode=1;}finally{await browser?.close();}
