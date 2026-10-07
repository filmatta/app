// Cross-account check for the Shotlist link-sync route on Supabase Test only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { SUPABASE_CLI, TEST_REF } from "./portfolio-test-context.mjs";

assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF);
const preview = process.env.FILMATTA_SHOTLIST_V2_PREVIEW;
assert.match(preview ?? "", /^https:\/\/app-[a-z0-9]+-filmatta\.vercel\.app$/u);
const fixture = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "filmatta-shotlist-carbon-v2-fixture.json"), "utf8"));
const share = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "filmatta-shotlist-carbon-v2-preview-share.json"), "utf8"));
assert.equal(fixture.projectRef, TEST_REF);
assert.equal(share.preview, preview);
const keys = JSON.parse(execFileSync(SUPABASE_CLI, ["projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const anonKey = keys.find((item) => item.name === "anon")?.api_key;
const serviceKey = keys.find((item) => item.name === "service_role")?.api_key;
assert.ok(anonKey && serviceKey);
assert.equal(JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url")).ref, TEST_REF);
const url = `https://${TEST_REF}.supabase.co`;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceKey, options);
const outsider = createClient(url, anonKey, options);
const email = `shotlist-isolation-${randomUUID()}@example.invalid`;
const password = `${randomBytes(24).toString("base64url")}aA1!`;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Shotlist Isolation QA" } });
assert.equal(created.error, null);
const userId = created.data.user.id;
let browser;
try {
  const signed = await outsider.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null);
  const forged = await outsider.rpc("writer_create_shotlist", { p_script_id: fixture.scriptId, p_title: "No debe crearse", p_operation_id: randomUUID() });
  assert.ok(forged.error, "A different account must not link the QA source.");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.goto(share.shareUrl);
  await page.goto(`${preview}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((next) => !next.pathname.startsWith("/login"), { timeout: 30000 });
  const denied = await page.evaluate(async (id) => {
    const response = await fetch(`/api/shotlists/${id}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "syncSource", expectedRevision: 1 }) });
    return { status: response.status, body: await response.json() };
  }, fixture.linkedId);
  assert.equal(denied.status, 404);
  assert.equal(denied.body.code, "not_found");
  console.log(JSON.stringify({ preview, foreignScriptDenied: true, foreignShotlistSyncDenied: true, syntheticOutsiderRemoved: true }));
} finally {
  await browser?.close();
  const removed = await admin.auth.admin.deleteUser(userId);
  assert.equal(removed.error, null);
}
