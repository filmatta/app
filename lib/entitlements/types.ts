export const PLAN_CODES = [
  "free",
  "starter",
  "plus",
  "pro",
  "pro_plus",
] as const;

export type PlanCode = (typeof PLAN_CODES)[number];
export type CommercialPlanCode = Exclude<PlanCode, "free">;
export type LegacyPlanCode = PlanCode | "business";

export type EntitlementValue = {
  access?: boolean;
  allowance?: number;
  unlimited?: boolean;
  unit?: string;
  fairUse?: boolean;
};

export type EntitlementReason =
  | "ALLOWED"
  | "PLAN_LOCKED"
  | "ALLOWANCE_EXHAUSTED"
  | "AI_CREDITS_EXHAUSTED"
  | "STORAGE_LIMIT"
  | "UNAVAILABLE"
  | "UNKNOWN_ENTITLEMENT";

export type PlanResolutionStatus = "resolved" | "unavailable";

export type EffectivePlanSource =
  | "baseline"
  | "admin"
  | "test"
  | "promo"
  | "migration"
  | "future_billing"
  | "billing"
  | "fail_safe";

export type EffectivePlanContext = {
  plan: PlanCode;
  status: PlanResolutionStatus;
  source: EffectivePlanSource;
  billingPlan: "plus" | "pro" | null;
  grantPlan: PlanCode | null;
  grantExpiresAt: string | null;
};

export type EntitlementUsage = {
  used: number;
  periodStartsAt: string | null;
  periodEndsAt: string | null;
};

export type EntitlementCheck = {
  entitlement: string;
  allowed: boolean;
  currentPlan: PlanCode;
  requiredPlan: PlanCode | null;
  reason: EntitlementReason;
  allowance: number | null;
  unlimited: boolean;
  usage: number;
  remaining: number | null;
  unit: string | null;
};

export type PlanDefinition = {
  code: PlanCode;
  label: string;
  audience: string;
  description: string;
  currentPriceMxn: number;
  sortOrder: number;
  active: boolean;
  badgeVariant: Exclude<PlanCode, "free"> | "baseline";
  features: readonly string[];
};

export type EntitlementDefinition = {
  key: string;
  name: string;
  description: string;
  minimumPlan: PlanCode;
  upgradeTitle: string;
  upgradeDescription: string;
  values: Partial<Record<PlanCode, EntitlementValue>>;
};
