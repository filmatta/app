import assert from "node:assert/strict";
import { test } from "node:test";
import load from "../load.mjs";
const { portfolioGroups } = load("lib/profiles/portfolio-order.ts");
const base = {media_type:"video",status:"ready",featured:false,category:"work",sort_order:0};
test("images never move ahead of reel, mixed legacy images go to book and works are not duplicated",()=>{
 const items=[{...base,id:"r",category:"reel"},{...base,id:"v"},{...base,id:"p",media_type:"image",featured:true}, {...base,id:"pending",category:"reel",status:"uploading"}];
 const g=portfolioGroups(items);
 assert.equal(g.reel[0].id,"r"); assert.equal(g.book[0].id,"p");
 assert.deepEqual(Array.from(g.work,x=>x.id),["pending","v"]);
 assert.equal(new Set(Object.values(g).flat().map(i=>i.id)).size, items.length);
});
test("photo-only profiles render book with no false reel",()=>{
 const g=portfolioGroups([{...base,id:"image",category:"reel",media_type:"image"}]);
 assert.equal(g.reel.length,0);assert.equal(g.book.length,1);
});
