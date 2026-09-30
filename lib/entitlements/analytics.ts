export const MONETIZATION_EVENTS = [
  "upgrade_gate_viewed",
  "upgrade_cta_clicked",
  "plan_page_viewed",
  "feature_gate_triggered",
  "allowance_exhausted",
] as const;

export type MonetizationEvent = (typeof MONETIZATION_EVENTS)[number];

export type MonetizationEventDetail = {
  event: MonetizationEvent;
  entitlement?: string;
  currentPlan?: string;
  requiredPlan?: string | null;
  context?: string;
  reason?: string;
};

// Analytics readiness only. No external provider is installed in this phase.
export function emitMonetizationEvent(detail: MonetizationEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<MonetizationEventDetail>("filmatta:monetization", {
      detail,
    })
  );
}
