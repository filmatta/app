import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import load from "../load.mjs";

const { applyAuthCookiePolicy, shouldUseSecureAuthCookies } = load(
  "lib/supabase/auth-cookie-policy.ts",
);

test("enables Secure on Vercel Preview and Production", () => {
  assert.equal(
    shouldUseSecureAuthCookies({
      vercelEnv: "preview",
      nodeEnv: "development",
    }),
    true,
  );
  assert.equal(
    shouldUseSecureAuthCookies({
      vercelEnv: "production",
      nodeEnv: "development",
    }),
    true,
  );
  assert.equal(
    shouldUseSecureAuthCookies({
      vercel: "1",
      nodeEnv: "development",
    }),
    true,
  );
});

test("enables Secure in a production server runtime", () => {
  assert.equal(
    shouldUseSecureAuthCookies({ nodeEnv: "production" }),
    true,
  );
});

test("uses the browser protocol and keeps localhost development on HTTP", () => {
  assert.equal(
    shouldUseSecureAuthCookies({
      protocol: "https:",
      nodeEnv: "development",
    }),
    true,
  );
  assert.equal(
    shouldUseSecureAuthCookies({
      protocol: "http:",
      nodeEnv: "production",
    }),
    false,
  );
});

test("adds only Secure while preserving Supabase cookie options", () => {
  const expires = new Date("2030-01-01T00:00:00.000Z");
  const original = {
    path: "/",
    domain: "preview.example",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 34560000,
    expires,
    priority: "high",
    secure: false,
  };

  const result = applyAuthCookiePolicy(original, { secure: true });

  assert.equal(result.path, original.path);
  assert.equal(result.domain, original.domain);
  assert.equal(result.sameSite, original.sameSite);
  assert.equal(result.httpOnly, original.httpOnly);
  assert.equal(result.maxAge, original.maxAge);
  assert.equal(result.expires, expires);
  assert.equal(result.priority, original.priority);
  assert.equal(result.secure, true);
  assert.equal(original.secure, false);
});

test("preserves deletion and chunk metadata", () => {
  const deletion = applyAuthCookiePolicy(
    { path: "/", sameSite: "lax", maxAge: 0 },
    { secure: true },
  );
  assert.equal(deletion.maxAge, 0);
  assert.equal(deletion.path, "/");
  assert.equal(deletion.sameSite, "lax");
  assert.equal(deletion.secure, true);

  const chunks = ["auth-token.0", "auth-token.1"].map((name) => ({
    name,
    options: applyAuthCookiePolicy(
      { path: "/", sameSite: "lax", maxAge: 34560000 },
      { secure: true },
    ),
  }));
  assert.equal(chunks.length, 2);
  for (const chunk of chunks) {
    assert.equal(chunk.options.path, "/");
    assert.equal(chunk.options.sameSite, "lax");
    assert.equal(chunk.options.maxAge, 34560000);
    assert.equal(chunk.options.secure, true);
  }
});

test("all Supabase cookie writers use the shared policy", () => {
  const server = fs.readFileSync("lib/supabase/server.ts", "utf8");
  const proxy = fs.readFileSync("lib/supabase/proxy.ts", "utf8");
  const browser = fs.readFileSync("lib/supabase/client.ts", "utf8");

  assert.match(server, /cookieOptions: cookiePolicy/);
  assert.match(server, /applyAuthCookiePolicy\(options, cookiePolicy\)/);
  assert.match(proxy, /cookieOptions: cookiePolicy/);
  assert.match(proxy, /applyAuthCookiePolicy\(options, cookiePolicy\)/);
  assert.match(browser, /cookieOptions: getBrowserAuthCookiePolicy\(\)/);
});
