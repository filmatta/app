import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { PlanBadge } from "@/components/entitlements/PlanBadge";
import { PlanPageViewEvent } from "@/components/entitlements/PlanPageViewEvent";
import { UpgradeGate } from "@/components/entitlements/UpgradeGate";
import { getViewer } from "@/lib/auth/get-viewer";
import { COMMERCIAL_PLAN_CODES, getEntitlementDefinition } from "@/lib/entitlements/catalog";
import { getSafePostAuthPath } from "@/lib/auth/safe-next-path";
import {
  checkEntitlement,
  getEntitlementContext,
  getPlanCatalog,
} from "@/lib/entitlements/server";
import type {
  EntitlementCheck,
  PlanCode,
  PlanDefinition,
} from "@/lib/entitlements/types";
import { resolveEntitlementCheck } from "@/lib/entitlements/resolver";
import { getPlanVisual } from "@/lib/plan-visuals";
import {
  PAGE_CONTAINER_CLASS_NAME,
  WIDE_PAGE_CONTAINER_CLASS_NAME,
} from "@/lib/page-container";

export const dynamic = "force-dynamic";

export default async function PlanesPage({ searchParams }: { searchParams: Promise<{ from?: string; capability?: string }> }) {
  const query = await searchParams;
  const returnPath = typeof query.from === "string" ? getSafePostAuthPath(query.from, "/create") : null;
  const returnHref = returnPath && !returnPath.startsWith("/planes") ? returnPath : null;
  const requestedFeature = typeof query.capability === "string" ? getEntitlementDefinition(query.capability) : null;
  const viewer = await getViewer();
  const [catalog, entitlementContext] = await Promise.all([
    getPlanCatalog(),
    viewer ? getEntitlementContext() : Promise.resolve(null),
  ]);
  const currentPlan = entitlementContext?.plan ?? "free";
  const featureExamples = await Promise.all(
    [
      "search.advanced_filters",
      "production.assistant",
      "services.business_profile",
    ].map((entitlement) =>
      viewer
        ? checkEntitlement(entitlement)
        : Promise.resolve(
            resolveEntitlementCheck({
              plan: "free",
              entitlement,
            })
          )
    )
  );
  const baseline = catalog.find((plan) => plan.code === "free");
  const commercialPlans = COMMERCIAL_PLAN_CODES.map(
    (code) => catalog.find((plan) => plan.code === code)
  ).filter((plan): plan is PlanDefinition => Boolean(plan));

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <PlanPageViewEvent currentPlan={currentPlan} />
      <SiteHeader contextLink={{ href: "/cursos", label: "← Aprender" }} />

      {returnHref && <div className="mx-auto max-w-7xl px-6 pt-5 lg:px-8">
        <p className="text-sm text-white/60">{requestedFeature ? `Consultaste los planes para ${requestedFeature.name}.` : "Consulta los planes y vuelve a tu trabajo cuando quieras."}</p>
        <Link href={returnHref} className="mt-2 inline-block text-sm font-semibold text-white underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">← Volver a mi trabajo</Link>
      </div>}

      <section className="pb-24 pt-16 lg:pb-32 lg:pt-24">
        <div className={PAGE_CONTAINER_CLASS_NAME}>
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
              Planes FILMATTA
            </p>
            <h1 className="mt-5 text-5xl font-semibold tracking-[-0.045em] sm:text-7xl">
              Más capacidad cuando la necesitas.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/50">
              Pagar mejora aprendizaje, capacidad, inteligencia, almacenamiento
              y herramientas. Tu derecho básico a participar profesionalmente
              no depende de un plan.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <span className="text-sm text-white/45">Tu plan actual</span>
              {currentPlan === "free" ? (
                <span className="text-sm font-semibold text-white/75">
                  Baseline
                </span>
              ) : (
                <PlanBadge plan={currentPlan} size="card" />
              )}
              {entitlementContext?.status === "unavailable" && (
                <span className="text-xs text-white/35">
                  No pudimos verificar un plan premium.
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={`${WIDE_PAGE_CONTAINER_CLASS_NAME} mt-14`}>
          <div className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-5 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0">
            {commercialPlans.map((plan) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                currentPlan={currentPlan}
              />
            ))}
          </div>
        </div>

        <div className={PAGE_CONTAINER_CLASS_NAME}>
          <section
            id="como-funcionan-los-planes"
            className="mt-14 grid gap-8 border-y border-white/10 py-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/30">
                Baseline protegido
              </p>
              <h2 className="mt-3 text-3xl font-semibold">
                El perfil gratuito no se reduce.
              </h2>
            </div>
            <div>
              <p className="leading-7 text-white/50">
                {baseline?.description ??
                  "La participación profesional básica permanece disponible sin suscripción."}
              </p>
              <ul className="mt-6 grid gap-3 text-sm text-white/65 sm:grid-cols-2">
                {(baseline?.features ?? []).map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <CheckIcon />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mt-14 rounded-2xl border border-white/10 bg-white/[0.025] p-7 sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/30">
              Ejemplos de valor premium
            </p>
            <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">
              <FeatureExample label="Filtros avanzados" access={featureExamples[0]} />
              <FeatureExample label="Production Assistant" access={featureExamples[1]} />
              <FeatureExample label="Perfil de negocio" access={featureExamples[2]} />
            </div>
          </section>

          <div className="mt-10 flex flex-col items-center gap-4 text-center">
            <p className="max-w-2xl text-sm leading-6 text-white/40">
              Esta fase no incluye checkout ni cobros. Los precios son una
              referencia configurable y los planes se asignan de forma segura
              para pruebas internas.
            </p>
            {viewer?.role === "admin" && (
              <Link
                href="/admin/planes"
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white"
              >
                Simular planes en Admin
              </Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function PlanCard({
  plan,
  currentPlan,
}: {
  plan: PlanDefinition;
  currentPlan: PlanCode;
}) {
  const isCurrent = plan.code === currentPlan;
  const visual = getPlanVisual(plan.code);

  return (
    <article
      id={plan.code}
      className={`flex min-h-[36rem] w-[85vw] max-w-[22rem] shrink-0 snap-center scroll-mt-8 flex-col rounded-2xl border p-7 sm:w-[23rem] lg:w-auto lg:max-w-none ${
        isCurrent
          ? `${visual.panelClassName} ring-1 ring-white/15`
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PlanBadge plan={plan.code} size="card" />
        {isCurrent && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
            Tu plan actual
          </span>
        )}
      </div>

      <p className={`mt-6 text-sm font-semibold ${visual.accentClassName}`}>
        {plan.audience}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
        FILMATTA {plan.label}
      </h2>
      <p className="mt-4 min-h-24 text-sm leading-6 text-white/45">
        {plan.description}
      </p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-[-0.04em]">
          ${plan.currentPriceMxn.toLocaleString("es-MX")}
        </span>
        <span className="text-sm text-white/35">MXN / mes</span>
      </p>

      <ul className="mt-7 flex-1 space-y-3 border-t border-white/10 pt-7">
        {plan.features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-3 text-sm leading-6 text-white/65"
          >
            <CheckIcon />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <a
        href="#como-funcionan-los-planes"
        className="mt-8 inline-flex w-full justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      >
        Conocer plan
      </a>
    </article>
  );
}

function FeatureExample({
  label,
  access,
}: {
  label: string;
  access: EntitlementCheck;
}) {
  return (
    <div className="bg-[#0b0b0b] p-5">
      <UpgradeGate
        access={access}
        context="plans_feature_example"
        className="w-full justify-between text-sm text-white/70"
      >
        {label}
      </UpgradeGate>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="mt-1 size-4 shrink-0 fill-none stroke-current text-white/35"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
