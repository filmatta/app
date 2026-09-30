import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  COMMERCIAL_PLAN_CODES,
  PLAN_DEFINITIONS,
  getEntitlementDefinition,
} from "./catalog";
import {
  normalizePlanCode,
  resolveEntitlementCheck,
  resolveEntitlementValue,
} from "./resolver";
import type {
  EffectivePlanContext,
  EffectivePlanSource,
  EntitlementCheck,
  EntitlementDefinition,
  EntitlementUsage,
  EntitlementValue,
  PlanCode,
  PlanDefinition,
} from "./types";

type EntitlementContextRow = {
  effective_plan: unknown;
  billing_plan: unknown;
  grant_plan: unknown;
  grant_expires_at: unknown;
  access_source: unknown;
};

type LegacyBillingAccessRow = {
  effective_plan: unknown;
  stripe_plan: unknown;
  admin_grant_plan: unknown;
  admin_grant_expires_at: unknown;
  access_source: unknown;
};

type ConfiguredEntitlementRow = {
  plan_code: unknown;
  access_value: unknown;
  allowance_value: unknown;
  unlimited: unknown;
  allowance_unit: unknown;
  fair_use: unknown;
};

const failSafeContext: EffectivePlanContext = {
  plan: "free",
  status: "unavailable",
  source: "fail_safe",
  billingPlan: null,
  grantPlan: null,
  grantExpiresAt: null,
};

export const getEntitlementContext = cache(
  async (): Promise<EffectivePlanContext> => {
    try {
      const supabase = await createClient();
      const result = await supabase.rpc("get_my_entitlement_context");

      if (!result.error) {
        const row = firstRow(result.data) as EntitlementContextRow | null;
        return row ? parseContextRow(row) : baselineContext();
      }

      if (!isMissingRpc(result.error, "get_my_entitlement_context")) {
        throw result.error;
      }

      // Rolling-deploy compatibility: one public resolver with a temporary read
      // fallback to the previous RPC until the additive migration is applied.
      const legacy = await supabase.rpc("get_my_billing_access");
      if (legacy.error) {
        if (isMissingRpc(legacy.error, "get_my_billing_access")) {
          return baselineContext();
        }
        throw legacy.error;
      }

      const row = firstRow(legacy.data) as LegacyBillingAccessRow | null;
      if (!row) return baselineContext();
      return parseLegacyContextRow(row);
    } catch (error) {
      console.error("Entitlement resolution unavailable; baseline fail-safe applied", error);
      return failSafeContext;
    }
  }
);

export async function getEffectivePlan(): Promise<PlanCode> {
  return (await getEntitlementContext()).plan;
}

export async function checkEntitlement(
  entitlement: string
): Promise<EntitlementCheck> {
  const context = await getEntitlementContext();
  if (context.status === "unavailable") {
    return resolveEntitlementCheck({
      plan: "free",
      entitlement,
      available: false,
    });
  }

  try {
    const definition = await getConfiguredEntitlement(entitlement);
    if (!definition) {
      return resolveEntitlementCheck({ plan: context.plan, entitlement });
    }
    const value = resolveEntitlementValue(context.plan, definition);
    const hasAllowance = value?.allowance !== undefined || value?.unlimited === true;
    const usage = hasAllowance
      ? await readUsage(entitlement)
      : emptyUsage;

    return resolveEntitlementCheck({
      plan: context.plan,
      entitlement,
      usage,
    });
  } catch (error) {
    console.error("Entitlement check unavailable; upgrade UI suppressed", error);
    return resolveEntitlementCheck({
      plan: context.plan,
      entitlement,
      available: false,
    });
  }
}

export async function can(entitlement: string) {
  return (await checkEntitlement(entitlement)).allowed;
}

export async function getAllowance(entitlement: string) {
  const result = await checkEntitlement(entitlement);
  return {
    allowance: result.allowance,
    unlimited: result.unlimited,
    unit: result.unit,
    remaining: result.remaining,
    available: result.reason !== "UNAVAILABLE",
  };
}

export async function getUsage(entitlement: string) {
  try {
    return await readUsage(entitlement);
  } catch (error) {
    console.error("Entitlement usage unavailable", error);
    return null;
  }
}

export const getPlanCatalog = cache(async (): Promise<PlanDefinition[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("subscription_plans")
      .select(
        "code, label, current_price_mxn, sort_order, active, badge_variant, metadata"
      )
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const configured: PlanDefinition[] = [];
    for (const row of data ?? []) {
      const code = normalizePlanCode(row.code);
      if (!code) continue;
      const fallback = PLAN_DEFINITIONS[code];
      const metadata = isRecord(row.metadata) ? row.metadata : {};
      const price = Number(row.current_price_mxn);
      const configuredFeatures =
        Array.isArray(metadata.features) &&
        metadata.features.every((feature) => typeof feature === "string")
          ? (metadata.features as string[])
          : fallback.features;

      configured.push({
        ...fallback,
        label: typeof row.label === "string" ? row.label : fallback.label,
        currentPriceMxn: Number.isFinite(price)
          ? price
          : fallback.currentPriceMxn,
        sortOrder:
          typeof row.sort_order === "number"
            ? row.sort_order
            : fallback.sortOrder,
        active: row.active === true,
        audience:
          typeof metadata.audience === "string"
            ? metadata.audience
            : fallback.audience,
        description:
          typeof metadata.description === "string"
            ? metadata.description
            : fallback.description,
        features: configuredFeatures,
      });
    }

    if (configured.length > 0) return configured;
  } catch (error) {
    console.error("Plan catalog unavailable; bundled presentation used", error);
  }

  return [PLAN_DEFINITIONS.free, ...COMMERCIAL_PLAN_CODES.map((code) => PLAN_DEFINITIONS[code])];
});

