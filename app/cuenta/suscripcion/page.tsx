import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { getBillingAccess } from "@/lib/billing/access";
import { billingEnabled, billingMode } from "@/lib/billing/config";
import { createClient } from "@/lib/supabase/server";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import {
  cancelSubscriptionViaPortal,
  openBillingPortal,
  startCheckout,
} from "./actions";
import LoadingButton from "@/components/ui/LoadingButton";
import { getMyScheduledCancellation } from "@/lib/billing/cancellation";
import { formatBillingEffectiveDate } from "@/lib/billing/return-presentation";

export default async function SubscriptionPage({ searchParams }: {
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fcuenta%2Fsuscripcion");
  const feedback = await searchParams;
  const enabled = billingEnabled();
  const mode = billingMode();
  const access = await getBillingAccess();
  let cancellationEffectiveAt: string | null = null;
  if (enabled && access.stripePlan) {
    try {
      const cancellation = await getMyScheduledCancellation(viewer.id);
      if (cancellation.plan === access.stripePlan && cancellation.isCancellationScheduled) {
        cancellationEffectiveAt = cancellation.cancellationEffectiveAt;
      }
    } catch (error) {
      console.error("Unable to read the scheduled cancellation", error);
    }
  }
  const db = await createClient();
  const [result, invoiceResult] = enabled
    ? await Promise.all([
        db
          .from("billing_subscriptions")
          .select("plan, status, current_period_end, cancel_at_period_end, updated_at")
          .order("updated_at", { ascending: false }),
        db
          .from("billing_invoices")
          .select("status, updated_at")
          .eq("status", "open")
          .limit(1)
          .maybeSingle(),
      ])
    : [{ data: [], error: null }, { data: null, error: null }];
  const subscriptions = result.data ?? [];
  const hasSubscription = subscriptions.some((s) => !["canceled", "incomplete_expired"].includes(s.status));
  const hasStripeSubscription = Boolean(access.stripePlan) || hasSubscription;
  const ready = enabled && !result.error && process.env.BILLING_MX_CHECKOUT_VERIFIED === "true";
  const portalConfigured = Boolean(process.env.STRIPE_ADMIN_PORTAL_CONFIGURATION_ID);
  const hasPaymentIssue =
    subscriptions.some((subscription) =>
      ["past_due", "unpaid", "incomplete"].includes(subscription.status)
    ) || invoiceResult.data?.status === "open";
  return <main className="min-h-screen bg-[#080808] px-6 py-12 text-white">
    <div className="mx-auto max-w-3xl">
      <Link href="/cuenta#pagos" className="text-sm text-white/60 hover:text-white">← Cuenta</Link>
      <h1 className="mt-8 text-4xl font-semibold">Tu suscripción</h1>
      {mode === "test" ? <div role="status" className="mt-5 rounded-xl border border-amber-300/35 bg-amber-300/10 px-4 py-3 text-amber-100">
        <p className="text-sm font-semibold tracking-[0.16em]">STRIPE TEST MODE</p>
        <p className="mt-1 text-sm text-amber-100/75">Checkout de prueba. Usa únicamente tarjetas de prueba de Stripe.</p>
      </div> : !enabled ? <p className="mt-4 text-white/60">Las suscripciones estarán disponibles próximamente.</p> : null}
      <p className="mt-6">Acceso actual: FILMATTA {access.plan === "pro" ? "Pro" : access.plan === "plus" ? "Plus" : "Free"}</p>
      {access.source === "admin_grant" && access.plan && <div role="status" className="mt-5 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-4 text-sm leading-6 text-white/65">
        <p className="font-semibold text-white/80">Acceso otorgado por FILMATTA</p>
        <p>Tu acceso actual no corresponde a una suscripción ni a un cobro de Stripe.</p>
        {access.adminGrantExpiresAt && <p>Disponible hasta el {formatBillingEffectiveDate(access.adminGrantExpiresAt)}.</p>}
      </div>}
      {hasPaymentIssue && <div role="alert" className="mt-5 rounded-xl border border-red-200/25 bg-red-200/[0.06] px-4 py-4 text-red-100">
        <p className="font-semibold">Hay un problema con tu pago.</p>
        <p className="mt-2 text-sm leading-6 text-red-100/75">
          {access.plan
            ? "No pudimos procesar la renovación de tu suscripción. Actualiza tu método de pago para evitar perder el acceso."
            : "No pudimos procesar la renovación de tu suscripción. Tu acceso pagado está suspendido. Actualiza tu método de pago para recuperarlo."}
        </p>
        <form action={openBillingPortal} className="mt-4">
          <LoadingButton type="submit" loadingText="Abriendo…" disabled={!portalConfigured} className="rounded-full border border-red-100/25 px-5 py-2.5 text-sm font-semibold text-red-50 disabled:opacity-40">
            Actualizar método de pago
          </LoadingButton>
        </form>
      </div>}
      {access.stripePlan && cancellationEffectiveAt && <p role="status" className="mt-5 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-sm leading-6 text-amber-100/80">Tu suscripción se cancelará el {formatBillingEffectiveDate(cancellationEffectiveAt)}. Seguirás teniendo acceso a FILMATTA {access.stripePlan === "plus" ? "Plus" : "Pro"} por esa suscripción hasta esa fecha.</p>}
      {feedback.checkout === "returned" && <p role="status" className="mt-5 text-amber-200">Recibimos tu regreso de Checkout. El acceso se actualizará cuando Stripe confirme el pago. <Link href="/cuenta/suscripcion" className="underline">Consultar estado</Link></p>}
      {feedback.checkout === "canceled" && <p role="status" className="mt-5 text-white/60">Saliste de Checkout. No se activó una suscripción desde esta página.</p>}
      {(feedback.error || result.error || invoiceResult.error) && <p role="alert" className="mt-5 text-red-200">No pudimos completar la operación. Revisa tu suscripción existente o intenta más tarde. Las suscripciones están limitadas a México.</p>}
      {subscriptions.map((s, index) => <div key={`${s.plan}:${s.updated_at}:${index}`} className="mt-5 rounded-xl border border-white/10 p-5">
        <p>FILMATTA {s.plan === "pro" ? "Pro" : s.plan === "plus" ? "Plus" : "Plan sin reconocer"} · {subscriptionLabel(s.status)}</p>
        {s.current_period_end && <p className="mt-2 text-sm text-white/50">{s.cancel_at_period_end || (s.plan === access.stripePlan && cancellationEffectiveAt) ? "Cancelación programada" : "Fin del periodo"}: {new Date(s.plan === access.stripePlan && cancellationEffectiveAt ? cancellationEffectiveAt : s.current_period_end).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</p>}
      </div>)}
      {enabled && !hasStripeSubscription && <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {(["plus", "pro"] as const).map((plan) => <form action={startCheckout} key={plan} className="rounded-2xl border border-white/15 p-6">
          <h2 className="text-xl font-semibold">FILMATTA {plan === "plus" ? "Plus" : "Pro"}</h2>
          <p className="mt-3">${FILMATTA_PLAN_PRICES[plan]} MXN / mes · IVA incluido</p>
          <p className="mt-3 text-sm text-white/60">Cursos y guías regulares de Learn. Las especialidades no están incluidas. Las demás funciones del plan siguen en desarrollo.</p>
          <input type="hidden" name="plan" value={plan} />
          <label className="mt-5 block text-sm">País de facturación<select name="country" required className="mt-2 block w-full rounded border border-white/20 bg-[#181818] p-2"><option value="MX">México</option></select></label>
          <LoadingButton type="submit" disabled={!ready} loadingText="Abriendo…" className="mt-5 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-40">Comprar {plan === "plus" ? "Plus" : "Pro"}{mode === "test" ? " (TEST)" : ""}</LoadingButton>
        </form>)}
      </div>}
      {enabled && hasStripeSubscription && <form action={openBillingPortal} className="mt-8"><LoadingButton type="submit" loadingText="Abriendo…" disabled={!portalConfigured} className="rounded-full border border-white/20 px-5 py-3 disabled:opacity-40">Ver y cambiar mi plan</LoadingButton></form>}
      {enabled && hasStripeSubscription && access.stripePlan && !cancellationEffectiveAt && <form action={cancelSubscriptionViaPortal} className="mt-4"><LoadingButton type="submit" loadingText="Abriendo cancelación…" disabled={!portalConfigured} className="rounded-full border border-red-200/20 px-5 py-3 text-sm font-semibold text-red-100/80 transition hover:border-red-200/35 hover:text-red-100 disabled:opacity-40">Cancelar suscripción</LoadingButton></form>}
      {enabled && !ready && <p className="mt-5 text-sm text-white/50">La configuración de Billing está pendiente.</p>}
      <p className="mt-10 text-sm text-white/45">El portal permitirá actualizar métodos de pago y cancelar. Los datos fiscales y la emisión de CFDI estarán disponibles en una etapa posterior.</p>
    </div>
  </main>;
}

function subscriptionLabel(status: string) {
  return ({ active: "Activa", canceled: "Cancelada", past_due: "Pago pendiente", unpaid: "Sin pagar",
    incomplete: "Pago por completar", incomplete_expired: "Pago vencido", trialing: "Periodo de prueba",
    paused: "Pausada" } as Record<string, string>)[status] ?? "En revisión";
}
