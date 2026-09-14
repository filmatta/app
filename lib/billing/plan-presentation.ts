import type { BillingPlan } from "./policy";

export type PlanCardId = "free" | BillingPlan | "business";
export type KeepSubscriptionFeedback = "success" | "error" | null;

export type PlanCardAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "checkout"; label: string; plan: BillingPlan }
  | { kind: "portal"; label: string }
  | { kind: "pro-upgrade"; label: string }
  | { kind: "downgrade"; label: string; href: string }
  | { kind: "scheduled-downgrade"; label: string; effectiveAt: string }
  | {
      kind: "keep-subscription";
      label: string;
      effectiveAt: string;
      error: string | null;
    }
  | { kind: "status"; label: string; feedback?: string }
  | { kind: "coming-soon"; label: string };

export function getPlanCardAction({
  planId,
  currentPlan,
  authenticated,
  billingAvailable,
  scheduledDowngradeAt = null,
  downgradeUnavailable = false,
  cancellationEffectiveAt = null,
  keepSubscriptionFeedback = null,
}: {
  planId: PlanCardId;
  currentPlan: BillingPlan | null;
  authenticated: boolean;
  billingAvailable: boolean;
  scheduledDowngradeAt?: string | null;
  downgradeUnavailable?: boolean;
  cancellationEffectiveAt?: string | null;
  keepSubscriptionFeedback?: KeepSubscriptionFeedback;
}): PlanCardAction {
  const effectivePlan = authenticated ? currentPlan : null;

  if (planId === "business") {
    return { kind: "coming-soon", label: "Próximamente" };
  }

  if (planId === "free") {
    return effectivePlan
      ? { kind: "status", label: "Plan base incluido" }
      : { kind: "link", label: "Explorar cursos", href: "/cursos" };
  }

  if (!billingAvailable) {
    return { kind: "coming-soon", label: "Próximamente" };
  }

  if (!effectivePlan) {
    return {
      kind: "checkout",
      label: planId === "plus" ? "Obtener Plus" : "Obtener Pro",
      plan: planId,
    };
  }

  if (effectivePlan === planId) {
    return cancellationEffectiveAt
      ? {
          kind: "keep-subscription",
          label: "Mantener mi suscripción",
          effectiveAt: cancellationEffectiveAt,
          error:
            keepSubscriptionFeedback === "error"
              ? "No pudimos mantener tu suscripción. Intenta nuevamente."
              : null,
        }
      : {
          kind: "status",
          label: "Tu plan actual",
          ...(keepSubscriptionFeedback === "success"
            ? { feedback: "Tu suscripción continuará activa." }
            : {}),
        };
  }

  if (cancellationEffectiveAt) {
    return { kind: "status", label: "Cancelación programada" };
  }

  if (effectivePlan === "pro" && planId === "plus") {
    if (downgradeUnavailable) {
      return { kind: "status", label: "Cambio no disponible" };
    }
    return scheduledDowngradeAt
      ? {
          kind: "scheduled-downgrade",
          label: "Deshacer cambio",
          effectiveAt: scheduledDowngradeAt,
        }
      : {
          kind: "downgrade",
          label: "Cambiar a Plus",
          href: "/cuenta/suscripcion/cambiar-a-plus",
        };
  }

  return {
    kind: "pro-upgrade",
    label: "Actualizar a Pro",
  };
}
