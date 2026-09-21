// Explicit Test-only, real Auth/RLS. All temporary users/grants are removed in finally.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {testContext,TEST_REF,testSql} from '../../tools/portfolio-test-context.mjs';
if(process.env.FILMATTA_RUN_REMOTE_TESTS!==TEST_REF) throw new Error('Supabase Test opt-in required');
const run=`social-qa-${randomUUID()}`, users=[];
const c=await testContext();
function ok(r,label) { if(r.error) throw new Error(`${label}: ${r.error.code ?? 'request_failed'}`); return r.data; }
async function create(index) {
  const password=randomBytes(24).toString('base64url')+'aA1!';
  const email=`${run}-${index}@example.invalid`;
  const u=ok(await c.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_run:run,full_name:`Social QA ${index}`}}),'create user').user;
  users.push(u.id);
  const db=c.client(c.anonKey);
  ok(await db.auth.signInWithPassword({email,password}),'real login');
  const slug=ok(await db.rpc('save_my_professional_profile',{p_disciplines:['Dirección'],p_city:'QA Test',p_bio:'Perfil ficticio temporal para verificar privacidad.',p_availability:'available',p_skills:[],p_equipment:[],p_portfolio_items:[],p_is_public:true,p_contact_policy:'members_only'}),'profile');
  return {id:u.id,db,slug};
}
try {
  const free=await create(0),pro=await create(1),targets=[];
  for(let i=2;i<13;i++) targets.push(await create(i));
  const target=targets[0];
  const access=async actor=>ok(await actor.db.rpc('get_my_profile_contact_access',{p_slug:target.slug}),'credits')[0];
  const send=(actor,t)=>actor.db.rpc('send_profile_contact',{p_slug:t.slug,p_contact_type:'other',p_message:`Consulta ficticia QA para proyecto ${t.slug}; no requiere respuesta.`});
  assert.equal((await access(free)).remaining_contacts,5);
  const contacts=await Promise.all(targets.slice(0,6).map(t=>send(free,t)));
  assert.equal(contacts.filter(r=>!r.error).length,5);
  assert.equal(contacts.filter(r=>r.error?.code==='PCC01').length,1);
  assert.equal((await access(free)).remaining_contacts,0);
  const contacted=targets[contacts.findIndex(r=>!r.error)];
  assert.ok((await send(free,contacted)).error);
  assert.equal((await access(free)).remaining_contacts,0);
  // Existing entitlement mechanism, no Stripe records and no purchase.
  testSql(`insert into public.admin_plan_grants(user_id,plan,granted_by,reason,expires_at) values('${pro.id}','pro','${pro.id}','${run}',now()+interval '1 hour')`);
  assert.equal((await access(pro)).is_pro,true);
  for(const t of targets.slice(0,10)) ok(await send(pro,t),'Pro inquiry');
  assert.equal((await access(pro)).remaining_contacts,5);
  assert.equal((await send(pro,targets[10])).error?.code,'22023');
  const anonymous=c.client(c.anonKey);
  assert.ok((await anonymous.rpc('set_profile_follow',{p_slug:target.slug,p_follow:true})).error);
  assert.ok((await free.db.rpc('set_profile_follow',{p_slug:free.slug,p_follow:true})).error);
  assert.ok((await free.db.from('profile_follows').insert({follower_id:pro.id,profile_id:target.id})).error);
  ok(await free.db.rpc('set_profile_follow',{p_slug:target.slug,p_follow:true}),'follow');
  ok(await free.db.rpc('set_profile_follow',{p_slug:target.slug,p_follow:true}),'idempotent follow');
  assert.ok((await free.db.from('profile_follows').insert({follower_id:free.id,profile_id:target.id})).error);
  assert.equal(ok(await free.db.rpc('am_i_following_profile',{p_slug:target.slug}),'persistent follow'),true);
  const proof=ok(await anonymous.rpc('get_profile_followers',{p_slug:target.slug}),'public proof');
  assert.equal(proof.length,1);assert.equal(proof[0].slug,free.slug);
  assert.deepEqual(Object.keys(proof[0]).sort(),['display_name','portrait_media_id','portrait_url','slug','total_count']);
  ok(await free.db.rpc('set_profile_follow',{p_slug:target.slug,p_follow:false}),'unfollow');
  assert.equal(ok(await anonymous.rpc('get_profile_followers',{p_slug:target.slug}),'empty proof').length,0);
  const preferences={formats:['Cortometraje'],open_formats:false,themes:{drama:'accept'},participation:{nudity:'decline'},conditions:{travel:'consult'}};
  ok(await target.db.rpc('save_my_project_preferences_visibility',{p_preferences:preferences,p_publish:false}),'private preferences');
  assert.equal(ok(await anonymous.rpc('get_public_project_preferences',{p_slug:target.slug}),'private projection'),null);
  ok(await target.db.rpc('save_my_project_preferences_visibility',{p_preferences:preferences,p_publish:true}),'consent');
  assert.deepEqual(ok(await anonymous.rpc('get_public_project_preferences',{p_slug:target.slug}),'public preferences'),preferences);
  ok(await target.db.rpc('save_my_project_preferences',{p_preferences:preferences}),'legacy private save');
  assert.equal(ok(await anonymous.rpc('get_public_project_preferences',{p_slug:target.slug}),'legacy private projection'),null);
  ok(await target.db.rpc('save_my_project_preferences_visibility',{p_preferences:preferences,p_publish:true}),'renewed consent');
  assert.equal(ok(await free.db.from('profile_private_settings').select('*').eq('owner_id',target.id),'private RLS').length,0);
  ok(await target.db.rpc('save_my_professional_profile',{p_disciplines:['Dirección'],p_city:'QA Test',p_bio:'Borrador privado.',p_availability:'available',p_skills:[],p_equipment:[],p_portfolio_items:[],p_is_public:false,p_contact_policy:'members_only'}),'draft');
  assert.equal(ok(await anonymous.rpc('get_public_project_preferences',{p_slug:target.slug}),'draft preferences'),null);
  assert.ok((await free.db.rpc('set_profile_follow',{p_slug:target.slug,p_follow:true})).error);
  console.log('PASS: real Test Auth/RLS, concurrent 5-credit cap, repeat free, Pro entitlement/rate limit, Follow/duplicate/self/forged actor, consent/draft privacy.');
} finally {
  testSql(`delete from public.admin_plan_grants where reason='${run}'`);
  for(const id of users) {
    const u=ok(await c.admin.auth.admin.getUserById(id),'cleanup identity').user;
    assert.equal(u.user_metadata.qa_run,run);
    ok(await c.admin.auth.admin.deleteUser(id),'cleanup user');
  }
  assert.equal(testSql(`select count(*)::int n from auth.users where raw_user_meta_data->>'qa_run'='${run}'`)[0].n,0);
  console.log('PASS: temporary Test users, profiles, relationships, inquiries and Pro grant removed.');
}
