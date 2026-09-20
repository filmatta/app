import assert from "node:assert/strict";
import test from "node:test";
import load from "../load.mjs";
const presentation=load("lib/profiles/presentation.ts"),constants=load("lib/profiles/constants.ts");
function fixture(signedIn=true,rpcError=null) {
 const calls=[],revalidated=[];
 const actions=load("app/mi-perfil/actions.ts",{
  "next/cache":{revalidatePath:p=>revalidated.push(p)},
  "next/navigation":{redirect:url=>{throw new Error("REDIRECT "+url);}},
  "@/lib/profiles/constants":constants,"@/lib/profiles/presentation":presentation,
  "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:"owner",user_metadata:{full_name:"Private Name"}}:null},error:null})},rpc:async(name,args)=>{calls.push({name,args});return {data:"public-slug",error:rpcError};}})},
 });
 const form=new FormData();
 for(const [key,value] of Object.entries({disciplines:"Actuación",availability:"available",contact_policy:"members_only",portfolio_items:"[]",presentation:JSON.stringify(presentation.EMPTY_PRESENTATION)}))form.set(key,value);
 return {calls,revalidated,form,actions};
}
test("anonymous profile save never reaches the mutation",async()=>{
 const f=fixture(false);await assert.rejects(f.actions.saveProfessionalProfile(f.form),/REDIRECT \/login/);assert.equal(f.calls.length,0);
});
test("save ignores forged ownership and revalidates both catalogs",async()=>{
 const f=fixture();f.form.set("user_id","another");f.form.set("slug","another");f.form.set("is_public","on");
 await assert.rejects(f.actions.saveProfessionalProfile(f.form),/saved=published/);
 assert.equal(f.calls[0].name,"save_my_professional_portfolio");assert.equal(f.calls[0].args.user_id,undefined);assert.equal(f.calls[0].args.slug,undefined);
 assert.deepEqual(f.revalidated,["/perfiles","/talento","/mi-perfil","/perfiles/public-slug"]);
});
test("invalid media cannot mutate; failed writes never claim success",async()=>{
 const f=fixture();f.form.set("presentation",JSON.stringify({...presentation.EMPTY_PRESENTATION,portrait_url:"javascript:alert(1)"}));
 await assert.rejects(f.actions.saveProfessionalProfile(f.form),/error=/);assert.equal(f.calls.length,0);
 const failed=fixture(true,{message:"internal database details"});await assert.rejects(failed.actions.saveProfessionalProfile(failed.form),e=>e.message.includes("error=")&&!e.message.includes("internal"));assert.equal(failed.revalidated.length,0);
});
