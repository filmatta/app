import type { BillingPlan } from "./policy";
import { isBillingPlan } from "./policy";

export type AdminGrantDuration = "7d" | "30d" | "90d" | "none";

const durationDays: Record<Exclude<AdminGrantDuration, "none">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function parseAdminGrantPlan(value: FormDataEntryValue | null): BillingPlan {
  if (!isBillingPlan(value)) throw new Error("Plan de acceso no válido");
  return value;
}

export function parseAdminGrantDuration(
  value: FormDataEntryValue | null
): AdminGrantDuration {
  if (value === "7d" || value === "30d" || value === "90d" || value === "none") {
    return value;
  }
  throw new Error("Duración de acceso no válida");
}

export function getAdminGrantExpiresAt(
  duration: AdminGrantDuration,
  now = new Date()
): string | null {
  if (duration === "none") return null;
  return new Date(
    now.getTime() + durationDays[duration] * 24 * 60 * 60 * 1000
  ).toISOString();
}

export function parseAdminGrantReason(value: FormDataEntryValue | null) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length > 500) throw new Error("El motivo no puede superar 500 caracteres");
  return reason || null;
}
