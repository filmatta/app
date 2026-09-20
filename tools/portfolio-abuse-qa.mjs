import {testContext} from './portfolio-test-context.mjs';
import {randomUUID,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import Mux from '@mux/mux-node';
import load from '../tests/load.mjs';
const c=await testContext(),checks=[];
const checked=r=>{if(r.error)throw new Error('Test fixture database failure');return r.data;};
const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const mux=new Mux({tokenId:c.muxTokenId,tokenSecret:c.muxTokenSecret});
const created=checked(await c.admin.auth.admin.createUser({email:`portfolio-abuse-${randomUUID()}@example.invalid`,password:randomBytes(30).toString('hex')+'aA1!',email_confirm:true,user_metadata:{full_name:'Disposable Abuse QA'}}));
const userId=created.user.id;let upload;
try {
 const password=randomBytes(30).toString('hex')+'aA1!';checked(await c.admin.auth.admin.updateUserById(userId,{password}));const client=c.client(c.anonKey);checked(await client.auth.signInWithPassword({email:created.user.email,password}));
 checked(await client.rpc('save_my_professional_profile',{p_disciplines:['Dirección'],p_city:'QA Test',p_bio:'Disposable QA',p_availability:'available',p_skills:[],p_equipment:[],p_portfolio_items:[],p_is_public:false,p_contact_policy:'closed'}));
 const metadata={category:'reel',title:'Abandoned upload QA',role:'QA',year:'2026',description:'',media_type:'video',source:'mux',url:'',featured:false};
 const reserve=(n=1000)=>client.rpc('reserve_my_profile_upload',{p_data:metadata,p_size:n,p_mime:'video/mp4',p_extension:'mp4'});
 check(Boolean((await reserve(5000000001)).error),'declared >5GB rejected before reservation');
 const first=checked(await reserve()),second=checked(await reserve());check(Boolean((await reserve()).error),'third concurrent pending upload rejected');
 upload=await mux.video.uploads.create({cors_origin:'http://localhost',timeout:3600,new_asset_settings:{test:true,playback_policies:['signed'],passthrough:'filmatta:portfolio:'+first}});
 checked(await client.rpc('bind_my_profile_upload',{p_id:first,p_upload:upload.id,p_environment:'kospfo',p_environment_type:'development'}));
 checked(await c.admin.from('profile_media').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('owner_id',userId).in('id',[first,second]));
 const mediaModule=load('lib/profiles/mux-media.ts',{'@/lib/mux/server':{createValidatedMuxContext:async()=>({mux,environment:{id:'kospfo',type:'development'}}),isMuxNotFoundError:e=>e?.status===404},'@/lib/supabase/admin':{createAdminClient:()=>c.admin}});
 await mediaModule.cleanPortfolioMedia();check((await mux.video.uploads.retrieve(upload.id)).status==='cancelled','abandoned real Mux upload cancelled by cleanup');
 check(checked(await c.admin.from('profile_media').select('status').eq('owner_id',userId)).every(r=>r.status==='deleted'),'expired pending items reach terminal deleted state');
 for(let i=0;i<8;i++){const id=checked(await reserve());checked(await c.admin.from('profile_media').update({status:'errored'}).eq('id',id).eq('owner_id',userId));}
 check(Boolean((await reserve()).error),'daily quota counts failed and deleted attempts');
 checked(await c.admin.from('profile_media').update({created_at:new Date(Date.now()-2*86400000).toISOString()}).eq('owner_id',userId));
 for(let i=0;i<20;i++){const id=checked(await reserve());checked(await c.admin.from('profile_media').update({status:'errored',created_at:new Date(Date.now()-2*86400000).toISOString()}).eq('id',id).eq('owner_id',userId));}
 check(Boolean((await reserve()).error),'30-day quota blocks attempt 31');
} catch(e){console.error('QA failed: '+e.message);process.exitCode=1;} finally {
 if(upload){const u=await mux.video.uploads.retrieve(upload.id);if(u.status==='waiting')await mux.video.uploads.cancel(upload.id);}
 checked(await c.admin.auth.admin.deleteUser(userId));
 fs.writeFileSync('docs/review/profile-portfolio-editor-v1/abuse-qa.json',JSON.stringify({checks,cleaned:true,testEnvironment:'kospfo'},null,2));
 console.log('Disposable abuse QA fixture removed');
}
