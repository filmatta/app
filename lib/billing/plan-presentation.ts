import type { BillingPlan } from "./policy";

export type PlanCardId = "free" | BillingPlan | "business";

export type PlanCardAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "checkout"; label: string; plan: BillingPlan }
  | { kind: "portal"; label: string }
  | { kind: "pro-upgrade"; label: string }
  | { kind: "status"; label: string }
  | { kind: "coming-soon"; label: string };

export function getPlanCardAction({
  planId,
  currentPlan,
  authenticated,
  billingAvailable,
}: {
  planId: PlanCardId;
  currentPlan: BillingPlan | null;
  authenticated: boolean;
  billingAvailable: boolean;
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
    return { kind: "status", label: "Tu plan actual" };
  }

  return {
    kind: effectivePlan === "plus" ? "pro-upgrade" : "portal",
    label:
      effectivePlan === "plus"
        ? "Actualizar a Pro"
        : "Administrar plan",
  };
}
