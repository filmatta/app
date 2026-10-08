import assert from "node:assert/strict";
import test from "node:test";
import load from "../load.mjs";

const preview = "https://app-auth-gate-filmatta.vercel.app";
const safeNext = load("lib/auth/safe-next-path.ts");
const feedback = load("lib/auth/feedback.ts");
const origin = load("lib/auth/callback-origin.ts", {}, { NODE_ENV: "production", VERCEL_URL: "app-auth-gate-filmatta.vercel.app" });

function requestHeaders(value = preview, host = "app-auth-gate-filmatta.vercel.app") {
  return new Headers({ origin: value, host });
}

function redirect(destination) {
  throw Object.assign(new Error("NEXT_REDIRECT"), { destination });
}

function actionsWith(auth) {
  return load("app/auth/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/headers": { async headers() { return requestHeaders(); } },
    "next/navigation": { redirect },
    "@/lib/auth/safe-next-path": safeNext,
    "@/lib/auth/callback-origin": origin,
    "@/lib/auth/feedback": feedback,
    "@/lib/security/auth-rate-limit": { async allowAuthAttempt() { return true; } },
    "@/lib/supabase/server": { async createClient() { return { auth }; } },
  });
}

function signupForm(email = "new@example.com", password = "long-password") {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  form.set("next", "/create");
  return form;
}

test("Auth email callbacks accept only the current, exact app origin", () => {
  assert.equal(origin.getAuthCallbackOrigin(requestHeaders()), preview);
  assert.equal(origin.getAuthCallbackOrigin(requestHeaders("https://evil.example")), null);
  assert.equal(origin.getAuthCallbackOrigin(requestHeaders("http://app-auth-gate-filmatta.vercel.app")), null);
  assert.equal(origin.getAuthCallbackOrigin(requestHeaders(preview, "app.filmatta.com")), null);
  assert.equal(origin.getAuthCallbackOrigin(requestHeaders("https://app-other-filmatta.vercel.app", "app-other-filmatta.vercel.app")), null);
  assert.equal(origin.getAuthCallbackOrigin(new Headers({ origin: preview })), null);
});

test("only fixed feedback codes render; rate-limit internals stay private", () => {
  assert.match(feedback.authFeedbackError("signup_limited"), /temporalmente limitado/);
  assert.equal(feedback.authFeedbackError("over_email_send_rate_limit"), null);
  assert.equal(feedback.authFeedbackMessage("<script>"), null);
  assert.equal(feedback.isEmailRateLimit({ code: "over_email_send_rate_limit" }), true);
  assert.equal(feedback.isEmailRateLimit({ status: 429 }), true);
});

test("public signup preserves Create and uses the exact Preview callback", async () => {
  const calls = [];
  const actions = actionsWith({
    async signUp(args) { calls.push(args); return { data: { session: null }, error: null }; },
  });
  await assert.rejects(actions.signUp(signupForm()), (error) => error.destination === "/login?next=%2Fcreate&message=check_email");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.emailRedirectTo, `${preview}/auth/callback?next=%2Fcreate`);
});

test("signup rate limit maps to a human error without enumerating an address", async () => {
  const actions = actionsWith({
    async signUp() { return { data: { session: null }, error: { code: "over_email_send_rate_limit", status: 429 } }; },
  });
  await assert.rejects(actions.signUp(signupForm()), (error) => error.destination === "/registro?next=%2Fcreate&error=signup_limited");
});

test("invalid signup inputs never call Supabase", async () => {
  let calls = 0;
  const actions = actionsWith({ async signUp() { calls++; return { data: {}, error: null }; } });
  await assert.rejects(actions.signUp(signupForm("bad-email")), (error) => error.destination === "/registro?next=%2Fcreate&error=signup_invalid");
  assert.equal(calls, 0);
});

test("recovery uses a safe nested reset callback and maps email throttling", async () => {
  const calls = [];
  const account = load("app/cuenta/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/headers": { async headers() { return requestHeaders(); } },
    "next/navigation": { redirect },
    "@/lib/auth/safe-next-path": safeNext,
    "@/lib/auth/callback-origin": origin,
    "@/lib/auth/feedback": feedback,
    "@/lib/security/auth-rate-limit": { async allowAuthAttempt() { return true; } },
    "@/lib/supabase/server": { async createClient() { return { auth: {
      async resetPasswordForEmail(...args) { calls.push(args); return { error: { code: "over_email_send_rate_limit", status: 429 } }; },
    } }; } },
  });
  const form = new FormData();
  form.set("email", "new@example.com");
  form.set("next", "/create");
  await assert.rejects(account.requestPasswordReset(form), (error) => error.destination === "/recuperar-contrasena?next=%2Fcreate&error=recovery_limited");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].redirectTo, `${preview}/auth/callback?next=%2Frestablecer-contrasena%3Fnext%3D%252Fcreate`);
});
