import "server-only";
import { getBillingAccess } from "@/lib/billing/access";

export type HeaderBillingPlan = "PLUS" | "PRO" | null;

export async function getHeaderBillingPlan(
  authenticated: boolean
): Promise<HeaderBillingPlan> {
  if (!authenticated) return null;

  try {
    const { plan } = await getBillingAccess();

    if (plan === "plus") return "PLUS";
    if (plan === "pro") return "PRO";
    return null;
  } catch {
    return null;
  }
}
