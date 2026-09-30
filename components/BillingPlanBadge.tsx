import { getHeaderBillingPlan } from "@/lib/billing/header-plan";
import { PlanBadge } from "@/components/entitlements/PlanBadge";
import type { CommercialPlanCode } from "@/lib/entitlements/types";

// Compatibility wrapper used by both headers. The effective product plan is
// resolved server-side; baseline and unauthenticated viewers render nothing.
export default async function BillingPlanBadge({
  authenticated,
}: {
  authenticated: boolean;
}) {
  const plan = await getHeaderBillingPlan(authenticated);
  if (!plan) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span aria-hidden="true" className="text-xs font-medium text-white/25">
        |
      </span>
      <PlanBadge plan={plan} />
    </span>
  );
}

export function BillingPlanBadgeMark({
  plan,
}: {
  plan:
    | CommercialPlanCode
    | "STARTER"
    | "PLUS"
    | "PRO"
    | "PRO+"
    | "BUSINESS";
}) {
  const normalized =
    plan === "BUSINESS" || plan === "PRO+"
      ? "pro_plus"
      : plan === "STARTER"
        ? "starter"
        : plan === "PLUS"
          ? "plus"
          : plan === "PRO"
            ? "pro"
            : plan;
  return <PlanBadge plan={normalized} />;
}
