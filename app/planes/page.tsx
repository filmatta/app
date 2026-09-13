import Link from "next/link";
import { billingEnabled } from "@/lib/billing/config";
import SiteHeader from "@/components/SiteHeader";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import { getViewer } from "@/lib/auth/get-viewer";
import { getBillingAccess } from "@/lib/billing/access";
import {
  getPlanCardAction,
  type PlanCardAction,
} from "@/lib/billing/plan-presentation";
import {
  openBillingPortal,
  startCheckout,
} from "@/app/cuenta/suscripcion/actions";
import LoadingButton from "@/components/ui/LoadingButton";

const plans = [
  {
    id: "free",
    name: "FILMATTA Free",
    tagline: "Empieza en FILMATTA",
    description:
      "Para crear tu cuenta, conocer la plataforma y probar FILMATTA Learn.",
    price: FILMATTA_PLAN_PRICES.free,
    badgeClass: "bg-white/10 text-white/60",
    features: [
      "Cuenta y perfil básicos",
      "Acceso al temario de Learn",
      "Lecciones gratuitas al registrarte e inscribirte",
      "Progreso básico en esas lecciones",
      "Acceso básico a oportunidades",
    ],
  },
  {
    id: "plus",
    name: "FILMATTA Plus",
    tagline: "Aprende y mejora tu presencia profesional",
    description:
      "Para aprender continuamente y presentar tu trabajo con una presencia profesional premium.",
    price: FILMATTA_PLAN_PRICES.plus,
    badgeClass: "bg-emerald-400/15 text-emerald-200",
    recommended: true,
    features: [
      "Todo lo incluido en FILMATTA Free",
      "Todos los cursos regulares de Learn",
      "Perfil premium y mayor personalización",
      "Generador de CV y portfolio en PDF",
      "Certificados de finalización",
      "Analíticas personales",
      "Más herramientas para tu presencia profesional",
      "Especialidades disponibles por separado",
    ],
  },
  {
    id: "pro",
    name: "FILMATTA Pro",
    tagline: "Haz crecer tu carrera profesional",
    description:
      "Para profesionales que buscan más alcance, mejores herramientas y nuevas oportunidades.",
    price: FILMATTA_PLAN_PRICES.pro,
    badgeClass: "bg-amber-400/15 text-amber-200",
    features: [
      "Todo lo incluido en FILMATTA Plus",
      "Mayor capacidad de portfolio y reels",
      "Analíticas profesionales avanzadas",
      "Filtros avanzados de oportunidades",
      "Alertas y búsquedas guardadas",
      "Más créditos y contactos profesionales",
      "Mayor visibilidad para ser descubierto",
      "Prioridad y boosts de visibilidad",
      "Más oportunidades de ser visto por equipos que contratan",
    ],
  },
  {
    id: "business",
    name: "FILMATTA Business",
    tagline: "Encuentra, contrata y coordina talento",
    description:
      "Para organizaciones y equipos que necesitan buscar talento y coordinar su operación audiovisual.",
    price: FILMATTA_PLAN_PRICES.business,
    badgeClass: "bg-blue-400/15 text-blue-200",
    features: [
      "Organización y workspace",
      "Seats para miembros del equipo",
      "Talent Finder",
      "Hiring avanzado",
      "Scouter avanzado",
      "Shortlists y gestión de candidatos",
      "Coordinación de equipo y proyectos",
      "Herramientas de contacto y reclutamiento",
      "Analíticas para la organización",
      "Pensado para productoras, agencias, estudios y equipos",
    ],
  },
] as const;

