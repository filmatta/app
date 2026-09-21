import assert from "node:assert/strict";
import {test} from "node:test";
import sharp from "sharp";
import load from "../load.mjs";
const imageInput=load("lib/profiles/image-input.ts");
test("image completion publishes only decoded EXIF-free derivative and keeps previous identity unchanged",async()=>{
 const original=await sharp({create:{width:800,height:1000,channels:3,background:"#aabbcc"}}).jpeg().withMetadata({exif:{IFD0:{Artist:"Private metadata"}}}).toBuffer();
 const row={id:"item",owner_id:"owner",source:"storage",status:"uploading",purpose:"portrait",storage_path:"owner/item/original.jpg",mime_type:"image/jpeg",expected_size_bytes:original.length,updated_at:"old",image_crop:{x:50,y:50,zoom:1,frame:"square"}};
 const writes=[]; let published;
 const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:row})};
 const owner={auth:{getUser:async()=>({data:{user:{id:"owner"}}})},from:()=>q,storage:{from:()=>({download:async()=>({data:new Blob([original])})})}};
 const mutation={eq(){return mutation;},select:async()=>({data:[{id:"item"}]})};
 const admin={from:()=>({update:changes=>{writes.push(changes);return mutation;}}),storage:{from:()=>({upload:async(path,data)=>{published=data;return {};},remove:async()=>({})})}};
 const route=load("app/api/portfolio/media/[id]/complete/route.ts",{"@/lib/supabase/server":{createClient:async()=>owner},"@/lib/supabase/admin":{createAdminClient:()=>admin},"@/lib/profiles/media":{IMAGE_LIMIT:20000000},"@/lib/profiles/request-origin":{portfolioRequestOrigin:()=>true},"@/lib/profiles/image-input":imageInput});
 assert.equal((await route.POST(new Request("https://example.test",{method:"POST"}),{params:Promise.resolve({id:"item"})})).status,200);
 const info=await sharp(published).metadata();assert.equal(info.exif,undefined);assert.equal(info.width,info.height);
 assert.equal(writes[0].status,"ready");assert.match(writes[0].derivative_path,/owner\/item\/public-.*[.]webp$/);assert.equal(writes[0].storage_path,undefined);
});
test("crop boundaries cannot exceed source and format validation is bounded",()=>{
 for(const ratio of [1,1920/780])for(const x of [0,100])for(const y of [0,100])for(const zoom of [1,3]){
 const rect=imageInput.cropRectangle(501,801,ratio,{x,y,zoom,frame:"auto"});
 assert.ok(rect.left>=0 && rect.top>=0 && rect.left+rect.width<=501 && rect.top+rect.height<=801);
 }
 assert.equal(imageInput.parseImageCrop({x:NaN,y:50,zoom:1,frame:"auto"}),null);
});
