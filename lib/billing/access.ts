import "server-only";

import { cache } from "react";
import { getEntitlementContext } from "@/lib/entitlements/server";
import { planIncludes } from "@/lib/entitlements/resolver";
import type { EffectiveBillingAccess } from "./effective-plan";

const emptyAccess: EffectiveBillingAccess = {
  regularAccess: false,
  plan: null,
  stripePlan: null,
  adminGrantPlan: null,
  adminGrantExpiresAt: null,
  source: null,
};

// Backwards-compatible Learn/Billing adapter. New product features must use
// checkEntitlement() instead of reading this object directly.
export const getBillingAccess = cache(
  async (): Promise<EffectiveBillingAccess> => {
    const context = await getEntitlementContext();
    if (context.status === "unavailable") return emptyAccess;

    return {
      regularAccess: planIncludes(context.plan, "starter"),
      plan: context.plan === "free" ? null : context.plan,
      stripePlan: context.billingPlan,
      adminGrantPlan: context.grantPlan,
      adminGrantExpiresAt: context.grantExpiresAt,
      source:
        context.billingPlan && context.grantPlan
          ? "both"
          : context.grantPlan
            ? "admin_grant"
            : context.billingPlan
              ? "stripe"
              : null,
    };
  }
);
