import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const files = {
  actions: fs.readFileSync("app/auth/actions.ts", "utf8"),
  callback: fs.readFileSync("app/auth/callback/route.ts", "utf8"),
  account: fs.readFileSync("app/cuenta/actions.ts", "utf8"),
  login: fs.readFileSync("app/login/page.tsx", "utf8"),
  signup: fs.readFileSync("app/registro/page.tsx", "utf8"),
  recovery: fs.readFileSync("app/recuperar-contrasena/page.tsx", "utf8"),
  reset: fs.readFileSync("app/restablecer-contrasena/page.tsx", "utf8"),
};

test("login, signup and callback sanitize post-auth destinations", () => {
  assert.match(
    files.actions,
    /getSafePostAuthPath\(formData\.get\("next"\)\)/,
  );
  assert.match(files.callback, /getSafePostAuthPath\(/);
  assert.match(files.login, /getSafePostAuthPath\(params\.next \?\? null\)/);
  assert.match(files.signup, /getSafePostAuthPath\(params\.next \?\? null\)/);
});

test("recovery and password reset sanitize every caller-controlled next", () => {
  assert.match(
    files.account,
    /const nextPath = getSafeNextPath\(formData\.get\("next"\), "\/cuenta"\);/,
  );
  assert.equal(
    files.account.match(/const nextPath = getSafeNextPath\(/g)?.length,
    2,
  );
  assert.match(
    files.recovery,
    /getSafeNextPath\(params\.next \?\? null, "\/cuenta"\)/,
  );
  assert.match(
    files.reset,
    /getSafeNextPath\(params\.next \?\? null, "\/cuenta"\)/,
  );
});

test("the callback resolves only the sanitized path", () => {
  assert.match(
    files.callback,
    /NextResponse\.redirect\(new URL\(nextPath, request\.url\)\)/,
  );
  assert.doesNotMatch(
    files.callback,
    /NextResponse\.redirect\(new URL\(request\.nextUrl\.searchParams/,
  );
});
