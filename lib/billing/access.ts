import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { billingAccessConfig, billingEnabled } from "./config";
import type { EffectiveBillingAccess } from "./effective-plan";
import { isBillingPlan } from "./policy";

const emptyAccess: EffectiveBillingAccess = {
  regularAccess: false,
  plan: null,
  stripePlan: null,
  adminGrantPlan: null,
  adminGrantExpiresAt: null,
  source: null,
};

type BillingAccessRow = {
  effective_plan: unknown;
  stripe_plan: unknown;
  admin_grant_plan: unknown;
  admin_grant_expires_at: unknown;
  access_source: unknown;
};

export const getBillingAccess = cache(async () => {
  if (!billingEnabled()) return emptyAccess;
  try {
    billingAccessConfig();
    const supabase = await createClient();
    // Both RPCs derive identity from auth.uid(); no caller-supplied user ID.
    const detailed = await supabase.rpc("get_my_billing_access");
    if (!detailed.error) {
      const row = (Array.isArray(detailed.data)
        ? detailed.data[0]
        : detailed.data) as BillingAccessRow | null;
      if (!row) return emptyAccess;

      const plan = isBillingPlan(row.effective_plan) ? row.effective_plan : null;
      const stripePlan = isBillingPlan(row.stripe_plan) ? row.stripe_plan : null;
      const adminGrantPlan = isBillingPlan(row.admin_grant_plan)
        ? row.admin_grant_plan
        : null;
      const source = ["stripe", "admin_grant", "both"].includes(
        String(row.access_source)
      )
        ? (row.access_source as EffectiveBillingAccess["source"])
        : null;

      return {
        regularAccess: plan !== null,
        plan,
        stripePlan,
        adminGrantPlan,
        adminGrantExpiresAt:
          typeof row.admin_grant_expires_at === "string"
            ? row.admin_grant_expires_at
            : null,
        source,
      };
    }

    // Keep Preview functional until the additive migration is applied manually.
    if (!isMissingDetailedAccessRpc(detailed.error)) throw detailed.error;
    const legacy = await supabase.rpc("get_my_billing_plan");
    if (legacy.error) throw legacy.error;
    if (!isBillingPlan(legacy.data)) return emptyAccess;
    return {
      ...emptyAccess,
      regularAccess: true,
      plan: legacy.data,
      stripePlan: legacy.data,
      source: "stripe" as const,
    };
  } catch {
    console.error("Billing access unavailable; premium access denied");
    return emptyAccess;
  }
});

function isMissingDetailedAccessRpc(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.message?.includes("get_my_billing_access") === true
  );
}
