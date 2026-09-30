import {
  ENTITLEMENT_DEFINITIONS,
  getEntitlementDefinition,
} from "./catalog";
import type {
  EntitlementCheck,
  EntitlementDefinition,
  EntitlementReason,
  EntitlementUsage,
  EntitlementValue,
  LegacyPlanCode,
  PlanCode,
} from "./types";

export const PLAN_HIERARCHY: readonly PlanCode[] = [
  "free",
  "starter",
  "plus",
  "pro",
  "pro_plus",
];

export function isPlanCode(value: unknown): value is PlanCode {
  return PLAN_HIERARCHY.includes(value as PlanCode);
}

export function normalizePlanCode(value: unknown): PlanCode | null {
  if (value === "business") return "pro_plus";
  return isPlanCode(value) ? value : null;
}

export function getPlanRank(plan: LegacyPlanCode) {
  const normalized = normalizePlanCode(plan);
  return normalized ? PLAN_HIERARCHY.indexOf(normalized) : -1;
}

export function planIncludes(currentPlan: PlanCode, requiredPlan: PlanCode) {
  return getPlanRank(currentPlan) >= getPlanRank(requiredPlan);
}

export function resolveEntitlementValue(
  plan: PlanCode,
  definition: EntitlementDefinition
): EntitlementValue | null {
  const currentRank = getPlanRank(plan);
  let resolved: EntitlementValue | null = null;

  for (const candidate of PLAN_HIERARCHY) {
    if (getPlanRank(candidate) > currentRank) break;
    const override = definition.values[candidate];
    if (override) resolved = { ...(resolved ?? {}), ...override };
  }

  return resolved;
}

export function resolveEntitlementCheck({
  plan,
  entitlement,
  usage = emptyUsage,
  available = true,
}: {
  plan: PlanCode;
  entitlement: string;
  usage?: EntitlementUsage;
  available?: boolean;
}): EntitlementCheck {
  const definition = getEntitlementDefinition(entitlement);

  if (!available) {
    return denied(entitlement, plan, definition?.minimumPlan ?? null, "UNAVAILABLE");
  }

  if (!definition) {
    return denied(entitlement, plan, null, "UNKNOWN_ENTITLEMENT");
  }

  const value = resolveEntitlementValue(plan, definition);
  const allowance = value?.allowance ?? null;
  const unlimited = value?.unlimited === true;
  const hasBooleanAccess = value?.access === true;
  const hasAllowanceAccess = unlimited || (allowance !== null && allowance > 0);

  if (!hasBooleanAccess && !hasAllowanceAccess) {
    return denied(entitlement, plan, definition.minimumPlan, "PLAN_LOCKED", {
      allowance,
      unlimited,
      usage: usage.used,
      unit: value?.unit ?? null,
    });
  }

  if (!unlimited && allowance !== null && usage.used >= allowance) {
    const reason = exhaustedReason(entitlement, value?.unit);
    return denied(entitlement, plan, definition.minimumPlan, reason, {
      allowance,
      unlimited,
      usage: usage.used,
      unit: value?.unit ?? null,
    });
  }

  return {
    entitlement,
    allowed: true,
    currentPlan: plan,
    requiredPlan: definition.minimumPlan,
    reason: "ALLOWED",
    allowance,
    unlimited,
    usage: usage.used,
    remaining:
      unlimited || allowance === null
        ? null
        : Math.max(allowance - usage.used, 0),
    unit: value?.unit ?? null,
  };
}

export function getRequiredPlan(entitlement: string) {
  return getEntitlementDefinition(entitlement)?.minimumPlan ?? null;
}

export function listEntitlements() {
  return Object.values(ENTITLEMENT_DEFINITIONS);
}

const emptyUsage: EntitlementUsage = {
  used: 0,
  periodStartsAt: null,
  periodEndsAt: null,
};

function exhaustedReason(
  entitlement: string,
  unit?: string
): EntitlementReason {
  if (entitlement === "writer.ai_credits" || unit === "AI Credits") {
    return "AI_CREDITS_EXHAUSTED";
  }
  if (
    entitlement.startsWith("profiles.") &&
    ["fotos", "videos", "reels", "MB", "GB"].includes(unit ?? "")
  ) {
    return "STORAGE_LIMIT";
  }
  return "ALLOWANCE_EXHAUSTED";
}

function denied(
  entitlement: string,
  plan: PlanCode,
  requiredPlan: PlanCode | null,
  reason: EntitlementReason,
  details: {
    allowance?: number | null;
    unlimited?: boolean;
    usage?: number;
    unit?: string | null;
  } = {}
): EntitlementCheck {
  const allowance = details.allowance ?? null;
  const usage = details.usage ?? 0;

  return {
    entitlement,
    allowed: false,
    currentPlan: plan,
    requiredPlan,
    reason,
    allowance,
    unlimited: details.unlimited ?? false,
    usage,
    remaining:
      allowance === null ? null : Math.max(allowance - usage, 0),
    unit: details.unit ?? null,
  };
}
