export type PlanVisualId =
  | "free"
  | "starter"
  | "plus"
  | "pro"
  | "pro_plus"
  | "business";

const baseVisuals = {
  free: {
    badgeClassName: "border-white/10 bg-white/10 text-white/60",
    panelClassName: "border-white/10 bg-white/[0.035]",
    accentClassName: "text-white/55",
  },
  starter: {
    badgeClassName: "border-slate-300/20 bg-slate-300/10 text-slate-200",
    panelClassName: "border-slate-300/20 bg-slate-300/[0.035]",
    accentClassName: "text-slate-200",
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
  pro_plus: {
    badgeClassName: "border-blue-400/25 bg-blue-400/15 text-blue-200",
    panelClassName: "border-blue-400/25 bg-blue-400/[0.055]",
    accentClassName: "text-blue-200",
  },
} as const;

export const planVisuals = {
  ...baseVisuals,
  // Presentation-only compatibility. Historical Business UI maps to PRO+.
  business: baseVisuals.pro_plus,
} as const;

export function getPlanVisual(plan: PlanVisualId) {
  return planVisuals[plan];
}
