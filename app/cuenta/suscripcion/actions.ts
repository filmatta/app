"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { isBillingPlan } from "@/lib/billing/policy";
import { createTestCheckout, createTestPortal } from "@/lib/billing/checkout";

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
