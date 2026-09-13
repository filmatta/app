import { getHeaderBillingPlan } from "@/lib/billing/header-plan";

export default async function BillingPlanBadge({
  authenticated,
}: {
  authenticated: boolean;
}) {
  const plan = await getHeaderBillingPlan(authenticated);

  if (!plan) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-2" aria-label={`Plan FILMATTA ${plan}`}>
      <span aria-hidden="true" className="text-xs font-medium text-white/25">
        |
      </span>
      <span className="rounded-full border border-white/15 bg-white/[0.045] px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-white/65">
        {plan}
      </span>
    </span>
  );
}
