import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import Mux from "@mux/mux-node";
import load from "../load.mjs";

const bounded = load("lib/security/bounded-body.ts");
const request = (body, headers = {}) => new Request("https://preview.invalid/webhook", {
  method: "POST", body, headers, duplex: "half",
});

test("body cap counts bytes, accepts exact boundary and rejects forged/missing lengths", async () => {
  assert.equal(await bounded.readBoundedBody(request("éé"), 4), "éé");
  for (const headers of [{}, { "content-length": "1" }]) {
    await assert.rejects(bounded.readBoundedBody(request("ééé", headers), 4), { status: 413 });
  }
  const oversized = request("x", { "content-length": "1048577" });
  await assert.rejects(bounded.readBoundedBody(oversized, 1048576), { status: 413 });
  assert.equal(oversized.bodyUsed, false);
  await assert.rejects(bounded.readBoundedBody(request("x", { "content-length": "garbage" }), 10), { status: 400 });
});

test("body streaming cancels oversized and slow requests", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)); },
    cancel() { cancelled = true; } });
  await assert.rejects(bounded.readBoundedBody(request(stream), 10), { status: 413 });
  assert.equal(cancelled, true);
  await assert.rejects(bounded.readBoundedBody(request(new ReadableStream()), 10, 20), { status: 408 });
});

test("Mux verifies exact signed bytes; rejects oversize/signature and preserves retries", async () => {
  const secret = "isolated-test-secret";
  const mux = new Mux({ tokenId: "test-only", tokenSecret: "test-only" });
  let privileged = 0;
  const { POST } = load("app/api/mux/webhooks/route.ts", {
    "@/lib/security/bounded-body": bounded,
    "@/lib/mux/server": { createMuxClient: () => mux },
    "@/lib/mux/environment": {
      getMuxEnvironmentExpectation: () => ({ id: "env-test", type: "development" }),
      assertMuxEnvironment: async () => {},
    },
    "@/lib/mux/sync-asset": {},
    "@/lib/profiles/mux-media": {},
    "@/lib/supabase/admin": { createAdminClient: () => { privileged++; throw Error("Unexpected DB"); } },
  }, { MUX_WEBHOOK_SECRET: secret });
  const body = JSON.stringify({ id: "test", type: "video.upload.created", environment: { id: "env-test" }, data: { id: "test" } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  for (let i = 0; i < 2; i++) assert.equal((await POST(request(body, { "mux-signature": signature }))).status, 200);
  assert.equal((await POST(request(body + " ", { "mux-signature": signature }))).status, 400);
  assert.equal((await POST(request(body))).status, 400);
  assert.equal((await POST(request("x", { "content-length": "1048577" }))).status, 413);
  assert.equal((await POST(request("x".repeat(1048577), { "mux-signature": signature }))).status, 413);
  assert.equal(privileged, 0);
});

test("CSP confines runtime, media and app Auth to explicit sources with framing disabled", () => {
  const { securityHeaders } = load("lib/security/headers.ts");
  const headers = Object.fromEntries(securityHeaders(false, "https://test.supabase.co").map(h => [h.key, h.value]));
  const csp = headers["Content-Security-Policy"];
  assert.ok(!csp.includes("unsafe-eval"));
  for (const value of ["frame-ancestors 'none'", "object-src 'none'", "https://test.supabase.co", "wss://test.supabase.co", "https://*.litix.io", "https://storage.googleapis.com", "https://checkout.stripe.com"]) assert.ok(csp.includes(value), value);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.ok(!Object.hasOwn(headers, "Strict-Transport-Security"));
});
