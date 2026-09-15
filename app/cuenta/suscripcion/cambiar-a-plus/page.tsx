import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import LoadingButton from "@/components/ui/LoadingButton";
import { getViewer } from "@/lib/auth/get-viewer";
import { billingEnabled, billingMode } from "@/lib/billing/config";
import { formatBillingEffectiveDate } from "@/lib/billing/return-presentation";
import { getProToPlusDowngradeState } from "@/lib/billing/subscription-schedule";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import {
  scheduleDowngradeToPlus,
  undoDowngradeToPlus,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ChangeToPlusPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) {
    redirect("/acceso?next=%2Fcuenta%2Fsuscripcion%2Fcambiar-a-plus");
  }
  if (!billingEnabled()) redirect("/planes");
  const mode = billingMode();

  const feedback = await searchParams;
  let state = null;
  try {
    state = await getProToPlusDowngradeState(viewer.id);
  } catch {
    if (feedback.error !== "schedule") {
      redirect("/cuenta/suscripcion?error=downgrade");
    }
  }

  if (!state) {
    return (
      <main className="min-h-screen bg-[#080808] text-white">
        <SiteHeader contextLink={{ href: "/planes", label: "← Planes" }} />
        <section className="mx-auto max-w-3xl px-6 py-20 sm:px-8">
          {mode === "test" && <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200/65">
            Stripe Test Mode
          </p>}
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em]">
            Verifiquemos el cambio
          </h1>
          <p role="alert" className="mt-6 max-w-2xl leading-7 text-white/55">
            Stripe conserva un Schedule que todavía no podemos confirmar como
            completo. Tu plan efectivo no cambió. Al reintentar, FILMATTA sólo
            continuará si demuestra que ese Schedule pertenece al intento anterior.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <form action={scheduleDowngradeToPlus}>
              <LoadingButton
                type="submit"
                loadingText="Verificando…"
                className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black sm:w-auto"
              >
                Reintentar de forma segura
              </LoadingButton>
            </form>
            <Link
              href="/planes"
              className="inline-flex justify-center rounded-full border border-white/10 px-6 py-3 text-sm font-semibold text-white/60"
            >
              Volver
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const effectiveDate = formatBillingEffectiveDate(state.effectiveAt);

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/planes", label: "← Planes" }} />
      <section className="mx-auto max-w-3xl px-6 py-14 sm:px-8 sm:py-20">
        {mode === "test" && <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200/65">
          Stripe Test Mode
        </p>}
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Cambiar a FILMATTA Plus
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-white/55">
          Seguirás disfrutando FILMATTA Pro hasta el final de tu periodo
          actual. Después, tu plan cambiará automáticamente a Plus.
        </p>

        <div className="mt-9 rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
          <p className="text-sm text-white/50">
            Tu plan cambiará el {effectiveDate}.
          </p>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <PlanSummary
              label="Plan actual"
              plan="Pro"
              price={FILMATTA_PLAN_PRICES.pro}
              accent="text-amber-200"
            />
            <PlanSummary
              label="Próximo plan"
              plan="Plus"
              price={FILMATTA_PLAN_PRICES.plus}
              accent="text-emerald-200"
            />
          </div>
          <p className="mt-7 border-t border-white/10 pt-6 text-sm leading-6 text-white/45">
            No habrá reembolso ni cargo adicional por este cambio durante tu
            periodo actual.
          </p>
        </div>

        {feedback.error && (
          <p role="alert" className="mt-6 text-sm text-red-200">
            No pudimos programar el cambio. Tu plan Pro permanece sin cambios.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          {state.scheduled ? (
            <form action={undoDowngradeToPlus}>
              <LoadingButton
                type="submit"
                loadingText="Deshaciendo…"
                className="w-full rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/[0.06] sm:w-auto"
              >
                Deshacer cambio
              </LoadingButton>
            </form>
          ) : (
            <form action={scheduleDowngradeToPlus}>
              <LoadingButton
                type="submit"
                loadingText="Programando…"
                className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90 sm:w-auto"
              >
                Programar cambio a Plus
              </LoadingButton>
            </form>
          )}
          <Link
            href="/planes"
            className="inline-flex justify-center rounded-full border border-white/10 px-6 py-3 text-sm font-semibold text-white/60 transition hover:border-white/20 hover:text-white"
          >
            Volver
          </Link>
        </div>
      </section>
    </main>
  );
}

function PlanSummary({
  label,
  plan,
  price,
  accent,
}: {
  label: string;
  plan: string;
  price: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/35">
        {label}
      </p>
      <p className={`mt-3 text-xl font-semibold ${accent}`}>FILMATTA {plan}</p>
      <p className="mt-2 text-sm text-white/50">${price} MXN/mes</p>
    </div>
  );
}
