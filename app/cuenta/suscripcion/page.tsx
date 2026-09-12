import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { getBillingAccess } from "@/lib/billing/access";
import { billingEnabled } from "@/lib/billing/config";
import { createClient } from "@/lib/supabase/server";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import { startCheckout, openBillingPortal } from "./actions";
import LoadingButton from "@/components/ui/LoadingButton";

export default async function SubscriptionPage({ searchParams }: {
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fcuenta%2Fsuscripcion");
  const feedback = await searchParams;
  const enabled = billingEnabled();
  const access = await getBillingAccess();
  const db = await createClient();
  const result = enabled ? await db.from("billing_subscriptions")
    .select("plan, status, current_period_end, cancel_at_period_end, updated_at")
    .order("updated_at", { ascending: false }) : { data: [], error: null };
  const subscriptions = result.data ?? [];
  const hasSubscription = subscriptions.some((s) => !["canceled", "incomplete_expired"].includes(s.status));
  const ready = enabled && !result.error && process.env.BILLING_MX_CHECKOUT_VERIFIED === "true";
  return <main className="min-h-screen bg-[#080808] px-6 py-12 text-white">
    <div className="mx-auto max-w-3xl">
      <Link href="/cuenta#pagos" className="text-sm text-white/60 hover:text-white">← Cuenta</Link>
      <h1 className="mt-8 text-4xl font-semibold">Tu suscripción</h1>
      {enabled ? <div role="status" className="mt-5 rounded-xl border border-amber-300/35 bg-amber-300/10 px-4 py-3 text-amber-100">
        <p className="text-sm font-semibold tracking-[0.16em]">STRIPE TEST MODE</p>
        <p className="mt-1 text-sm text-amber-100/75">Checkout de prueba. Usa únicamente tarjetas de prueba de Stripe.</p>
      </div> : <p className="mt-4 text-white/60">Las suscripciones estarán disponibles próximamente.</p>}
      <p className="mt-6">Acceso actual: FILMATTA {access.plan === "pro" ? "Pro" : access.plan === "plus" ? "Plus" : "Free"}</p>
      {feedback.checkout === "returned" && <p role="status" className="mt-5 text-amber-200">Recibimos tu regreso de Checkout. El acceso se actualizará cuando Stripe confirme el pago. <Link href="/cuenta/suscripcion" className="underline">Consultar estado</Link></p>}
      {feedback.checkout === "canceled" && <p role="status" className="mt-5 text-white/60">Saliste de Checkout. No se activó una suscripción desde esta página.</p>}
      {(feedback.error || result.error) && <p role="alert" className="mt-5 text-red-200">No pudimos completar la operación. Revisa tu suscripción existente o intenta más tarde. Las pruebas están limitadas a México.</p>}
      {subscriptions.map((s, index) => <div key={`${s.plan}:${s.updated_at}:${index}`} className="mt-5 rounded-xl border border-white/10 p-5">
        <p>FILMATTA {s.plan === "pro" ? "Pro" : s.plan === "plus" ? "Plus" : "Plan sin reconocer"} · {subscriptionLabel(s.status)}</p>
        {s.current_period_end && <p className="mt-2 text-sm text-white/50">{s.cancel_at_period_end ? "Cancelación programada" : "Fin del periodo"}: {new Date(s.current_period_end).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</p>}
      </div>)}
      {enabled && !hasSubscription && <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {(["plus", "pro"] as const).map((plan) => <form action={startCheckout} key={plan} className="rounded-2xl border border-white/15 p-6">
          <h2 className="text-xl font-semibold">FILMATTA {plan === "plus" ? "Plus" : "Pro"}</h2>
          <p className="mt-3">${FILMATTA_PLAN_PRICES[plan]} MXN / mes · IVA incluido</p>
          <p className="mt-3 text-sm text-white/60">Cursos y guías regulares de Learn. Las especialidades no están incluidas. Las demás funciones del plan siguen en desarrollo.</p>
          <input type="hidden" name="plan" value={plan} />
          <label className="mt-5 block text-sm">País de facturación<select name="country" required className="mt-2 block w-full rounded border border-white/20 bg-[#181818] p-2"><option value="MX">México</option></select></label>
          <LoadingButton type="submit" disabled={!ready} loadingText="Abriendo…" className="mt-5 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-40">Comprar {plan === "plus" ? "Plus" : "Pro"} (TEST)</LoadingButton>
        </form>)}
      </div>}
      {enabled && <form action={openBillingPortal} className="mt-8"><LoadingButton type="submit" loadingText="Abriendo…" disabled={!subscriptions.length || !process.env.STRIPE_PORTAL_CONFIGURATION_ID} className="rounded-full border border-white/20 px-5 py-3 disabled:opacity-40">Administrar suscripción de prueba</LoadingButton></form>}
      {enabled && !ready && <p className="mt-5 text-sm text-white/50">La configuración de las pruebas está pendiente.</p>}
      <p className="mt-10 text-sm text-white/45">El portal permitirá actualizar métodos de pago y cancelar. Los datos fiscales y la emisión de CFDI estarán disponibles en una etapa posterior.</p>
    </div>
  </main>;
}

function subscriptionLabel(status: string) {
  return ({ active: "Activa", canceled: "Cancelada", past_due: "Pago pendiente", unpaid: "Sin pagar",
    incomplete: "Pago por completar", incomplete_expired: "Pago vencido", trialing: "Periodo de prueba",
    paused: "Pausada" } as Record<string, string>)[status] ?? "En revisión";
}
