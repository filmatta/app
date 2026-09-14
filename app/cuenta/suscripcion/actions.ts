"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { keepScheduledSubscription } from "@/lib/billing/cancellation";
import { isBillingPlan } from "@/lib/billing/policy";
import {
  createTestCheckout,
  createTestPortal,
  createTestProUpgradePortal,
} from "@/lib/billing/checkout";
import {
  releaseScheduledDowngrade,
  scheduleDowngradeToPlus as scheduleDowngradeToPlusForUser,
} from "@/lib/billing/subscription-schedule";

export async function startCheckout(form: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fcuenta%2Fsuscripcion");
  const plan = form.get("plan");
  if (!isBillingPlan(plan) || form.get("country") !== "MX") redirect("/cuenta/suscripcion?error=country");
  let url: string;
  try { url = await createTestCheckout(viewer, plan); }
  catch { console.error("Test checkout unavailable"); redirect("/cuenta/suscripcion?error=checkout"); }
  redirect(url);
}

export async function openBillingPortal() {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fcuenta%2Fsuscripcion");
  let url: string;
  try { url = await createTestPortal(viewer.id); }
  catch { console.error("Test portal unavailable"); redirect("/cuenta/suscripcion?error=portal"); }
  redirect(url);
}

export async function upgradeToPro() {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fplanes");
  let url: string;
  try { url = await createTestProUpgradePortal(viewer.id); }
  catch { console.error("Test Pro upgrade unavailable"); redirect("/cuenta/suscripcion?error=portal"); }
  redirect(url);
}

export async function scheduleDowngradeToPlus() {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fcuenta%2Fsuscripcion%2Fcambiar-a-plus");
  try {
    await scheduleDowngradeToPlusForUser(viewer.id);
  } catch (error) {
    console.error("Test Plus downgrade unavailable", error);
    redirect("/cuenta/suscripcion/cambiar-a-plus?error=schedule");
  }
  redirect("/billing/return?source=downgrade");
}

export async function undoDowngradeToPlus() {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fplanes");
  try {
    await releaseScheduledDowngrade(viewer.id);
  } catch (error) {
    console.error("Test Plus downgrade release unavailable", error);
    redirect("/planes?error=downgrade");
  }
  redirect("/planes?downgrade=released");
}

export async function keepSubscription() {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fplanes");
  try {
    await keepScheduledSubscription(viewer.id);
  } catch (error) {
    console.error("Test subscription cancellation removal unavailable", error);
    redirect("/planes?error=keep-subscription");
  }
  revalidatePath("/planes");
  revalidatePath("/cuenta/suscripcion");
  redirect("/planes?subscription=kept");
}
