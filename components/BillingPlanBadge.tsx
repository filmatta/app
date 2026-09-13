import { getHeaderBillingPlan } from "@/lib/billing/header-plan";
import { getPlanVisual } from "@/lib/plan-visuals";

export type BillingPlanBadgeLabel = "PLUS" | "PRO" | "BUSINESS";

export default async function BillingPlanBadge({
  authenticated,
}: {
  authenticated: boolean;
}) {
  const plan = await getHeaderBillingPlan(authenticated);

  if (!plan) return null;

  return <BillingPlanBadgeMark plan={plan} />;
}

export function BillingPlanBadgeMark({
  plan,
}: {
  plan: BillingPlanBadgeLabel;
}) {
  const visualId =
    plan === "PLUS" ? "plus" : plan === "PRO" ? "pro" : "business";
  const visual = getPlanVisual(visualId);

  return (
    <span className="inline-flex shrink-0 items-center gap-2" aria-label={`Plan FILMATTA ${plan}`}>
      <span aria-hidden="true" className="text-xs font-medium text-white/25">
        |
      </span>
      <span
        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] ${visual.badgeClassName}`}
      >
        {plan}
      </span>
    </span>
  );
}
