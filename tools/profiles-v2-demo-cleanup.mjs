// Retire only this feature's intentional Test demos after review. Default is read-only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { testContext, TEST_REF } from "./portfolio-test-context.mjs";
const manifestPath=path.join(os.tmpdir(),"filmatta-profiles-v2-fixtures.json");
try {
 const m=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
 if(m.project!==TEST_REF||!/^profiles-v2-[0-9a-f-]{36}$/.test(m.run)||!Array.isArray(m.users)||m.users.length!==3)throw Error("Invalid fixture manifest");
 const c=await testContext(), ids=m.users.map(u=>u.id), plan=[];
 const checked=r=>{if(r.error)throw Error("Test operation failed");return r.data;};
 async function mux(url,method="GET"){const r=await fetch("https://api.mux.com"+url,{method,headers:{Authorization:c.muxAuthorization},signal:AbortSignal.timeout(15000)});if(r.status===404||r.status===204)return null;if(!r.ok)throw Error("Test Mux request failed");return(await r.json()).data;}
 // Validate the entire plan before the first mutation. Never use title matching for deletion.
 for(const u of m.users){
  if(!/^[0-9a-f-]{36}$/.test(u.id))throw Error("Invalid owner ID");
  const auth=checked(await c.admin.auth.admin.getUserById(u.id)).user;
  if(auth.user_metadata.qa_run!==m.run||auth.email!==u.email)throw Error("Wrong fixture owner");
  const rows=checked(await c.admin.from("profile_media").select("id,owner_id,storage_path,derivative_path,mux_upload_id").eq("owner_id",u.id));
  for(const row of rows){
   if(row.owner_id!==u.id||!/^[0-9a-f-]{36}$/.test(row.id))throw Error("Wrong row owner");
   const folder=`${u.id}/${row.id}`;
   const objects=checked(await c.admin.storage.from("profile-media").list(folder));
   const files=[...new Set([...objects.map(o=>folder+"/"+o.name),row.storage_path,row.derivative_path].filter(Boolean))];
   if(files.some(p=>!p.startsWith(folder+"/")||p.includes("..")))throw Error("Foreign storage path");
   let upload=null;
   if(row.mux_upload_id){
    upload=await mux("/video/v1/uploads/"+row.mux_upload_id);
    if(upload&&upload.new_asset_settings?.passthrough!=="filmatta:portfolio:"+row.id)throw Error("Foreign upload");
    if(upload?.asset_id){const asset=await mux("/video/v1/assets/"+upload.asset_id);if(asset&&(asset.passthrough!=="filmatta:portfolio:"+row.id||asset.meta?.creator_id!==u.id||!m.assets.some(a=>a.id===asset.id)))throw Error("Asset not created by this run");
     const refs=checked(await c.admin.from("profile_media").select("owner_id").eq("mux_asset_id",upload.asset_id));if(refs.some(r=>!ids.includes(r.owner_id)))throw Error("Shared asset");}
   }
   plan.push({owner:u.id,id:row.id,files,upload});
  }
 }
 if(process.argv[2]!=="cleanup"){console.log(JSON.stringify({readOnly:true,project:TEST_REF,owners:ids.length,rows:plan.length,files:plan.reduce((n,r)=>n+r.files.length,0),message:"Intentional demos preserved. Explicit cleanup only after review."}));}
 else {
  for(const row of plan){if(row.upload?.asset_id)await mux("/video/v1/assets/"+row.upload.asset_id,"DELETE");else if(row.upload?.status==="waiting")await mux("/video/v1/uploads/"+row.upload.id+"/cancel","PUT");if(row.files.length)checked(await c.admin.storage.from("profile-media").remove(row.files));}
  for(const u of m.users)checked(await c.admin.auth.admin.deleteUser(u.id));
  if(checked(await c.admin.from("profile_media").select("id").in("owner_id",ids)).length)throw Error("Fixture rows remain");
  fs.rmSync(manifestPath);console.log(JSON.stringify({project:TEST_REF,ownDemoCleanupComplete:true}));
 }
}catch{console.error("Demo retirement stopped safely. No credentials logged. Verify only this feature's Test fixture manifest before retrying.");process.exitCode=1;}
