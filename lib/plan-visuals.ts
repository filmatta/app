export type PlanVisualId = "free" | "plus" | "pro" | "business";

export const planVisuals = {
  free: {
    badgeClassName: "border-white/10 bg-white/10 text-white/60",
    panelClassName: "border-white/10 bg-white/[0.035]",
    accentClassName: "text-white/55",
  },
  plus: {
    badgeClassName:
      "border-emerald-400/25 bg-emerald-400/15 text-emerald-200",
    panelClassName: "border-emerald-400/25 bg-emerald-400/[0.055]",
    accentClassName: "text-emerald-200",
  },
  pro: {
    badgeClassName: "border-amber-400/25 bg-amber-400/15 text-amber-200",
    panelClassName: "border-amber-400/25 bg-amber-400/[0.055]",
    accentClassName: "text-amber-200",
  },
  business: {
    badgeClassName: "border-blue-400/25 bg-blue-400/15 text-blue-200",
    panelClassName: "border-blue-400/25 bg-blue-400/[0.055]",
    accentClassName: "text-blue-200",
  },
} as const satisfies Record<
  PlanVisualId,
  {
    badgeClassName: string;
    panelClassName: string;
    accentClassName: string;
  }
>;

export function getPlanVisual(plan: PlanVisualId) {
  return planVisuals[plan];
}
