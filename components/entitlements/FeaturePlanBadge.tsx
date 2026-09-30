import { PlanBadge } from "./PlanBadge";
import type { CommercialPlanCode } from "@/lib/entitlements/types";

export function FeaturePlanBadge({ plan }: { plan: CommercialPlanCode }) {
  return <PlanBadge plan={plan} size="feature" />;
}
