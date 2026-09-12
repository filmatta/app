export type BillingPlan = "plus" | "pro";

export function isBillingPlan(value: unknown): value is BillingPlan {
  return value === "plus" || value === "pro";
}

export function testBillingEnabled(env: Record<string, string | undefined>) {
  return env.BILLING_ENABLED === "true" && env.BILLING_MODE === "test" &&
    env.VERCEL_ENV !== "production";
}

export function canReadLesson(input: {
  authenticated: boolean; admin: boolean; published: boolean;
  quickGuide: boolean; enrolled: boolean; preview: boolean; regularAccess: boolean;
}) {
  if (!input.authenticated) return false;
  if (input.admin) return true;
  if (!input.published) return false;
  return input.quickGuide ? input.regularAccess :
    input.enrolled && (input.preview || input.regularAccess);
}

// A paid invoice alone is insufficient: canceled, paused, unpaid, unknown-price,
// foreign-address and reversed payments must never provision Learn.
export function paidAccessUntil(input: {
  status: string; paused: boolean; knownPrice: boolean; country: string | null;
  invoicePaid: boolean; reversed: boolean; periodEnd: number; paidPeriodEnd: number;
}, now = Date.now() / 1000): string | null {
  const end = Math.min(input.periodEnd, input.paidPeriodEnd);
  if (input.status !== "active" || input.paused || !input.knownPrice ||
      input.country !== "MX" || !input.invoicePaid || input.reversed ||
      !Number.isFinite(end) || end <= now) return null;
  return new Date(end * 1000).toISOString();
}
