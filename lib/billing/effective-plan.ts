import type { PlanCode } from "@/lib/entitlements/types";
import { getPlanRank, planIncludes } from "@/lib/entitlements/resolver";
import type { BillingPlan } from "./policy";

export type BillingAccessSource = "stripe" | "admin_grant" | "both" | null;

export type AdminGrantCandidate = {
  plan: PlanCode;
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt?: string;
  status?: "active" | "revoked";
};

export type EffectiveBillingAccess = {
  regularAccess: boolean;
  plan: Exclude<PlanCode, "free"> | null;
  stripePlan: BillingPlan | null;
  adminGrantPlan: PlanCode | null;
  adminGrantExpiresAt: string | null;
  source: BillingAccessSource;
};

export function highestBillingPlan(
  plans: Array<PlanCode | null | undefined>
): PlanCode | null {
  return plans.reduce<PlanCode | null>((highest, plan) => {
    if (!plan) return highest;
    return !highest || getPlanRank(plan) > getPlanRank(highest) ? plan : highest;
  }, null);
}

export function isAdminGrantActive(
  grant: AdminGrantCandidate,
  now = new Date()
) {
  const nowMs = now.getTime();
  const startsAt = Date.parse(grant.startsAt);
  const expiresAt = grant.expiresAt ? Date.parse(grant.expiresAt) : null;

  return (
    Number.isFinite(startsAt) &&
    startsAt <= nowMs &&
    grant.revokedAt === null &&
    grant.status !== "revoked" &&
    (expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > nowMs))
  );
}

// Compatibility adapter for legacy Billing callers. The product resolver rule is
// explicit grant first, then a valid Billing entitlement, then baseline.
export function resolveEffectiveBillingAccess({
  stripePlan,
  grants,
  now = new Date(),
}: {
  stripePlan: BillingPlan | null;
  grants: AdminGrantCandidate[];
  now?: Date;
}): EffectiveBillingAccess {
  const adminGrant =
    grants
      .filter((grant) => isAdminGrantActive(grant, now))
      .sort(compareGrantRecency)[0] ?? null;
  const effectivePlan: PlanCode = adminGrant?.plan ?? stripePlan ?? "free";

  return {
    regularAccess: planIncludes(effectivePlan, "starter"),
    plan: effectivePlan === "free" ? null : effectivePlan,
    stripePlan,
    adminGrantPlan: adminGrant?.plan ?? null,
    adminGrantExpiresAt: adminGrant?.expiresAt ?? null,
    source:
      stripePlan && adminGrant
        ? "both"
        : stripePlan
          ? "stripe"
          : adminGrant
            ? "admin_grant"
            : null,
  };
}

function compareGrantRecency(
  first: AdminGrantCandidate,
  second: AdminGrantCandidate
) {
  const firstTime = Date.parse(first.createdAt ?? first.startsAt);
  const secondTime = Date.parse(second.createdAt ?? second.startsAt);
  if (firstTime !== secondTime) return secondTime - firstTime;
  return getPlanRank(second.plan) - getPlanRank(first.plan);
}
