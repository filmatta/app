import assert from "node:assert/strict";
import test from "node:test";
import load from "../load.mjs";
const helpers=load("lib/profiles/presentation.ts");
function fixture(data,error=null){
 return load("lib/profiles/data.ts",{react:{cache:fn=>fn},"./presentation":helpers,
 "@/lib/supabase/server":{createClient:async()=>({rpc:async()=>({data,error}),from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data,error})})})})})}});
}
test("public normalization removes private keys and unsafe portfolio links",async()=>{
 const p=await fixture([{slug:"public",display_name:"Public P.",disciplines:["Actuación"],is_public:true,email:"private@example.invalid",user_id:"secret",portfolio_items:[{kind:"reel",title:"Unsafe",url:"javascript:alert(1)"}],presentation:helpers.EMPTY_PRESENTATION}]).getPublicProfessionalProfile("public");
 assert.equal(p.email,undefined);assert.equal(p.user_id,undefined);assert.equal(p.portfolio_items.length,0);
});
test("drafts stay private and transport errors cannot become blank editable profiles",async()=>{
 assert.equal(await fixture([{slug:"draft",display_name:"Draft D.",is_public:false}]).getPublicProfessionalProfile("draft"),null);
 assert.equal(await fixture([],new Error("not called")).getPublicProfessionalProfile("../invalid"),null);
 await assert.rejects(fixture(null,{code:"XX000"}).getOwnedProfessionalProfile("owner"),/No pudimos cargar/);
 await assert.rejects(fixture(null,{code:"XX000"}).getPublicProfessionalProfile("public"),/No pudimos cargar/);
});
