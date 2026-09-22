import assert from 'node:assert/strict';import test from 'node:test';import fs from 'node:fs';import load from '../load.mjs';
const read=p=>fs.readFileSync(p,'utf8');
test('dashboard uses owned exact counts, handles empty and partial data without inventing metrics',async()=>{
 let fail=false;const filters=[];
 const client={from(table){const chain={select(){return chain},eq(k,v){filters.push([table,k,v]);return chain},order(){return chain},limit(){return chain},maybeSingle(){return chain},then(resolve){return Promise.resolve(resolve(fail?{data:null,count:null,error:{code:'offline'}}:{data:null,count:0,error:null}))}};return chain},rpc:async()=>fail?{error:{code:'offline'}}:{data:{followers:0,following:0,pending_received:0,unread:0},error:null}};
 const {getAccountDashboard}=load('lib/account/dashboard.ts',{'@/lib/supabase/server':{createClient:async()=>client}});
 let d=await getAccountDashboard('qa-owner');assert.equal(d.active,0);assert.equal(d.pending,0);assert.equal(d.profile,null);assert.equal(d.latest,null);assert.equal(d.partial,false);
 assert.ok(filters.filter(x=>x[0]==='projects'&&x[1]==='owner_id').every(x=>x[2]==='qa-owner'));
 fail=true;d=await getAccountDashboard('qa-owner');assert.equal(d.active,null);assert.equal(d.profile,undefined);assert.equal(d.summary,null);assert.equal(d.partial,true);
});
test('dashboard routes are real, privacy-gated, compact and not Learn-centric',()=>{
 const p=read('app/cuenta/page.tsx');assert.match(p,/if\(!viewer\)redirect/);
 for(const href of ['/mi-perfil','/mis-proyectos','/cuenta/contactos','/mi-red','/mis-locaciones','/cuenta/configuracion#mis-cursos','/cuenta/configuracion#configuracion','/cuenta/configuracion#seguridad','/cuenta/suscripcion']){assert.ok(p.includes('href="'+href+'"'));assert.ok(fs.existsSync('app'+href.split('#')[0]+'/page.tsx'));}
 assert.match(p,/Accesos rápidos/);assert.doesNotMatch(p,/FILMATTA Learn|Tu próxima historia|course_enrollments|viewer.email/);
 assert.match(p,/d.latest&&/);assert.match(p,/billing.plan&&/);
});