export default async function PlanesPage() {
  const viewer = await getViewer();
  const billingAvailable = billingEnabled();
  const billing = viewer
    ? await getBillingAccess()
    : { regularAccess: false, plan: null };
  const currentPlan = viewer ? billing.plan : null;

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/cursos", label: "← Aprender" }} />

      <section className="mx-auto max-w-[96rem] px-6 pb-24 pt-16 lg:px-8 lg:pb-32 lg:pt-24">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
            Planes FILMATTA
          </p>
          <h1 className="mt-5 text-5xl font-semibold tracking-[-0.045em] sm:text-7xl">
            Elige cómo crecer en FILMATTA.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/50">
            Empieza con lo esencial y avanza cuando necesites más aprendizaje,
            presencia profesional o herramientas para tu organización.
          </p>
          {currentPlan && (
            <p className="mt-6 inline-flex rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white/70">
              Tu plan actual: FILMATTA {currentPlan === "plus" ? "Plus" : "Pro"}
            </p>
          )}
        </div>

        <nav
          aria-label="Niveles de FILMATTA"
          className="mt-10 flex flex-wrap gap-2"
        >
          {plans.map((plan) => (
            <Link
              key={plan.id}
              href={`#${plan.id}`}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/50 transition hover:border-white/20 hover:text-white"
            >
              {plan.name.replace("FILMATTA ", "")}
            </Link>
          ))}
        </nav>

        <div className="-mx-6 mt-16 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-5 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const action = getPlanCardAction({
              planId: plan.id,
              currentPlan,
              authenticated: Boolean(viewer),
              billingAvailable,
            });

            return (
              <article
                key={plan.id}
                id={plan.id}
                className={`flex min-h-[39rem] w-[85vw] max-w-[22rem] shrink-0 snap-center scroll-mt-8 flex-col rounded-2xl border p-7 sm:w-[23rem] lg:w-auto lg:max-w-none ${
                  isCurrent
                    ? "border-white/30 bg-white/[0.045]"
                    : "recommended" in plan && plan.recommended
                      ? "border-emerald-400/35 bg-emerald-400/[0.035]"
                      : "border-white/10 bg-white/[0.02]"
                }`}
              >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${plan.badgeClass}`}
                >
                  {plan.name.replace("FILMATTA ", "")}
                </span>
                {isCurrent ? (
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
                    Tu plan actual
                  </span>
                ) : "recommended" in plan && plan.recommended ? (
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70">
                    Recomendado
                  </span>
                ) : null}
              </div>

              <h2 className="mt-6 text-2xl font-semibold tracking-[-0.03em]">
                {plan.tagline}
              </h2>
              <p className="mt-4 text-sm leading-6 text-white/45">
                {plan.description}
              </p>

              <p className="mt-7 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-[-0.04em]">
                  ${plan.price}
                </span>
                {plan.price > 0 && (
                  <span className="text-sm text-white/35">/mes</span>
                )}
              </p>

              <ul className="mt-7 flex-1 space-y-3 border-t border-white/10 pt-7">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 text-sm leading-6 text-white/65"
                  >
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
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <PlanAction action={action} />
              </article>
            );
          })}
        </div>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-7 sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/30">
            Especialidades
          </p>
          <h2 className="mt-3 text-2xl font-semibold">
            Formación específica, cuando la necesites.
          </h2>
          <p className="mt-4 leading-7 text-white/50">
            Las especialidades se venden por separado. No están incluidas
            automáticamente en Plus, Pro ni Business.
          </p>
        </section>

        <p className="mt-8 text-center text-sm text-white/30">
          {billingAvailable
            ? "Stripe Test Mode. Usa únicamente tarjetas de prueba."
            : "Los planes premium estarán disponibles próximamente."}
        </p>
      </section>
    </main>
  );
}

function PlanAction({ action }: { action: PlanCardAction }) {
  const interactiveClass =
    "mt-8 inline-flex w-full justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/[0.05] hover:text-white";

  if (action.kind === "link") {
    return (
      <Link href={action.href} className={interactiveClass}>
        {action.label}
      </Link>
    );
  }

  if (action.kind === "checkout") {
    return (
      <form action={startCheckout} className="mt-8">
        <input type="hidden" name="plan" value={action.plan} />
        <input type="hidden" name="country" value="MX" />
        <LoadingButton
          type="submit"
          loadingText="Abriendo…"
          className={interactiveClass.replace("mt-8 ", "")}
        >
          {action.label}
        </LoadingButton>
      </form>
    );
  }

  if (action.kind === "portal") {
    return (
      <form action={openBillingPortal} className="mt-8">
        <LoadingButton
          type="submit"
          loadingText="Abriendo…"
          className={interactiveClass.replace("mt-8 ", "")}
        >
          {action.label}
        </LoadingButton>
      </form>
    );
  }

  return (
    <span
      aria-current={action.label === "Tu plan actual" ? "true" : undefined}
      className="mt-8 inline-flex justify-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white/35"
    >
      {action.label}
    </span>
  );
}
