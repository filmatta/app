// Opt-in Test integration: credentials stay in memory; fixture ownership checked before cleanup.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {testContext,TEST_REF,testSql} from '../../tools/portfolio-test-context.mjs';
if(process.env.FILMATTA_RUN_REMOTE_TESTS!==TEST_REF) throw new Error('Supabase Test opt-in required');
const run=`network-qa-${randomUUID()}`, users=[];
const c=await testContext();
function ok(r,label) { if(r.error) throw new Error(`${label}: ${r.error.code ?? 'request_failed'}`); return r.data; }
async function create(index) {
 const password=randomBytes(24).toString('base64url')+'aA1!',email=`${run}-${index}@example.invalid`;
 const u=ok(await c.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_run:run,full_name:`Network QA ${index}`}}),'create user').user;users.push(u.id);
 const db=c.client(c.anonKey);ok(await db.auth.signInWithPassword({email,password}),'real login');
 const slug=ok(await db.rpc('save_my_professional_profile',{p_disciplines:['Actuación'],p_city:'QA Test',p_bio:'Perfil ficticio temporal para verificar privacidad.',p_availability:'available',p_skills:[],p_equipment:[],p_portfolio_items:[],p_is_public:true,p_contact_policy:'members_only'}),'profile');
 return {id:u.id,db,slug};
}
const projectData={title:'Proyecto privado QA',summary:'Contexto de prueba',project_type:'Cortometraje',client_name:'Cliente privado',client_type:'Productora',city:'Guadalajara',work_area:'Poniente',shooting_schedule:'night',economic_mode:'paid',date_window:'Octubre',roles:['Actuación'],requirements:{themes:['drama'],participation:[],conditions:[]},status:'draft'};
const channels={instagram_username:'qa_shared',whatsapp_e164:'+525555555555',preferred_contact:'instagram',contact_visibility:'private',contact_email:'qa-shared@example.invalid',phone_e164:'+525555555556',share_instagram:true,share_whatsapp:false,share_email:true,share_phone:false};
try {
 const free=await create(0),pro=await create(1),targets=[];
 for(let i=2;i<13;i++)targets.push(await create(i));
 const wallet=async actor=>ok(await actor.db.rpc('get_my_contact_wallet'),'wallet');
 const read=async(actor,id)=>ok(await actor.db.rpc('get_my_contact_request',{p_id:id}),'request projection');
 const send=(actor,t,project=null)=>actor.db.rpc('send_profile_contact_request',{p_slug:t.slug,p_contact_type:'other',p_message:`Consulta ficticia para la producción QA ${t.slug}.`,p_project_id:project});
 const anon=c.client(c.anonKey);
 const project=ok(await free.db.rpc('save_my_networking_project',{p_id:null,p_data:projectData}),'create Project');
 const before=ok(await free.db.from('projects').select('*').eq('id',project).single(),'own Project');
 for(const operational_status of ['active','pending_confirmation','inactive']) {
  ok(await free.db.rpc('save_my_networking_project',{p_id:project,p_data:{...projectData,operational_status}}),'operational status');
  const state=ok(await free.db.from('projects').select('status,operational_status,networking_private').eq('id',project).single(),'state roundtrip');
  assert.deepEqual(state,{status:'draft',operational_status,networking_private:true});
 }
 ok(await free.db.rpc('save_my_networking_project',{p_id:project,p_data:{...projectData,status:'archived'}}),'archive independently');
 assert.equal(ok(await free.db.from('projects').select('operational_status').eq('id',project).single(),'preserved operational status').operational_status,'inactive');
 ok(await free.db.rpc('save_my_networking_project',{p_id:project,p_data:{...projectData,operational_status:'active'}}),'restore');
 assert.ok((await free.db.rpc('save_my_networking_project',{p_id:null,p_data:{...projectData,roles:[]}})).error);
 assert.ok((await free.db.rpc('save_my_networking_project',{p_id:project,p_data:{...projectData,operational_status:'published'}})).error);
 assert.equal(ok(await targets[0].db.from('projects').select('*').eq('id',project),'other Project').length,0);
 assert.equal(ok(await anon.from('projects').select('*').eq('id',project),'anon Project').length,0);
 assert.ok((await targets[0].db.rpc('save_my_networking_project',{p_id:project,p_data:projectData})).error);
 const results=await Promise.all(targets.slice(0,6).map(t=>send(free,t,project)));
 assert.equal(results.filter(r=>!r.error).length,5);assert.equal(results.filter(r=>r.error?.code==='PCC01').length,1);
 assert.equal((await wallet(free)).remaining_contacts,0);assert.equal((await wallet(free)).reserved_contacts,5);assert.equal((await wallet(free)).consumed_contacts,0);
 const entries=results.map((r,i)=>({r,t:targets[i]})).filter(x=>!x.r.error),first=entries[0];
 assert.ok((await send(free,first.t)).error);assert.ok((await send(free,free)).error);
 assert.equal((await read(free,first.r.data)).shared_contact_snapshot,null);
 assert.equal(ok(await free.db.from('profile_private_settings').select('*').eq('owner_id',first.t.id),'private contact RLS').length,0);
 assert.ok((await free.db.rpc('transition_contact_request',{p_id:first.r.data,p_action:'accept'})).error);
 assert.ok((await first.t.db.from('catalog_inquiries').update({status:'accepted'}).eq('id',first.r.data)).error);
 ok(await first.t.db.rpc('save_my_contact_channels',{p_data:channels}),'share consent');
 const accepted=await Promise.all([1,2].map(()=>first.t.db.rpc('transition_contact_request',{p_id:first.r.data,p_action:'accept'})));
 accepted.forEach(r=>assert.equal(ok(r,'accept concurrently'),'accepted'));
 assert.equal((await wallet(free)).consumed_contacts,1);assert.equal((await wallet(free)).reserved_contacts,4);
 const snap={instagram:'qa_shared',email:'qa-shared@example.invalid'};
 assert.deepEqual((await read(free,first.r.data)).shared_contact_snapshot,snap);assert.deepEqual((await read(first.t,first.r.data)).shared_contact_snapshot,snap);
 assert.ok((await read(free,first.r.data)).contact_unlocked_at);
 assert.equal(await read(pro,first.r.data),null);assert.equal(ok(await pro.db.from('catalog_inquiries').select('shared_contact_snapshot').eq('id',first.r.data),'third party snapshot RLS').length,0);
 assert.ok((await anon.rpc('get_my_contact_request',{p_id:first.r.data})).error);
 ok(await first.t.db.rpc('save_my_contact_channels',{p_data:{...channels,share_email:false,share_instagram:false,share_phone:true}}),'future consent');
 assert.deepEqual((await read(free,first.r.data)).shared_contact_snapshot,snap);
 ok(await free.db.rpc('save_my_networking_project',{p_id:project,p_data:{...projectData,title:'Cambió después'}}),'edit Project');
 assert.equal(ok(await free.db.from('projects').select('slug').eq('id',project).single(),'stable slug').slug,before.slug);
 assert.equal((await read(first.t,first.r.data)).project_snapshot.title,projectData.title);
 assert.equal('client_name' in (await read(first.t,first.r.data)).project_snapshot,false);
 for(const [offset,action] of [[1,'reject'],[2,'cancel']]) {
  const e=entries[offset];ok(await (action==='reject'?e.t:free).db.rpc('transition_contact_request',{p_id:e.r.data,p_action:action}),action);
  assert.equal((await read(free,e.r.data)).shared_contact_snapshot,null);
 }
 const exp=entries[3];
 testSql(`update public.catalog_inquiries set created_at=now()-interval '43 hours',expires_at=now()+interval '5 hours' where id='${exp.r.data}' and sender_id='${free.id}'`);
 await wallet(free);await wallet(free);
 assert.equal(ok(await free.db.from('notifications').select('id').eq('entity_id',exp.r.data).eq('type','contact_request_expiring'),'one reminder').length,1);
 testSql(`update public.catalog_inquiries set created_at=now()-interval '49 hours',expires_at=now()-interval '1 hour' where id='${exp.r.data}' and sender_id='${free.id}'`);
 await wallet(free);assert.equal((await read(free,exp.r.data)).state,'expired');assert.equal((await read(free,exp.r.data)).shared_contact_snapshot,null);
 assert.equal((await wallet(free)).reserved_contacts,1);assert.equal((await wallet(free)).remaining_contacts,3);
 const empty=entries[4];ok(await empty.t.db.rpc('transition_contact_request',{p_id:empty.r.data,p_action:'accept'}),'accept empty channels');assert.deepEqual((await read(free,empty.r.data)).shared_contact_snapshot,{});
 assert.equal((await wallet(free)).consumed_contacts,2);
 testSql(`insert into public.admin_plan_grants(user_id,plan,granted_by,reason,expires_at) values('${pro.id}','pro','${pro.id}','${run}',now()+interval '1 hour')`);
 assert.equal((await wallet(pro)).is_pro,true);
 for(const t of targets.slice(0,10))ok(await send(pro,t),'Pro request');
 assert.equal((await wallet(pro)).reserved_contacts,0);assert.equal((await send(pro,targets[10])).error?.code,'22023');
 // Future acceptance gets NEW consent, historical first request remains unchanged.
 const proRequest=ok(await pro.db.from('catalog_inquiries').select('id').eq('profile_id',first.t.id).single(),'Pro request lookup').id;
 ok(await first.t.db.rpc('transition_contact_request',{p_id:proRequest,p_action:'accept'}),'future acceptance');
 assert.deepEqual((await read(pro,proRequest)).shared_contact_snapshot,{phone:channels.phone_e164});assert.deepEqual((await read(free,first.r.data)).shared_contact_snapshot,snap);
 for(const t of targets.slice(0,9))ok(await t.db.rpc('set_profile_follow',{p_slug:free.slug,p_follow:true}),'follow');
 assert.ok((await free.db.rpc('set_profile_follow',{p_slug:free.slug,p_follow:true})).error);
 const proof=ok(await anon.rpc('get_profile_followers',{p_slug:free.slug}),'public proof');assert.equal(proof.length,7);assert.equal(Number(proof[0].total_count),9);
 assert.ok((await anon.from('profile_follows').select('*')).error);assert.equal(ok(await pro.db.rpc('get_my_network'),'other graph').length,0);
 assert.equal(ok(await free.db.rpc('get_my_network'),'own graph').length,9);
 assert.equal(ok(await pro.db.from('notifications').select('*').eq('user_id',free.id),'notification RLS').length,0);
 const notices=ok(await free.db.rpc('get_my_network_notifications'),'notification presentation');
 assert.ok(notices.some(n=>n.type==='follow_received' && n.has_actor));
 assert.ok(notices.some(n=>n.type==='contact_request_expiring' && !n.has_actor && n.portrait_url===null));
 assert.ok(notices.every(n=>!('shared_contact_snapshot' in n)));
 ok(await free.db.rpc('mark_my_network_notification',{p_id:null}),'mark own read');assert.equal(ok(await free.db.rpc('get_my_network_summary'),'read count').unread,0);
 ok(await targets[0].db.rpc('unfollow_my_network_profile',{p_id:free.id}),'unfollow');
 console.log('PASS: real Auth/RLS, parallel credit cap, duplicate acceptance, reserve/consume/release/expiry, snapshots and future consent, empty contacts, Projects isolation/stable slug, public 7/private graph, notifications/mark read, Pro fair use.');
} finally {
 testSql(`delete from public.admin_plan_grants where reason='${run}'`);
 for(const id of users) {const u=ok(await c.admin.auth.admin.getUserById(id),'cleanup identity').user;assert.equal(u.user_metadata.qa_run,run);ok(await c.admin.auth.admin.deleteUser(id),'cleanup user');}
 assert.equal(testSql(`select count(*)::int n from auth.users where raw_user_meta_data->>'qa_run'='${run}'`)[0].n,0);
 console.log('PASS: temporary Test users, projects, requests, reservations, snapshots, notifications, outbox events and grant removed by cascade.');
}
