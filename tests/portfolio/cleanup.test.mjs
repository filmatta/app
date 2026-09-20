import assert from "node:assert/strict";
import { test } from "node:test";
import load from "../load.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const creator = "22222222-2222-4222-8222-222222222222";

test("provider timeout alone ends an attempt; background, processing and ready preserve media", () => {
  const api = load("lib/profiles/upload-lifecycle.ts");
  for (const status of ["waiting", "preparing", "uploading"]) assert.equal(api.uploadDecision({status}), "preserve");
  for (const status of ["cancelled", "timed_out", "errored"]) {
    assert.equal(api.uploadDecision({status}), "terminal");
    assert.equal(api.uploadDecision({status, asset_id: "received"}), "reconcile-asset");
  }
});

test("orphan inventory flags only proven unreferenced portfolio assets and never deletes them", async () => {
  const base={id:"asset",upload_id:"upload",passthrough:"filmatta:portfolio:"+id,created_at:"1000",meta:{external_id:id,creator_id:creator}};
  for(const scenario of ["orphan","learn","recent","referenced","wrong-creator","missing-metadata"]){
    const asset={...base,meta:{...base.meta}}; if(scenario==="learn")asset.passthrough="filmatta:lesson:"+id;
    if(scenario==="recent")asset.created_at=String(Math.floor(Date.now()/1000));
    if(scenario==="missing-metadata")asset.meta={};
    const deleted=[];
    const mux={video:{assets:{async *list(){yield asset;},delete:async value=>deleted.push(value)},uploads:{retrieve:async()=>({id:"upload",asset_id:"asset",new_asset_settings:{passthrough:base.passthrough,meta:{external_id:id,creator_id:scenario==="wrong-creator"?"foreign":creator}}})}}};
    const db={from(){return {select(){return this;},or:async()=>({data:scenario==="referenced"?[{id}]:[],error:null})};}};
    const api=load("lib/profiles/mux-media.ts",{"@/lib/supabase/admin":{createAdminClient:()=>db},"@/lib/mux/server":{createValidatedMuxContext:async()=>({mux}),isMuxNotFoundError:e=>e?.status===404}});
    assert.equal(await api.cleanPortfolioOrphans(),scenario==="orphan"?1:0,scenario);
    assert.equal(deleted.length,0,scenario);
  }
});
