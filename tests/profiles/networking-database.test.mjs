import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function as(role,n=0) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']); if(role!=='postgres') await db.exec(`set role ${role}`); }
const send=n=>db.query("select send_profile_contact($1,'other',$2) id",[`person-${n}`,`Consulta profesional específica para la producción número ${n}.`]);
before(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema auth;create schema private;create schema storage;
  create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema public,auth,storage to anon,authenticated,service_role;
  grant usage on schema private to authenticated;
  create table public.profiles(id uuid primary key,role text);
  create table public.courses(id uuid primary key);
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  grant select,insert on storage.objects to anon,authenticated;`);
  const core=fs.readFileSync('supabase/production/0001_core_learn_prerequisites.sql','utf8');
  await db.exec(core.match(/create function private\.is_admin\(\)[\s\S]*?\$\$;/)[0]);
  for(const file of [
    '20260910120000_create_professional_profiles.sql','20260910230000_create_locations_opportunities_foundations.sql',
    '20260912010000_billing_test_foundation.sql','20260914020000_admin_plan_grants.sql',
    '20260916010000_public_profile_catalog.sql','20260916020000_opportunity_owner_publishing.sql',
    '20260916030000_services_directory.sql','20260916040000_jobs_specialization.sql','20260920010000_profile_presentation.sql',
    '20260921010000_profile_media.sql','20260922010000_profile_contacts.sql',
    '20260923010000_profile_upload_lifecycle.sql','20260923020000_profile_reel_selection.sql',
    '20260923030000_profile_identity_images_rates.sql','20260923040000_private_profile_contact_bio.sql',
    '20260923050000_profile_preferences_credits.sql','20260923060000_profile_media_attestation_grant.sql',
    '20260923070000_profile_bio_professional_references.sql','20260924010000_profile_reel_cover_projection.sql',
    '20260924020000_custom_reel_cover.sql','20260924030000_profile_social_contact_foundation.sql','20260924040000_networking_projects_channels.sql','20260924050000_networking_requests_notifications.sql','20260924060000_networking_private_views.sql','20260924070000_networking_outbox_legacy_history.sql','20260925010000_networking_ui_metadata.sql'
  ]) await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  for(let n=1;n<=16;n++) {
    await db.query('insert into auth.users(id) values($1)',[id(n)]);
    await db.query("insert into professional_profiles(user_id,slug,display_name,disciplines,is_public) values($1,$2,$3,array['Dirección'],true)",[id(n),`person-${n}`,`Persona ${n}`]);
  }
});
after(()=>db.close());

let request,project;
const wallet=async()=> (await db.query('select get_my_contact_wallet() w')).rows[0].w;
const detail=async id=>(await db.query('select get_my_contact_request($1) r',[id])).rows[0].r;
const projectData={title:'La última noche',summary:'Una producción QA',project_type:'Cortometraje',client_name:'Cliente privado',client_type:'Productora',city:'Guadalajara',work_area:'Poniente',shooting_schedule:'night',economic_mode:'paid',date_window:'Octubre',roles:['Actuación'],requirements:{themes:['drama'],participation:[],conditions:[]},status:'draft'};
test('Projects: owner-only, stable unique slug, taxonomy, no public visibility',async()=>{
 await as('authenticated',1);project=(await db.query('select save_my_networking_project(null,$1) id',[projectData])).rows[0].id;
 const before=(await db.query('select * from projects where id=$1',[project])).rows[0];
 assert.equal(before.networking_private,true);assert.deepEqual(before.requirements.conditions,['night']);
 await db.query('select save_my_networking_project($1,$2)',[project,{...projectData,title:'La última noche — revisada'}]);
 assert.equal((await db.query('select slug from projects where id=$1',[project])).rows[0].slug,before.slug);
 await assert.rejects(db.query("update projects set status='published' where id=$1",[project]),/check constraint/);
 await as('authenticated',2);assert.equal((await db.query('select * from projects')).rows.length,0);
 await assert.rejects(db.query('select save_my_networking_project($1,$2)',[project,projectData]),/unavailable/);
 await as('anon');assert.equal((await db.query('select * from projects')).rows.length,0);
});
test('Reserve, private pending, atomic acceptance + exact immutable snapshot + RLS',async()=>{
 await as('authenticated',2);
 await db.query('select save_my_contact_channels($1)',[{instagram_username:'private_qa',whatsapp_e164:'+525555555555',preferred_contact:'instagram',contact_visibility:'private',contact_email:'explicit@example.invalid',phone_e164:'',share_instagram:true,share_whatsapp:false,share_email:true,share_phone:false}]);
 await as('authenticated',1);
 request=(await db.query("select send_profile_contact_request('person-2','other','Una invitación profesional para un cortometraje.', $1) id",[project])).rows[0].id;
 assert.equal((await wallet()).reserved_contacts,1);assert.equal((await wallet()).consumed_contacts,0);
 assert.equal((await detail(request)).shared_contact_snapshot,null);
 assert.equal((await detail(request)).project_snapshot.title,'La última noche — revisada');
 assert.equal('client_name' in (await detail(request)).project_snapshot,false);
 await assert.rejects(send(2),/Existing request/);
 await assert.rejects(db.query("select transition_contact_request($1,'accept')",[request]),/Not authorized/);
 await as('authenticated',2);
 await assert.rejects(db.query("update catalog_inquiries set status='accepted' where id=$1",[request]),/Use request transition/);
 assert.equal((await db.query("select respond_profile_contact($1,'No debe responder por el canal anterior.') ok",[request])).rows[0].ok,false);
 await db.query("select transition_contact_request($1,'accept')",[request]);
 const snapshot={instagram:'private_qa',email:'explicit@example.invalid'};
 assert.deepEqual((await detail(request)).shared_contact_snapshot,snapshot);
 assert.ok((await detail(request)).contact_unlocked_at);
 await db.query("select transition_contact_request($1,'accept')",[request]);
 await db.query("select save_my_contact_channels($1)",[{instagram_username:'new_private',whatsapp_e164:'',preferred_contact:'none',contact_visibility:'private',contact_email:'new@example.invalid',phone_e164:'',share_instagram:false,share_whatsapp:false,share_email:false,share_phone:false}]);
 assert.deepEqual((await detail(request)).shared_contact_snapshot,snapshot);
 await as('authenticated',1);assert.equal((await wallet()).reserved_contacts,0);assert.equal((await wallet()).consumed_contacts,1);assert.deepEqual((await detail(request)).shared_contact_snapshot,snapshot);
 await db.query('select save_my_networking_project($1,$2)',[project,{...projectData,title:'Otro título'}]);
 assert.equal((await detail(request)).project_snapshot.title,'La última noche — revisada');
 assert.equal((await db.query("select list_my_contact_requests('accepted') r")).rows[0].r.length,1);
 await as('authenticated',3);assert.equal(await detail(request),null);assert.equal((await db.query('select shared_contact_snapshot from catalog_inquiries where id=$1',[request])).rows.length,0);
 await as('anon');await assert.rejects(db.query('select get_my_contact_request($1)',[request]),/permission denied/);
});
test('Reject, cancel, expire release credits and never unlock; reminder is deduplicated',async()=>{
 for(const [n,action] of [[3,'reject'],[4,'cancel'],[5,'expire']]) {
  await as('authenticated',1);const rid=(await send(n)).rows[0].id;
  assert.equal((await wallet()).reserved_contacts,1);
  if(action==='expire') {
   await as('postgres');await db.query("update catalog_inquiries set created_at=now()-interval '43 hours',expires_at=now()+interval '5 hours' where id=$1",[rid]);
   await as('authenticated',1);await wallet();await wallet();
   assert.equal((await db.query("select count(*)::int n from notifications where entity_id=$1 and type='contact_request_expiring'",[rid])).rows[0].n,1);
   await as('postgres');await db.query("update catalog_inquiries set created_at=now()-interval '49 hours',expires_at=now()-interval '1 hour' where id=$1",[rid]);
   await as('authenticated',1);await wallet();
  } else { await as('authenticated',action==='reject'?n:1);await db.query('select transition_contact_request($1,$2)',[rid,action]); }
  await as('authenticated',1);assert.equal((await wallet()).reserved_contacts,0);assert.equal((await wallet()).remaining_contacts,4);
  const r=await detail(rid);assert.equal(r.state,{reject:'rejected',cancel:'cancelled',expire:'expired'}[action]);assert.equal(r.shared_contact_snapshot,null);
 }
});
test('Credit cap cannot over-reserve; no self-contact, unrelated writes or client notification spoof',async()=>{
 await as('authenticated',1);for(const n of [6,7,8,9]) await send(n);
 assert.equal((await wallet()).remaining_contacts,0);await assert.rejects(send(10),/No available contact credits/);
 await assert.rejects(send(1),/unavailable/);
 await assert.rejects(db.query("update contact_credit_reservations set state='released'"),/permission denied/);
 await assert.rejects(db.query("insert into notifications(user_id,type,entity_type,entity_id) values($1,'follow_received','profile',$2)",[id(2),id(1)]),/permission denied/);
});
test('Private graph and notifications: actor-only lists, seven public identities, unread/mark read',async()=>{
 for(let n=3;n<=12;n++) {await as('authenticated',n);await db.query("select set_profile_follow('person-2',true)");}
 await as('anon');assert.equal((await db.query("select * from get_profile_followers('person-2')")).rows.length,7);
 assert.equal(Number((await db.query("select * from get_profile_followers('person-2')")).rows[0].total_count),10);
 await assert.rejects(db.query('select get_my_network()'),/permission denied/);
 await as('authenticated',2);assert.equal((await db.query('select get_my_network() r')).rows[0].r.length,10);
 assert.ok((await db.query('select get_my_network_summary() r')).rows[0].r.unread>=10);
 const ns=(await db.query('select get_my_network_notifications() r')).rows[0].r;assert.ok(ns.some(n=>n.type==='follow_received'));
 await db.query('select mark_my_network_notification(null)');assert.equal((await db.query('select get_my_network_summary() r')).rows[0].r.unread,0);
 await as('authenticated',3);assert.equal((await db.query('select get_my_network() r')).rows[0].r.length,0);
 assert.equal((await db.query('select * from notifications where user_id=$1',[id(2)])).rows.length,0);
 await db.query('select unfollow_my_network_profile($1)',[id(2)]);assert.equal((await db.query("select get_my_network('following') r")).rows[0].r.length,0);
});
test('Pro skips monetary cap but retains daily fair use',async()=>{
 await as('postgres');await db.exec('update billing_settings set test_access_enabled=true');
 await db.query("insert into admin_plan_grants(user_id,plan,granted_by,reason) values($1,'pro',$1,'Unit QA entitlement')",[id(16)]);
 await as('authenticated',16);for(let n=1;n<=10;n++)await send(n);
 assert.equal((await wallet()).reserved_contacts,0);assert.equal((await wallet()).remaining_contacts,5);await assert.rejects(send(11),/Daily inquiry limit/);
});
test('Outbox is private with RLS; legacy history keeps received and sent without new requests',async()=>{
 await as('postgres');assert.equal((await db.query("select relrowsecurity from pg_class where oid='private.network_email_outbox'::regclass")).rows[0].relrowsecurity,true);
 await db.query("insert into catalog_inquiries(profile_id,sender_id,recipient_id,message,source_type,contact_type,sender_display_name) values($1,$2,$1,'Consulta anterior sin reserva de créditos','profile','other','QA anterior')",[id(15),id(14)]);
 await as('authenticated',14);assert.equal((await db.query("select * from list_my_legacy_profile_contacts('sent')")).rows.length,1);
 await assert.rejects(db.query('select * from private.network_email_outbox'),/permission denied/);
 await as('authenticated',15);assert.equal((await db.query("select * from list_my_legacy_profile_contacts('received')")).rows.length,1);
 await as('authenticated',1);assert.equal((await db.query("select * from list_my_legacy_profile_contacts('sent')")).rows.length,0);
});

test('Project operational state is independent from archive and privacy, with required roles',async()=>{
 await as('authenticated',1);
 const p=(await db.query('select save_my_networking_project(null,$1) id',[projectData])).rows[0].id;
 for(const operational_status of ['active','pending_confirmation','inactive']) {
  await db.query('select save_my_networking_project($1,$2)',[p,{...projectData,operational_status}]);
  const row=(await db.query('select status,operational_status,networking_private from projects where id=$1',[p])).rows[0];
  assert.deepEqual(row,{status:'draft',operational_status,networking_private:true});
 }
 await db.query('select save_my_networking_project($1,$2)',[p,{...projectData,status:'archived'}]);
 assert.equal((await db.query('select operational_status from projects where id=$1',[p])).rows[0].operational_status,'inactive');
 await assert.rejects(db.query('select save_my_networking_project($1,$2)',[p,{...projectData,operational_status:'published'}]),/valid operational status/);
 await assert.rejects(db.query('select save_my_networking_project(null,$1)',[{...projectData,roles:[]}]),/at least one role/);
 await as('authenticated',2);assert.equal((await db.query('select id from projects where id=$1',[p])).rows.length,0);
});
test('Notification metadata exposes only published actor portraits and authorized project snapshot',async()=>{
 await as('authenticated',2);
 const notices=(await db.query('select get_my_network_notifications() r')).rows[0].r;
 const received=notices.find(n=>n.type==='contact_request_received' && n.project_title==='La última noche — revisada');
 assert.equal(received.has_actor,true);assert.equal(received.project_title,'La última noche — revisada');
 assert.equal(received.portrait_media_id,null);assert.equal(received.portrait_url,'');
 await as('authenticated',1);
 const own=(await db.query('select get_my_network_notifications() r')).rows[0].r;
 const expiring=own.find(n=>n.type==='contact_request_expiring');
 assert.equal(expiring.has_actor,false);assert.equal(expiring.portrait_media_id,null);
 await as('anon');await assert.rejects(db.query('select get_my_network_notifications()'),/permission denied/);
});
