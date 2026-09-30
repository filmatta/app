import "server-only";

import { getEffectivePlan } from "@/lib/entitlements/server";
import type { CommercialPlanCode } from "@/lib/entitlements/types";

export type HeaderBillingPlan = CommercialPlanCode | null;

export async function getHeaderBillingPlan(
  authenticated: boolean
): Promise<HeaderBillingPlan> {
  if (!authenticated) return null;

  try {
    const plan = await getEffectivePlan();
    return plan === "free" ? null : plan;
  } catch {
    return null;
  }
}
