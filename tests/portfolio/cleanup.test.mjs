import assert from "node:assert/strict";
import { test } from "node:test";
import load from "../load.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const creator = "22222222-2222-4222-8222-222222222222";

test("cleanup retries a claimed tombstone after external failure without restoring it", async () => {
  const row = { id, source: "mux", status: "deleted", visibility: "archived", updated_at: "1", cleanup_after: "2000-01-01", mux_upload_id: "upload", mux_environment_id: "test", mux_environment_type: "development" };
  let deletes = 0;
  const db = { from() {
    let changes, filters = [];
    const q = {
      update(v) { changes = v; return q; }, select() { return q; }, order() { return q; }, limit() { return q; },
      eq(k,v) { filters.push(r=>r[k]===v); return q; },
      neq(k,v) { filters.push(r=>r[k]!==v); return q; },
      in(k,v) { filters.push(r=>v.includes(r[k])); return q; },
      lt(k,v) { filters.push(r=>r[k]!=null&&r[k]<v); return q; },
      lte(k,v) { filters.push(r=>r[k]!=null&&r[k]<=v); return q; },
      then(resolve) { const matched=filters.every(f=>f(row)); if(matched&&changes)Object.assign(row,changes); return Promise.resolve({data:matched?[{...row}]:[],error:null}).then(resolve); },
    }; return q;
  }};
  const mux = {video:{uploads:{retrieve:async()=>({id:"upload",asset_id:"asset",new_asset_settings:{passthrough:"filmatta:portfolio:"+id}})},assets:{retrieve:async()=>({id:"asset",upload_id:"upload",passthrough:"filmatta:portfolio:"+id}),delete:async()=>{if(++deletes===1)throw Error("temporary failure");}}}};
  const api=load("lib/profiles/mux-media.ts",{"@/lib/supabase/admin":{createAdminClient:()=>db},"@/lib/mux/server":{createValidatedMuxContext:async()=>({mux,environment:{id:"test",type:"development"}}),isMuxNotFoundError:e=>e?.status===404}});
  await assert.rejects(api.cleanPortfolioMedia(),/temporary/);
  assert.equal(row.status,"deleted"); assert.ok(row.cleanup_after);
  assert.equal(await api.cleanPortfolioMedia(),1);
  assert.equal(row.cleanup_after,null); assert.equal(row.status,"deleted");
  assert.equal(await api.cleanPortfolioMedia(),0); assert.equal(deletes,2);
});

test("orphan sweep requires grace, namespace, matching upload metadata and zero references", async () => {
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
    assert.equal(deleted.length,scenario==="orphan"?1:0,scenario);
  }
});
