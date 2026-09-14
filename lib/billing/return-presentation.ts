import type { BillingPlan } from "./policy";

export const BILLING_RETURN_POLL_INTERVAL_MS = 1_500;
export const BILLING_RETURN_TIMEOUT_MS = 15_000;

export type BillingReturnSource = "checkout" | "upgrade" | "downgrade" | "unknown";

export type BillingReturnView =
  | { status: "waiting" }
  | {
      status: "confirmed";
      plan: BillingPlan;
      title: string;
      message: string;
      effectiveAt?: string;
    }
  | { status: "timeout" };

export function parseBillingReturnSource(
  source: string | string[] | undefined
): BillingReturnSource {
  if (source === "checkout" || source === "upgrade" || source === "downgrade") {
    return source;
  }
  return "unknown";
}

export function getBillingReturnView({
  source,
  plan,
  timedOut,
  downgradeEffectiveAt = null,
}: {
  source: BillingReturnSource;
  plan: BillingPlan | null;
  timedOut: boolean;
  downgradeEffectiveAt?: string | null;
}): BillingReturnView {
  if (source === "downgrade" && plan === "pro" && downgradeEffectiveAt) {
    return {
      status: "confirmed",
      plan: "pro",
      title: "Tu cambio a Plus quedó programado",
      message:
        "Seguirás disfrutando FILMATTA Pro hasta el final de tu periodo actual. Después, tu plan cambiará automáticamente a Plus.",
      effectiveAt: downgradeEffectiveAt,
    };
  }

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

export function formatBillingEffectiveDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}
