import type { BillingPlan } from "./policy";

export type BillingAccessSource = "stripe" | "admin_grant" | "both" | null;

export type AdminGrantCandidate = {
  plan: BillingPlan;
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type EffectiveBillingAccess = {
  regularAccess: boolean;
  plan: BillingPlan | null;
  stripePlan: BillingPlan | null;
  adminGrantPlan: BillingPlan | null;
  adminGrantExpiresAt: string | null;
  source: BillingAccessSource;
};

const planRank: Record<BillingPlan, number> = { plus: 1, pro: 2 };

export function highestBillingPlan(
  plans: Array<BillingPlan | null | undefined>
): BillingPlan | null {
  return plans.reduce<BillingPlan | null>((highest, plan) => {
    if (!plan) return highest;
    return !highest || planRank[plan] > planRank[highest] ? plan : highest;
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
    (expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > nowMs))
  );
}

export function resolveEffectiveBillingAccess({
  stripePlan,
  grants,
  now = new Date(),
}: {
  stripePlan: BillingPlan | null;
  grants: AdminGrantCandidate[];
  now?: Date;
}): EffectiveBillingAccess {
  const activeGrants = grants.filter((grant) => isAdminGrantActive(grant, now));
  const adminGrantPlan = highestBillingPlan(activeGrants.map((grant) => grant.plan));
  const effectivePlan = highestBillingPlan([stripePlan, adminGrantPlan]);
  const matchingGrants = adminGrantPlan
    ? activeGrants.filter((grant) => grant.plan === adminGrantPlan)
    : [];
  const hasUnlimitedGrant = matchingGrants.some((grant) => grant.expiresAt === null);
  const adminGrantExpiresAt = hasUnlimitedGrant
    ? null
    : matchingGrants.reduce<string | null>((latest, grant) => {
        if (!grant.expiresAt) return latest;
        if (!latest || Date.parse(grant.expiresAt) > Date.parse(latest)) {
          return grant.expiresAt;
        }
        return latest;
      }, null);

  return {
    regularAccess: effectivePlan !== null,
    plan: effectivePlan,
    stripePlan,
    adminGrantPlan,
    adminGrantExpiresAt,
    source:
      stripePlan && adminGrantPlan
        ? "both"
        : stripePlan
          ? "stripe"
          : adminGrantPlan
            ? "admin_grant"
            : null,
  };
}
