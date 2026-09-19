// Opt-in Test/Preview validation. No traces/screenshots/session values are saved.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { testConfiguration, testSql } from "../integration/test-project.mjs";
import { totp } from "../totp.mjs";

const base = process.env.FILMATTA_PREVIEW_URL;
assert.match(base ?? "", /^https:\/\/app-[a-z0-9]+-filmatta\.vercel\.app$/);
const config = testConfiguration();
const setup = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const share = JSON.parse(fs.readFileSync(process.env.FILMATTA_PREVIEW_SHARE_FILE, "utf8"));
const secret = Object.entries(share.protectionBypass).find(([, info]) => info.scope === "shareable-link")?.[0];
assert.ok(secret, "Scoped share link required");
const browser = await chromium.launch({ headless: true, executablePath: process.env.FILMATTA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
const report = { preview: base, headers: [], cookies: [], checks: [], cspViolations: [] };
const users = [];
const prefix = `security-preview-${randomUUID()}`;
let stage = "setup";
let activePage;
const pending = [];
const authCookie = c => c.name.startsWith("sb-ezlycwkuzkwcnhrhiruv-auth-token");
const record = text => { report.checks.push(text); console.log(text); };

async function context() {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-vercel-skip-toolbar": "1" } });
  ctx.setDefaultTimeout(20_000);
  ctx.setDefaultNavigationTimeout(25_000);
  const access = await ctx.request.get(`${base}/?_vercel_share=${encodeURIComponent(secret)}`);
  assert.equal(new URL(access.url()).origin, base, "Preview access failed");
  ctx.on("response", response => {
    const phase = stage;
    pending.push((async () => {
      for (const header of await response.headersArray()) {
        if (header.name.toLowerCase() !== "set-cookie") continue;
        const [pair, ...attributes] = header.value.split(";");
        const name = pair.slice(0, pair.indexOf("="));
        if (!name.startsWith("sb-")) continue;
        report.cookies.push({ phase, name, attributes: attributes.map(s => s.trim()) });
      }
    })());
  });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", event => window.__csp.push({ directive: event.violatedDirective, blocked: event.blockedURI.split("?")[0] }));
  });
  return ctx;
}

async function createUser(admin = false) {
  const user = { email: `${prefix}-${users.length}@example.com`, password: randomBytes(24).toString("base64url") + "aA1!" };
  const result = await setup.auth.admin.createUser({ ...user, email_confirm: true });
  assert.equal(result.error, null, "QA account creation failed");
  user.id = result.data.user.id;
  users.push(user);
  if (admin) testSql(`update public.profiles set role='admin' where id='${user.id}' and exists(select 1 from auth.users where id='${user.id}' and email='${user.email}');`);
  return user;
}

async function login(page, user, next) {
  stage = "login";
  await page.goto(`${base}/login?next=${encodeURIComponent(next)}`);
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await page.waitForURL(url => url.pathname !== "/login", { timeout: 25000 });
  assert.equal(new URL(page.url()).origin, base);
}

