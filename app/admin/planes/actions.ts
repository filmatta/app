"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getAdminGrantExpiresAt,
  parseAdminGrantDuration,
  parseAdminGrantPlan,
  parseAdminGrantReason,
} from "@/lib/billing/admin-grant-policy";
import {
  insertAdminPlanGrant,
  revokeAdminPlanGrant,
} from "@/lib/billing/admin-grants";

export async function grantPlanToUser(formData: FormData) {
  const { userId: grantedBy } = await requireAdmin();
  const target = parseTarget(formData.get("target"));
  let destination = `/admin/planes?q=${encodeURIComponent(target)}`;

  try {
    const plan = parseAdminGrantPlan(formData.get("plan"));
    const duration = parseAdminGrantDuration(formData.get("duration"));
    const reason = parseAdminGrantReason(formData.get("reason"));
    const user = await insertAdminPlanGrant({
      targetIdentifier: target,
      plan,
      expiresAt: getAdminGrantExpiresAt(duration),
      reason,
      grantedBy,
    });
    destination = `/admin/planes?q=${encodeURIComponent(user.id)}&success=granted`;
    revalidateGrantViews();
  } catch (error) {
    console.error("Unable to grant an administrative plan", error);
    destination += "&error=grant";
  }

  redirect(destination);
}

export async function revokePlanGrant(formData: FormData) {
  await requireAdmin();
  const target = parseTarget(formData.get("target"));
  const grantId = parseTarget(formData.get("grantId"));
  let destination = `/admin/planes?q=${encodeURIComponent(target)}`;

  try {
    const user = await revokeAdminPlanGrant({
      targetIdentifier: target,
      grantId,
    });
    destination = `/admin/planes?q=${encodeURIComponent(user.id)}&success=revoked`;
    revalidateGrantViews();
  } catch (error) {
    console.error("Unable to revoke an administrative plan", error);
    destination += "&error=revoke";
  }

  redirect(destination);
}

function parseTarget(value: FormDataEntryValue | null) {
  const target = typeof value === "string" ? value.trim() : "";
  if (!target || target.length > 320) throw new Error("Usuario no válido");
  return target;
}

function revalidateGrantViews() {
  revalidatePath("/admin/planes");
  revalidatePath("/planes");
  revalidatePath("/cuenta/suscripcion");
  revalidatePath("/", "layout");
}
