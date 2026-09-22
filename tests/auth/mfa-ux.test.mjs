import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import load from "../load.mjs";

const mfa = load("lib/auth/mfa-state.ts");

function snapshot({ factors = [], currentLevel = "aal1", nextLevel = "aal1", available = true } = {}) {
  return { available, factors, currentLevel, nextLevel };
}

test("MFA UI distinguishes no factor, enrollment, pending, challenge and active", () => {
  assert.equal(mfa.getMfaViewState(snapshot()), "not-configured");
  assert.equal(mfa.getMfaViewState(snapshot(), true), "enrolling");
  assert.equal(
    mfa.getMfaViewState(snapshot({ factors: [{ id: "pending", name: "App", status: "unverified" }] })),
    "pending",
  );
  assert.equal(
    mfa.getMfaViewState(snapshot({
      factors: [{ id: "verified", name: "App", status: "verified" }],
      currentLevel: "aal1",
      nextLevel: "aal2",
    })),
    "challenge",
  );
  assert.equal(
    mfa.getMfaViewState(snapshot({
      factors: [{ id: "verified", name: "App", status: "verified" }],
      currentLevel: "aal2",
      nextLevel: "aal2",
    })),
    "active",
  );
  assert.equal(mfa.getMfaViewState(snapshot({ available: false })), "unavailable");
});

test("a page refresh derives pending or active state from Supabase instead of local state", () => {
  const pending = mfa.buildMfaSnapshot(
    { data: { all: [{ id: "one", factor_type: "totp", status: "unverified" }] }, error: null },
    { data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null },
  );
  assert.equal(mfa.getMfaViewState(pending), "pending");

  const active = mfa.buildMfaSnapshot(
    { data: { all: [{ id: "one", factor_type: "totp", status: "verified" }] }, error: null },
    { data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null },
  );
  assert.equal(mfa.getMfaViewState(active), "active");
});

test("logout and password login return a verified factor to challenge state", () => {
  const afterLogin = snapshot({
    factors: [{ id: "verified", name: "App", status: "verified" }],
    currentLevel: "aal1",
    nextLevel: "aal2",
  });
  assert.equal(mfa.getMfaViewState(afterLogin), "challenge");
});

test("refresh preserves the unverified factor currently being enrolled", () => {
  const enrolling = snapshot({
    factors: [{ id: "new-factor", name: "App", status: "unverified" }],
  });
  assert.equal(mfa.getMfaFactorSelection(enrolling, "new-factor"), "new-factor");
  assert.equal(mfa.getMfaFactorSelection(enrolling, "missing"), "");
});

test("the official Supabase SVG is preserved and wrapped safely when needed", () => {
  const dataUri = "data:image/svg+xml;utf-8,%3Csvg%3E%3C/svg%3E";
  assert.equal(mfa.getMfaQrImageSource(dataUri), dataUri);
  assert.match(mfa.getMfaQrImageSource("<svg><path/></svg>"), /^data:image\/svg\+xml/);
  assert.equal(mfa.getMfaQrImageSource("javascript:alert(1)"), null);
});

test("invalid OTP never starts a challenge", async () => {
  let challenged = false;
  const result = await mfa.verifyMfaChallenge(
    "factor",
    "12ab",
    async () => { challenged = true; return { data: { id: "challenge" }, error: null }; },
    async () => ({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid-code");
  assert.equal(challenged, false);
});

test("expired challenge receives a specific recoverable error", async () => {
  const result = await mfa.verifyMfaChallenge(
    "factor",
    "123456",
    async () => ({ error: { code: "mfa_challenge_expired" } }),
    async () => ({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "expired-challenge");
  assert.match(mfa.getMfaVerificationMessage(result.reason), /expiró/);
});

test("successful browser challenge-and-verify confirms AAL2", async () => {
  const calls = [];
  const result = await mfa.verifyMfaChallenge(
    "factor",
    "123456",
    async ({ factorId, code }) => {
      calls.push(`challenge-and-verify:${factorId}:${code}`);
      return { error: null };
    },
    async () => {
      calls.push("assurance");
      return { data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null };
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.currentLevel, "aal2");
  assert.equal(calls.join("|"), "challenge-and-verify:factor:123456|assurance");
});

test("accepted OTP still fails closed when the refreshed session is not AAL2", async () => {
  const result = await mfa.verifyMfaChallenge(
    "factor",
    "123456",
    async () => ({ error: null }),
    async () => ({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "session-not-aal2");
});

test("Cuenta and Admin use the same live MFA manager without role-gating normal users", () => {
  const account = fs.readFileSync("app/cuenta/configuracion/page.tsx", "utf8");
  const admin = fs.readFileSync("app/verificar-admin/page.tsx", "utf8");
  const manager = fs.readFileSync("components/auth/MfaTotpManager.tsx", "utf8");

  assert.match(account, /buildMfaSnapshot\(mfaFactors, mfaAssurance\)/);
  assert.match(account, /<MfaTotpManager initialSnapshot=\{mfaSnapshot\}/);
  assert.doesNotMatch(account, /requireAdmin\(/);
  assert.match(admin, /<MfaTotpManager next=\{next\}/);
  assert.match(manager, /result\.data\.totp\.qr_code/);
  assert.match(manager, /rounded-xl bg-white p-4/);
  assert.match(manager, /supabase\.auth\.mfa\.challengeAndVerify\(params\)/);
  assert.doesNotMatch(manager, /console\.(?:log|info|warn|error)/);
});