async function getConfiguredEntitlement(
  entitlement: string
): Promise<EntitlementDefinition | null> {
  const bundled = getEntitlementDefinition(entitlement);
  if (!bundled) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_entitlements")
    .select(
      "plan_code, access_value, allowance_value, unlimited, allowance_unit, fair_use"
    )
    .eq("entitlement_key", entitlement);

  if (error) {
    if (isMissingRelation(error)) return bundled;
    throw error;
  }

  if (!data || data.length === 0) return bundled;

  const values: Partial<Record<PlanCode, EntitlementValue>> = {};
  for (const rawRow of data as ConfiguredEntitlementRow[]) {
    const plan = normalizePlanCode(rawRow.plan_code);
    if (!plan) continue;
    const allowance =
      rawRow.allowance_value === null
        ? undefined
        : Number(rawRow.allowance_value);
    values[plan] = {
      access:
        typeof rawRow.access_value === "boolean"
          ? rawRow.access_value
          : undefined,
      allowance:
        allowance !== undefined && Number.isFinite(allowance)
          ? allowance
          : undefined,
      unlimited: rawRow.unlimited === true,
      unit:
        typeof rawRow.allowance_unit === "string"
          ? rawRow.allowance_unit
          : undefined,
      fairUse: rawRow.fair_use === true,
    };
  }

  return { ...bundled, values };
}

async function readUsage(entitlement: string): Promise<EntitlementUsage> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("entitlement_usage")
    .select("quantity, period_starts_at, period_ends_at")
    .eq("entitlement_key", entitlement)
    .lte("period_starts_at", now)
    .gt("period_ends_at", now)
    .maybeSingle();

  if (error) throw error;
  if (!data) return emptyUsage;

  const used = Number(data.quantity);
  return {
    used: Number.isFinite(used) && used >= 0 ? used : 0,
    periodStartsAt:
      typeof data.period_starts_at === "string"
        ? data.period_starts_at
        : null,
    periodEndsAt:
      typeof data.period_ends_at === "string" ? data.period_ends_at : null,
  };
}

function parseContextRow(row: EntitlementContextRow): EffectivePlanContext {
  const plan = normalizePlanCode(row.effective_plan) ?? "free";
  const billingPlan = isLegacyBillingPlan(row.billing_plan)
    ? row.billing_plan
    : null;
  const grantPlan = normalizePlanCode(row.grant_plan);
  return {
    plan,
    status: "resolved",
    source: parseSource(row.access_source, plan),
    billingPlan,
    grantPlan,
    grantExpiresAt:
      typeof row.grant_expires_at === "string" ? row.grant_expires_at : null,
  };
}

function parseLegacyContextRow(
  row: LegacyBillingAccessRow
): EffectivePlanContext {
  const plan = normalizePlanCode(row.effective_plan) ?? "free";
  const grantPlan = normalizePlanCode(row.admin_grant_plan);
  return {
    plan,
    status: "resolved",
    source: grantPlan
      ? "admin"
      : isLegacyBillingPlan(row.stripe_plan)
        ? "billing"
        : "baseline",
    billingPlan: isLegacyBillingPlan(row.stripe_plan)
      ? row.stripe_plan
      : null,
    grantPlan,
    grantExpiresAt:
      typeof row.admin_grant_expires_at === "string"
        ? row.admin_grant_expires_at
        : null,
  };
}

function baselineContext(): EffectivePlanContext {
  return {
    plan: "free",
    status: "resolved",
    source: "baseline",
    billingPlan: null,
    grantPlan: null,
    grantExpiresAt: null,
  };
}

function parseSource(value: unknown, plan: PlanCode): EffectivePlanSource {
  if (
    value === "admin" ||
    value === "test" ||
    value === "promo" ||
    value === "migration" ||
    value === "future_billing"
  ) {
    return value;
  }
  if (value === "billing") return "billing";
  return plan === "free" ? "baseline" : "fail_safe";
}

function isLegacyBillingPlan(value: unknown): value is "plus" | "pro" {
  return value === "plus" || value === "pro";
}

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isMissingRpc(
  error: { code?: string; message?: string },
  name: string
) {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.message?.includes(name) === true
  );
}

function isMissingRelation(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("plan_entitlements") === true
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const emptyUsage: EntitlementUsage = {
  used: 0,
  periodStartsAt: null,
  periodEndsAt: null,
};
