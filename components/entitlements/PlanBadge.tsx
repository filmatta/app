import { normalizePlanCode } from "@/lib/entitlements/resolver";
import type { LegacyPlanCode, PlanCode } from "@/lib/entitlements/types";
import { getPlanVisual } from "@/lib/plan-visuals";

export function PlanBadge({
  plan,
  size = "navigation",
  showBaseline = false,
  className = "",
}: {
  plan: LegacyPlanCode;
  size?: "navigation" | "feature" | "card";
  showBaseline?: boolean;
  className?: string;
}) {
  const normalized = normalizePlanCode(plan);
  if (!normalized || (normalized === "free" && !showBaseline)) return null;

  const visual = getPlanVisual(normalized);
  const label = planLabel(normalized);
  const sizeClass =
    size === "feature"
      ? "px-1.5 py-0.5 text-[9px] tracking-[0.12em]"
      : size === "card"
        ? "px-3 py-1.5 text-xs tracking-[0.12em]"
        : "px-2 py-0.5 text-[10px] tracking-[0.14em]";

  return (
    <span
      aria-label={`Plan FILMATTA ${label}`}
      className={`inline-flex shrink-0 items-center rounded-full border font-semibold uppercase ${sizeClass} ${visual.badgeClassName} ${className}`}
    >
      {label}
    </span>
  );
}

export function planLabel(plan: PlanCode) {
  if (plan === "pro_plus") return "PRO+";
  if (plan === "free") return "BASELINE";
  return plan.toUpperCase();
}
