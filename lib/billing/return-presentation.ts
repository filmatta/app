import type { BillingPlan } from "./policy";

export const BILLING_RETURN_POLL_INTERVAL_MS = 1_500;
export const BILLING_RETURN_TIMEOUT_MS = 15_000;
export const BILLING_RETURN_REDIRECT_DELAY_MS = 2_200;

export type BillingReturnSource = "checkout" | "upgrade" | "unknown";

export type BillingReturnView =
  | { status: "waiting" }
  | {
      status: "confirmed";
      plan: BillingPlan;
      title: string;
      message: string;
    }
  | { status: "timeout" };

export function parseBillingReturnSource(
  source: string | string[] | undefined
): BillingReturnSource {
  if (source === "checkout" || source === "upgrade") return source;
  return "unknown";
}

export function getBillingReturnView({
  source,
  plan,
  timedOut,
}: {
  source: BillingReturnSource;
  plan: BillingPlan | null;
  timedOut: boolean;
}): BillingReturnView {
  const confirmed =
    (source === "checkout" && (plan === "plus" || plan === "pro")) ||
    (source === "upgrade" && plan === "pro");

  if (confirmed && plan) {
    return plan === "plus"
      ? {
          status: "confirmed",
          plan,
          title: "¡Bienvenido a FILMATTA Plus!",
          message:
            "Ya puedes acceder a todos los cursos regulares de FILMATTA Learn.",
        }
      : {
          status: "confirmed",
          plan,
          title: "¡Bienvenido a FILMATTA Pro!",
          message:
            "Tu plan Pro ya está confirmado y tu acceso a los cursos regulares de FILMATTA Learn está activo.",
        };
  }

  return timedOut ? { status: "timeout" } : { status: "waiting" };
}
