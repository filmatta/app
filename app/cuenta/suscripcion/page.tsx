import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { getBillingAccess } from "@/lib/billing/access";
import { billingEnabled } from "@/lib/billing/config";
import { createClient } from "@/lib/supabase/server";
import {
  cancelSubscriptionViaPortal,
  openBillingPortal,
} from "./actions";
import LoadingButton from "@/components/ui/LoadingButton";
import { getMyScheduledCancellation } from "@/lib/billing/cancellation";
import { formatBillingEffectiveDate } from "@/lib/billing/return-presentation";
import { PlanBadge } from "@/components/entitlements/PlanBadge";

export default async function SubscriptionPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fcuenta%2Fsuscripcion");
  const feedback = await searchParams;
  const enabled = billingEnabled();
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
  const portalConfigured = Boolean(process.env.STRIPE_ADMIN_PORTAL_CONFIGURATION_ID);
  const hasPaymentIssue =
    subscriptions.some((subscription) =>
      ["past_due", "unpaid", "incomplete"].includes(subscription.status)
    ) || invoiceResult.data?.status === "open";
  return <main className="min-h-screen bg-[#080808] px-6 py-12 text-white">
    <div className="mx-auto max-w-3xl">
      <Link href="/cuenta#pagos" className="text-sm text-white/60 hover:text-white">← Cuenta</Link>
      <h1 className="mt-8 text-4xl font-semibold">Tu plan</h1>
      <div className="mt-6 flex items-center gap-3">
        <span className="text-white/55">Acceso actual</span>
        {access.plan ? <PlanBadge plan={access.plan} size="card" /> : <span className="font-semibold">Baseline</span>}
      </div>
      {access.adminGrantPlan && <div role="status" className="mt-5 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-4 text-sm leading-6 text-white/65">
        <p className="font-semibold text-white/80">Acceso otorgado por FILMATTA</p>
        <p>El grant explícito define tu plan efectivo y no crea un cobro.</p>
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
      {(feedback.error || result.error || invoiceResult.error) && <p role="alert" className="mt-5 text-red-200">No pudimos completar la operación. Revisa tu suscripción existente o intenta más tarde. Las suscripciones están limitadas a México.</p>}
      {subscriptions.map((s, index) => <div key={`${s.plan}:${s.updated_at}:${index}`} className="mt-5 rounded-xl border border-white/10 p-5">
        <p>FILMATTA {s.plan === "pro" ? "Pro" : s.plan === "plus" ? "Plus" : "Plan sin reconocer"} · {subscriptionLabel(s.status)}</p>
        {s.current_period_end && <p className="mt-2 text-sm text-white/50">{s.cancel_at_period_end || (s.plan === access.stripePlan && cancellationEffectiveAt) ? "Cancelación programada" : "Fin del periodo"}: {new Date(s.plan === access.stripePlan && cancellationEffectiveAt ? cancellationEffectiveAt : s.current_period_end).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</p>}
      </div>)}
      {!hasStripeSubscription && <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Compara capacidades</h2>
        <p className="mt-3 text-sm leading-6 text-white/55">Esta fase no inicia checkout ni pagos. Consulta la matriz central de Starter, Plus, Pro y Pro+.</p>
        <Link href="/planes" className="mt-5 inline-flex rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white">Ver planes</Link>
      </div>}
      {enabled && hasStripeSubscription && <form action={openBillingPortal} className="mt-8"><LoadingButton type="submit" loadingText="Abriendo…" disabled={!portalConfigured} className="rounded-full border border-white/20 px-5 py-3 disabled:opacity-40">Ver y cambiar mi plan</LoadingButton></form>}
      {enabled && hasStripeSubscription && access.stripePlan && !cancellationEffectiveAt && <form action={cancelSubscriptionViaPortal} className="mt-4"><LoadingButton type="submit" loadingText="Abriendo cancelación…" disabled={!portalConfigured} className="rounded-full border border-red-200/20 px-5 py-3 text-sm font-semibold text-red-100/80 transition hover:border-red-200/35 hover:text-red-100 disabled:opacity-40">Cancelar suscripción</LoadingButton></form>}
      <p className="mt-10 text-sm text-white/45">La infraestructura histórica de Billing se conserva para usuarios que ya tengan una suscripción. Entitlements Foundation V1 no inicia compras nuevas.</p>
    </div>
  </main>;
}

function subscriptionLabel(status: string) {
  return ({ active: "Activa", canceled: "Cancelada", past_due: "Pago pendiente", unpaid: "Sin pagar",
    incomplete: "Pago por completar", incomplete_expired: "Pago vencido", trialing: "Periodo de prueba",
    paused: "Pausada" } as Record<string, string>)[status] ?? "En revisión";
}
