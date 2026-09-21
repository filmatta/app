import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function as(role,n=0) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']); if(role!=='postgres') await db.exec(`set role ${role}`); }
const access=async()=> (await db.query("select * from get_my_profile_contact_access('person-2')")).rows[0];
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
    '20260924020000_custom_reel_cover.sql','20260924030000_profile_social_contact_foundation.sql'
  ]) await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  for(let n=1;n<=16;n++) {
    await db.query('insert into auth.users(id) values($1)',[id(n)]);
    await db.query("insert into professional_profiles(user_id,slug,display_name,disciplines,is_public) values($1,$2,$3,array['Dirección'],true)",[id(n),`person-${n}`,`Persona ${n}`]);
  }
});
after(()=>db.close());

test('Follow: RLS actor, unique pair, no self, published target and limited public proof',async()=>{
  await as('anon'); await assert.rejects(db.query("select set_profile_follow('person-2',true)"),/permission denied/);
  await as('authenticated',1);
  await assert.rejects(db.query('insert into profile_follows(follower_id,profile_id) values($1,$2)',[id(3),id(2)]),/row-level security/);
  await assert.rejects(db.query("select set_profile_follow('person-1',true)"),/unavailable/);
  await db.query("select set_profile_follow('person-2',true)");
  await db.query("select set_profile_follow('person-2',true)");
  assert.equal((await db.query('select count(*)::int n from profile_follows')).rows[0].n,1);
  await assert.rejects(db.query('insert into profile_follows(follower_id,profile_id) values($1,$2)',[id(1),id(2)]),/duplicate key/);
  assert.equal((await db.query("select am_i_following_profile('person-2') ok")).rows[0].ok,true);
  for(let n=3;n<=7;n++) {await as('authenticated',n); await db.query("select set_profile_follow('person-2',true)");}
  await as('postgres');await db.query('update professional_profiles set is_public=false where user_id=$1',[id(7)]);
  await as('authenticated',1); await assert.rejects(db.query("select set_profile_follow('person-7',true)"),/unavailable/);
  await as('anon');
  await assert.rejects(db.query('select * from profile_follows'),/permission denied/);
  const proof=(await db.query("select * from get_profile_followers('person-2')")).rows;
  assert.equal(proof.length,3);assert.ok(proof.every(p=>p.slug!=='person-7'));
  assert.deepEqual(Object.keys(proof[0]).sort(),['display_name','portrait_media_id','portrait_url','slug']);
  assert.equal((await db.query("select * from get_profile_followers('person-7')")).rows.length,0);
  await as('authenticated',1);await db.query("select set_profile_follow('person-2',false)");
  assert.equal((await db.query("select am_i_following_profile('person-2') ok")).rows[0].ok,false);
});

test('Public preferences require explicit owner consent; private contacts and drafts never project',async()=>{
  const prefs={formats:['Cortometraje'],open_formats:false,themes:{drama:'accept'},participation:{nudity:'decline'},conditions:{travel:'consult'}};
  await as('authenticated',2);
  await db.query('select save_my_project_preferences($1)',[prefs]);
  await db.query('select save_my_private_contact($1)',[{instagram_username:'qa_private',whatsapp_e164:'',preferred_contact:'instagram',contact_visibility:'private'}]);
  await as('anon');assert.equal((await db.query("select get_public_project_preferences('person-2') p")).rows[0].p,null);
  await as('authenticated',2);await db.query('select save_my_project_preferences_visibility($1,true)',[prefs]);
  await as('anon');assert.deepEqual((await db.query("select get_public_project_preferences('person-2') p")).rows[0].p,prefs);
  await as('authenticated',2);await db.query('select save_my_project_preferences($1)',[prefs]);
  await as('anon');assert.equal((await db.query("select get_public_project_preferences('person-2') p")).rows[0].p,null);
  await as('authenticated',2);await db.query('select save_my_project_preferences_visibility($1,true)',[prefs]);
  await as('authenticated',1);assert.equal((await db.query('select * from profile_private_settings where owner_id=$1',[id(2)])).rows.length,0);
  await as('postgres');await db.query('update professional_profiles set is_public=false where user_id=$1',[id(2)]);
  await as('anon');assert.equal((await db.query("select get_public_project_preferences('person-2') p")).rows[0].p,null);
  await as('postgres');await db.query('update professional_profiles set is_public=true where user_id=$1',[id(2)]);
  await as('authenticated',2);await db.query('select save_my_project_preferences_visibility($1,false)',[prefs]);
  await as('anon');assert.equal((await db.query("select get_public_project_preferences('person-2') p")).rows[0].p,null);
});

test('Free credits: exactly one per distinct profile, repeat unchanged, exhaustion atomic, no caller writes',async()=>{
  await as('authenticated',1);assert.equal((await access()).remaining_contacts,5);
  await send(2);assert.equal((await access()).remaining_contacts,4);
  await assert.rejects(send(2),/cooldown/);assert.equal((await access()).remaining_contacts,4);
  const a=await access();assert.equal(a.already_contacted,true);assert.ok(a.thread_id);
  for(let n=3;n<=6;n++) await send(n);
  assert.equal((await access()).remaining_contacts,0);
  await assert.rejects(send(8),/No new contact credits/);
  assert.equal((await db.query('select count(*)::int n from profile_contact_relationships')).rows[0].n,5);
  await assert.rejects(db.query('delete from profile_contact_relationships'),/permission denied/);
  await assert.rejects(db.query('update private.profile_contact_policy set free_contact_limit=500'),/permission denied/);
  // A later valid contact to the same recipient is not charged again.
  await as('postgres');await db.query("update catalog_inquiries set status='archived',created_at=now()-interval '8 days' where sender_id=$1 and profile_id=$2",[id(1),id(2)]);
  await as('authenticated',1);await send(2);assert.equal((await access()).remaining_contacts,0);
  await as('authenticated',3);assert.equal((await access()).remaining_contacts,5);
  assert.equal((await db.query('select count(*)::int n from profile_contact_relationships')).rows[0].n,0);
});

test('Pro uses existing entitlement without spending credits and preserves shared daily anti-abuse',async()=>{
  await as('postgres');
  await db.exec('update billing_settings set test_access_enabled=true');
  await db.query("insert into admin_plan_grants(user_id,plan,granted_by,reason) values($1,'pro',$1,'Temporary unit test entitlement')",[id(16)]);
  await as('authenticated',16);assert.equal((await access()).is_pro,true);
  for(const n of [1,2,3,4,5,6,8,9,10,11]) await send(n);
  assert.equal((await access()).remaining_contacts,5);
  await assert.rejects(send(12),/Daily inquiry limit/);
  assert.ok((await db.query('select charged from profile_contact_relationships')).rows.every(r=>!r.charged));
});
