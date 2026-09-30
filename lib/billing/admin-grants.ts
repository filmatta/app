import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanCode } from "@/lib/entitlements/types";
import type { BillingPlan } from "./policy";
import {
  resolveEffectiveBillingAccess,
  type AdminGrantCandidate,
} from "./effective-plan";

export type AdminPlanGrant = AdminGrantCandidate & {
  id: string;
  userId: string;
  reason: string | null;
  grantedBy: string;
  source: "admin" | "test" | "promo" | "migration" | "future_billing";
  status: "active" | "revoked";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AdminGrantUser = {
  id: string;
  email: string | null;
};

export async function findAdminGrantUser(
  identifier: string
): Promise<AdminGrantUser | null> {
  const value = identifier.trim();
  if (!value || value.length > 320) return null;

  const admin = createAdminClient();
  if (isUuid(value)) {
    const { data, error } = await admin.auth.admin.getUserById(value);
    if (error) {
      if (error.status === 404) return null;
      throw error;
    }
    return toAdminGrantUser(data.user);
  }

  const email = value.toLocaleLowerCase("en-US");
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find(
      (user) => user.email?.toLocaleLowerCase("en-US") === email
    );
    if (match) return toAdminGrantUser(match);
    if (data.users.length < perPage) return null;
  }
}

export async function getAdminGrantContext(identifier: string) {
  const user = await findAdminGrantUser(identifier);
  if (!user) return null;

  const evaluatedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { data: customer, error: customerError } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (customerError) throw customerError;

  let stripePlan: BillingPlan | null = null;
  if (customer?.stripe_customer_id) {
    const { data: entitlements, error: entitlementError } = await admin
      .from("billing_entitlements")
      .select("plan, valid_until")
      .eq("stripe_customer_id", customer.stripe_customer_id)
      .gt("valid_until", evaluatedAt);
    if (entitlementError) throw entitlementError;
    stripePlan = highestPlanFromRows(entitlements ?? []);
  }

  const { data: grantRows, error: grantsError } = await admin
    .from("admin_plan_grants")
    .select(
      "id, user_id, plan, starts_at, expires_at, revoked_at, reason, granted_by, source, status, metadata, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (grantsError) throw grantsError;

  const grants = (grantRows ?? []).map(toAdminPlanGrant);
  const access = resolveEffectiveBillingAccess({
    stripePlan,
    grants,
    now: new Date(evaluatedAt),
  });

  return { user, grants, access, evaluatedAt };
}

export async function insertAdminPlanGrant(input: {
  targetIdentifier: string;
  plan: PlanCode;
  expiresAt: string | null;
  reason: string | null;
  grantedBy: string;
  source: "admin" | "test";
}) {
  const user = await findAdminGrantUser(input.targetIdentifier);
  if (!user) throw new Error("Usuario no encontrado");
  if (input.expiresAt && Date.parse(input.expiresAt) <= Date.now()) {
    throw new Error("La expiración debe ser futura");
  }

  const admin = createAdminClient();
  const grantedAt = new Date().toISOString();
  const { data: inserted, error } = await admin
    .from("admin_plan_grants")
    .insert({
      user_id: user.id,
      plan: input.plan,
      expires_at: input.expiresAt,
      reason: input.reason,
      granted_by: input.grantedBy,
      source: input.source,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;

  // A manual assignment represents the complete simulated plan state. Insert
  // first so a partial failure cannot silently remove the user's prior access.
  const { error: revokePreviousError } = await admin
    .from("admin_plan_grants")
    .update({ revoked_at: grantedAt, status: "revoked" })
    .eq("user_id", user.id)
    .neq("id", inserted.id)
    .is("revoked_at", null);
  if (revokePreviousError) throw revokePreviousError;
  return user;
}

export async function revokeAdminPlanGrant(input: {
  targetIdentifier: string;
  grantId: string;
}) {
  const user = await findAdminGrantUser(input.targetIdentifier);
  if (!user) throw new Error("Usuario no encontrado");
  if (!isUuid(input.grantId)) throw new Error("Grant no válido");

  const admin = createAdminClient();
  const { data: grant, error: readError } = await admin
    .from("admin_plan_grants")
    .select("id, user_id, revoked_at, status")
    .eq("id", input.grantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!grant) throw new Error("Grant no encontrado");
  if (grant.revoked_at) return user;

  const { error: updateError } = await admin
    .from("admin_plan_grants")
    .update({ revoked_at: new Date().toISOString(), status: "revoked" })
    .eq("id", grant.id)
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (updateError) throw updateError;
  return user;
}

function toAdminGrantUser(user: User | null): AdminGrantUser | null {
  return user ? { id: user.id, email: user.email ?? null } : null;
}

function toAdminPlanGrant(row: Record<string, unknown>): AdminPlanGrant {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    plan: (row.plan === "business" ? "pro_plus" : row.plan) as PlanCode,
    startsAt: String(row.starts_at),
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
    reason: typeof row.reason === "string" ? row.reason : null,
    grantedBy: String(row.granted_by),
    source: isGrantSource(row.source) ? row.source : "admin",
    status: row.status === "revoked" ? "revoked" : "active",
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function highestPlanFromRows(rows: Array<{ plan: unknown }>): BillingPlan | null {
  if (rows.some((row) => row.plan === "pro")) return "pro";
  if (rows.some((row) => row.plan === "plus")) return "plus";
  return null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isGrantSource(
  value: unknown
): value is AdminPlanGrant["source"] {
  return ["admin", "test", "promo", "migration", "future_billing"].includes(
    String(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
