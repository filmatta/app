import assert from "node:assert/strict";
import { test } from "node:test";
import load from "../load.mjs";

test("Auth budgets use independent hashed account/IP keys and fail closed", async () => {
  const calls=[];
  let available=true;
  const { allowAuthAttempt }=load("lib/security/auth-rate-limit.ts",{
    "next/headers":{ headers:async()=>new Headers({"x-vercel-forwarded-for":"192.0.2.1"}) },
    "@/lib/supabase/admin":{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,...args});return {data:available};}})},
  },{VERCEL:"1",SUPABASE_SERVICE_ROLE_KEY:"test-only-hmac-key"});
  assert.equal(await allowAuthAttempt("login"," A@EXAMPLE.COM "),true);
  assert.equal(await allowAuthAttempt("login","a@example.com"),true);
  assert.equal(calls[1].p_key,calls[3].p_key);
  await allowAuthAttempt("login","b@example.com");
  assert.notEqual(calls[1].p_key,calls[5].p_key);
  assert.equal(calls[0].p_limit,60);
  assert.equal(calls[1].p_limit,10);
  assert.ok(calls.every(c=>!c.p_key.includes("@")&&!c.p_key.includes("192.0.2")));
  available=false;
  assert.equal(await allowAuthAttempt("recovery","a@example.com"),false);
});

test("untrusted or missing Vercel IP cannot bypass quotas", async()=>{
  const {allowAuthAttempt}=load("lib/security/auth-rate-limit.ts",{
    "next/headers":{headers:async()=>new Headers({"x-forwarded-for":"192.0.2.99"})},
    "@/lib/supabase/admin":{createAdminClient:()=>{throw new Error("should not execute");}},
  },{VERCEL:"1",SUPABASE_SERVICE_ROLE_KEY:"test"});
  assert.equal(await allowAuthAttempt("login","a@example.com"),false);
});
