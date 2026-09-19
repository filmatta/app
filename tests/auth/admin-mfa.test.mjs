import assert from "node:assert/strict";
import { test } from "node:test";
import load from "../load.mjs";

for (const [role, level, outcome] of [
  ["user", "aal1", "/"], ["user", "aal2", "/"],
  ["admin", "aal1", "/verificar-admin?next=%2Fadmin"], ["admin", "aal2", null],
]) {
  test(`${role} ${level}: ${outcome ?? "allowed"}`, async () => {
    const supabase = {
      auth: { getClaims: async () => ({ data: { claims: { sub: "actor" } } }),
        mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: level, nextLevel: "aal2" } }) } },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }),
    };
    const { requireAdmin } = load("lib/auth/require-admin.ts", {
      "@/lib/supabase/server": { createClient: async () => supabase },
      "@/lib/auth/safe-next-path": load("lib/auth/safe-next-path.ts"),
      "next/navigation": { redirect: (path) => { throw new Error(path); } },
    });
    if (outcome) await assert.rejects(requireAdmin(), (e) => e.message === outcome);
    else assert.equal((await requireAdmin()).userId, "actor");
  });
}

test("admin grant actions cannot reach privileged code while MFA is required", async () => {
  let privilegedCalls = 0;
  const actions = load("app/admin/planes/actions.ts", {
    "next/navigation": { redirect() {} }, "next/cache": { revalidatePath() {} },
    "@/lib/auth/require-admin": { requireAdmin: async () => { throw new Error("ADMIN_MFA_REQUIRED"); } },
    "@/lib/billing/admin-grant-policy": {},
    "@/lib/billing/admin-grants": { insertAdminPlanGrant: () => privilegedCalls++, revokeAdminPlanGrant: () => privilegedCalls++ },
  });
  await assert.rejects(actions.grantPlanToUser(new FormData()), /ADMIN_MFA_REQUIRED/);
  await assert.rejects(actions.revokePlanGrant(new FormData()), /ADMIN_MFA_REQUIRED/);
  assert.equal(privilegedCalls, 0);
});

test("admin guard fails closed on revoked factors and assurance errors, with a safe return", async () => {
  for (const assurance of [
    { data: { currentLevel: "aal2", nextLevel: "aal1" } },
    { data: null, error: new Error("unavailable") },
  ]) {
    const supabase = {
      auth: { getClaims: async () => ({ data: { claims: { sub: "actor" } } }),
        mfa: { getAuthenticatorAssuranceLevel: async () => assurance } },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: "admin" } }) }) }) }),
    };
    const { requireAdmin } = load("lib/auth/require-admin.ts", {
      "@/lib/supabase/server": { createClient: async () => supabase },
      "@/lib/auth/safe-next-path": load("lib/auth/safe-next-path.ts"),
      "next/navigation": { redirect: path => { throw new Error(path); } },
    });
    await assert.rejects(requireAdmin("//evil.example"), e => e.message === "/verificar-admin?next=%2Fadmin");
  }
});
