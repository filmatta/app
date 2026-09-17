import assert from "node:assert/strict";
import test from "node:test";
import load from "../load.mjs";

const safeNext = load("lib/auth/safe-next-path.ts");

function callbackWith(auth) {
  return load("app/auth/callback/route.ts", {
    "next/server": {
      NextRequest: Request,
      NextResponse: {
        redirect(url) {
          return Response.redirect(url, 307);
        },
      },
    },
    "@/lib/auth/safe-next-path": safeNext,
    "@/lib/supabase/server": {
      async createClient() {
        return { auth };
      },
    },
  });
}

function request(path) {
  const url = new URL(path, "https://app.filmatta.com");
  const value = new Request(url);
  value.nextUrl = url;
  return value;
}

test("valid PKCE code establishes the recovery session and keeps next", async () => {
  const exchanged = [];
  const route = callbackWith({
    async exchangeCodeForSession(code) {
      exchanged.push(code);
      return { data: { session: { access_token: "session" } }, error: null };
    },
    async verifyOtp() {
      assert.fail("verifyOtp must not run for a PKCE callback");
    },
  });

  const response = await route.GET(
    request(
      "/auth/callback?code=valid-code&next=%2Frestablecer-contrasena%3Fnext%3D%252Fcuenta",
    ),
  );

  assert.deepEqual(exchanged, ["valid-code"]);
  assert.equal(
    response.headers.get("location"),
    "https://app.filmatta.com/restablecer-contrasena?next=%2Fcuenta",
  );
});

for (const reason of ["invalid", "expired"]) {
  test(`${reason} PKCE code returns to recovery without nesting reset routes`, async () => {
    const route = callbackWith({
      async exchangeCodeForSession() {
        return { data: { session: null }, error: new Error(reason) };
      },
    });

    const response = await route.GET(
      request(
        `/auth/callback?code=${reason}-code&next=%2Frestablecer-contrasena%3Fnext%3D%252Fcuenta`,
      ),
    );
    const destination = new URL(response.headers.get("location"));

    assert.equal(destination.pathname, "/recuperar-contrasena");
    assert.equal(destination.searchParams.get("next"), "/cuenta");
    assert.ok(destination.searchParams.get("error"));
  });
}

test("recovery token hash is verified server-side and establishes a session", async () => {
  const verified = [];
  const route = callbackWith({
    async exchangeCodeForSession() {
      assert.fail("exchangeCodeForSession must not run for token_hash");
    },
    async verifyOtp(params) {
      verified.push(params);
      return { data: { session: { access_token: "session" } }, error: null };
    },
  });

  const response = await route.GET(
    request(
      "/auth/callback?token_hash=redacted-token&type=recovery&next=%2Frestablecer-contrasena%3Fnext%3D%252Fcuenta",
    ),
  );

  assert.equal(verified.length, 1);
  assert.equal(verified[0].token_hash, "redacted-token");
  assert.equal(verified[0].type, "recovery");
  assert.equal(
    response.headers.get("location"),
    "https://app.filmatta.com/restablecer-contrasena?next=%2Fcuenta",
  );
});

test("unsafe next is rejected", async () => {
  const route = callbackWith({
    async exchangeCodeForSession() {
      return { data: { session: { access_token: "session" } }, error: null };
    },
  });

  const response = await route.GET(
    request("/auth/callback?code=valid-code&next=https%3A%2F%2Fevil.example"),
  );

  assert.equal(
    response.headers.get("location"),
    "https://app.filmatta.com/cuenta",
  );
});

test("callback without authentication parameters fails safely", async () => {
  const route = callbackWith({});
  const response = await route.GET(request("/auth/callback"));
  const destination = new URL(response.headers.get("location"));

  assert.equal(destination.pathname, "/login");
  assert.equal(destination.searchParams.get("next"), "/cuenta");
  assert.ok(destination.searchParams.get("error"));
});

test("recovery return path accepts only the reset route and a safe inner next", () => {
  assert.equal(
    safeNext.getRecoveryReturnPath(
      "/restablecer-contrasena?next=%2Fcuenta",
    ),
    "/cuenta",
  );
  assert.equal(
    safeNext.getRecoveryReturnPath(
      "/restablecer-contrasena?next=https%3A%2F%2Fevil.example",
    ),
    "/cuenta",
  );
  assert.equal(safeNext.getRecoveryReturnPath("//evil.example/reset"), null);
  assert.equal(safeNext.getRecoveryReturnPath("/login?next=/cuenta"), null);
});