try {
  const ctx = await context();
  const page = await ctx.newPage();
  activePage = page;
  for (const path of ["/", "/login", "/admin", "/cursos", "/perfiles", "/locaciones", "/oportunidades", "/jobs", "/marketplace", "/planes", "/tools", "/recuperar-contrasena", "/restablecer-contrasena", "/api/mux/webhooks"]) {
    const response = await ctx.request.get(base + path, { maxRedirects: 0 });
    const headers = response.headers();
    assert.ok(headers["content-security-policy"]?.includes("frame-ancestors 'none'"), path);
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.ok(headers["strict-transport-security"]?.includes("max-age="));
    report.headers.push({ path, status: response.status(), csp: headers["content-security-policy"], hsts: headers["strict-transport-security"], referrerPolicy: headers["referrer-policy"], permissionsPolicy: headers["permissions-policy"] });
  }
  record("HTTPS headers/HSTS on fourteen routes");
  const mux = await ctx.request.post(base + "/api/mux/webhooks", { data: "unsigned" });
  assert.equal(mux.status(), 400);
  const muxOversize = await ctx.request.post(base + "/api/mux/webhooks", {
    data: Buffer.alloc(1024 * 1024 + 1),
    headers: { "mux-signature": "invalid-test-signature" },
  });
  assert.equal(muxOversize.status(), 413);
  record("Unsigned and oversized Mux webhooks rejected before processing");
  for (const path of ["/", "/cursos", "/perfiles", "/locaciones", "/oportunidades", "/jobs", "/marketplace", "/planes", "/tools"]) {
    await page.goto(base + path);
    assert.equal(new URL(page.url()).origin, base);
    assert.equal(await page.locator("h1").count(), 1, `Expected one H1 at ${path}`);
  }
  record("Primary navigation, catalogs, tools and Billing plans render without runtime errors");
  const user = await createUser();
  await login(page, user, "/cuenta");
  assert.equal(new URL(page.url()).pathname, "/cuenta");
  const loginCookies = (await ctx.cookies()).filter(authCookie);
  assert.ok(loginCookies.length);
  for (const cookie of loginCookies) {
    assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, "Lax");
    assert.equal(cookie.domain, new URL(base).hostname); assert.equal(cookie.path, "/");
  }
  record("Login creates secure host-only Test session");
  for (const next of ["/cuenta", "/perfiles", "/restablecer-contrasena?next=/cuenta"]) {
    const response = await ctx.request.get(`${base}/login?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
    const location = new URL(response.headers().location, base);
    assert.equal(location.origin, base); assert.equal(location.pathname + location.search, next);
  }
  const malicious = ["/\t/example.invalid", "/%09/example.invalid", "//evil.example", "/\\evil.example", "https://evil.example", "javascript:", "data:", "/\r/evil.example", "/\n/evil.example", "/%0D%0A/evil.example", "/%2509/example.invalid", " //evil.example"];
  for (const next of malicious) {
    const response = await ctx.request.get(`${base}/login?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
    const location = new URL(response.headers().location, base);
    assert.equal(location.origin, base); assert.equal(location.pathname, "/cuenta");
  }
  record("Three valid destinations and twelve malicious redirects checked over HTTPS");
  await page.goto(base + "/admin");
  assert.equal(new URL(page.url()).pathname, "/");
  record("Normal user denied admin");

  // Force SDK refresh using this QA session's local expiry hint; no token is forged.
  stage = "refresh";
  const cookies = (await ctx.cookies()).filter(authCookie).sort((a,b) => a.name.localeCompare(b.name));
  const session = JSON.parse(Buffer.from(cookies.map(c => c.value).join("").slice(7), "base64url"));
  const previousRefresh = session.refresh_token;
  session.expires_at = Math.floor(Date.now()/1000)-60;
  const encoded = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  await ctx.clearCookies({ name: /^sb-ezlycwkuzkwcnhrhiruv-auth-token/ });
  const chunks = encoded.match(/.{1,3000}/g);
  await ctx.addCookies(chunks.map((value,i) => ({ name: `sb-ezlycwkuzkwcnhrhiruv-auth-token${chunks.length>1?'.'+i:''}`, value, domain: new URL(base).hostname, path: "/", sameSite: "Lax", secure: true })));
  await page.goto(base + "/cuenta");
  const refreshedCookies = (await ctx.cookies()).filter(authCookie).sort((a,b) => a.name.localeCompare(b.name));
  const refreshed = JSON.parse(Buffer.from(refreshedCookies.map(c=>c.value).join("").slice(7), "base64url"));
  assert.notEqual(refreshed.refresh_token, previousRefresh);
  record("Refresh rotates tokens and rewrites session cookies");
  stage = "logout";
  await page.locator('section[aria-labelledby="logout-heading"]').getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await page.waitForURL(url=>url.pathname === "/");
  assert.equal((await ctx.cookies()).filter(authCookie).length, 0);
  record("Logout removes all Auth chunks");

  stage = "recovery";
  await page.goto(base + "/recuperar-contrasena?next=/cuenta");
  await page.locator('input[name="email"]').fill(user.email);
  await page.getByRole("button", { name: "Enviar enlace", exact: true }).click();
  await page.waitForURL(url=>url.searchParams.get("sent") === "1");
  record("Recovery request retains generic response; email delivery not asserted");
  stage = "callback-invalid";
  const callback = await ctx.request.get(`${base}/auth/callback?code=invalid-qa-code&next=%2F%09%2Fevil.example`, { maxRedirects: 0 });
  assert.equal(new URL(callback.headers().location, base).pathname, "/login");
  assert.equal(new URL(callback.headers().location, base).origin, base);
  record("Invalid callback stays internal without creating a session");

  const admin = await createUser(true);
  await login(page, admin, "/admin/cursos");
  await page.waitForURL(url=>url.pathname === "/verificar-admin");
  assert.equal(new URL(page.url()).pathname, "/verificar-admin");
  stage = "mfa-enroll";
  await page.getByRole("button", { name: "Configurar autenticador", exact: true }).click();
  await page.locator("code").waitFor();
  const seed = await page.locator("code").innerText();
  const enrollmentCode = totp(seed);
  await page.locator("#totp").fill(enrollmentCode);
  await page.getByRole("button", { name: "Verificar y continuar", exact: true }).click();
  await page.waitForURL(url=>url.pathname === "/admin/cursos", { timeout: 20000 });
  report.cspViolations.push(...await page.evaluate(()=>window.__csp ?? []));
  record("Admin password-only blocked; real TOTP enrollment grants original admin destination");
  await page.goto(base + "/cuenta");
  await page.locator('section[aria-labelledby="logout-heading"]').getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await page.waitForURL(url=>url.pathname === "/");
  await login(page, admin, "/admin");
  await page.waitForURL(url=>url.pathname === "/verificar-admin");
  assert.equal(new URL(page.url()).pathname, "/verificar-admin");
  assert.equal(await page.getByRole("button", { name: "Configurar autenticador" }).count(), 0);
  record("Fresh password login requires existing TOTP challenge again");
  // Supabase rejects replaying the same TOTP timestep, so use the next code.
  if (totp(seed) === enrollmentCode) await new Promise(resolve => setTimeout(resolve, 31_000 - Date.now() % 30_000));
  stage="mfa-challenge";
  await page.locator("#totp").fill(totp(seed));
  await page.getByRole("button", { name: "Verificar y continuar", exact: true }).click();
  await page.waitForURL(url=>url.pathname === "/admin");
  record("Existing TOTP challenge grants admin access after fresh login");
  assert.equal((await ctx.cookies("https://app.filmatta.com")).filter(authCookie).length,0);
  record("Cookie jar sends no Preview Auth cookies to Production (no Production request)");
  assert.equal(report.cspViolations.length,0);
  await Promise.all(pending);
  report.result = "PASS";
} catch(error) {
  report.result="FAIL"; report.failedStage=stage;
  report.failedPath=activePage ? new URL(activePage.url()).pathname : null;
  console.error(`Preview validation failed in ${stage}: ${error.name}`);
  process.exitCode=1;
} finally {
  await browser.close();
  for(const user of users) {
    assert.ok(user.email.startsWith(prefix));
    assert.equal((await setup.auth.admin.deleteUser(user.id)).error,null,"QA cleanup failed");
  }
  fs.writeFileSync(process.env.FILMATTA_SECURITY_REPORT || ".vercel/security-preview-report.json", JSON.stringify(report,null,2));
  console.log(`Report: ${report.result}; ephemeral Test users cleaned up`);
}
