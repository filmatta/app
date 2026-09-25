import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import {
  formatLocationPrice,
  formatLocationUpdatedAt,
} from "@/lib/locations/format";
import {
  locationActivationHref,
  locationActivationInProgress,
  locationActivationStep,
} from "@/lib/locations/activation";
import {
  getLocationStatusLabel,
  type LocationPriceUnit,
  type LocationStatus,
} from "@/lib/locations/form";
import type { LocationRateMode, LocationRateTier } from "@/lib/locations/pricing";
import { createClient } from "@/lib/supabase/server";
import LocationFeedback from "./LocationFeedback";

export const metadata: Metadata = {
  title: "Mis locaciones",
  robots: { index: false, follow: false },
};

type LocationRow = {
  id: string;
  title: string;
  slug: string;
  city: string;
  area: string | null;
  space_type: string;
  price_amount: number | null;
  price_currency: string | null;
  price_unit: LocationPriceUnit | null;
  rate_mode: LocationRateMode;
  rate_tiers: LocationRateTier[];
  status: LocationStatus;
  onboarding_step: number | null;
  onboarding_completed_at: string | null;
  updated_at: string;
};

export default async function MyLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) {
    redirect("/acceso?next=%2Fmis-locaciones");
  }

  const [params, supabase] = await Promise.all([searchParams, createClient()]);
  const { data, error } = await supabase
    .from("locations")
    .select(
      "id, title, slug, city, area, space_type, price_amount, price_currency, price_unit, rate_mode, rate_tiers, status, onboarding_step, onboarding_completed_at, updated_at"
    )
    .eq("owner_id", viewer.id)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    console.error("Error cargando las locaciones del usuario:", {
      code: error.code,
      message: error.message,
    });
  }

  const locations = (data ?? []) as LocationRow[];

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader
        contextLink={{ href: "/locaciones", label: "Ver locaciones públicas" }}
      />

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
        <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
              Inventario propio
            </p>
            <h1 className="mt-5 text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">
              Mis locaciones
            </h1>
            <p className="mt-5 max-w-2xl leading-7 text-white/45">
              Crea, revisa y decide qué espacios están visibles para la
              comunidad.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/cuenta/contactos/locaciones" className="w-fit rounded-full border border-white/15 px-6 py-3 font-semibold text-white transition hover:bg-white/[0.07]">Solicitudes de Locaciones</Link>
            <Link
              href="/mis-locaciones/nueva"
              className="w-fit rounded-full bg-white px-6 py-3 font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              + Nueva locación
            </Link>
          </div>
        </div>

        <LocationFeedback error={params.error} success={params.success} />

        {error ? (
          <div
            role="alert"
            className="mt-10 rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-7 text-red-200"
          >
            No pudimos cargar tus locaciones. Inténtalo de nuevo.
          </div>
        ) : locations.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
            <h2 className="text-2xl font-semibold">
              Todavía no tienes locaciones.
            </h2>
            <p className="mx-auto mt-3 max-w-lg leading-7 text-white/40">
              Crea un borrador y publícalo cuando la información esté lista.
            </p>
            <Link
              href="/mis-locaciones/nueva"
              className="mt-7 inline-flex rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium transition hover:bg-white/[0.06]"
            >
              Crear primera locación
            </Link>
          </div>
        ) : (
          <div className="mt-10 overflow-hidden rounded-2xl border border-white/10">
            {locations.map((location) => (
              <LocationListItem key={location.id} location={location} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function LocationListItem({ location }: { location: LocationRow }) {
  const place = [location.area, location.city].filter(Boolean).join(", ");
  const price = formatLocationPrice({
    priceAmount: location.price_amount,
    priceCurrency: location.price_currency,
    priceUnit: location.price_unit,
    rateMode: location.rate_mode,
    rateTiers: location.rate_tiers,
  });
  const activationStep = locationActivationStep(location.onboarding_step);
  const activationInProgress = locationActivationInProgress(
    location.onboarding_step,
    location.onboarding_completed_at,
  );

  return (
    <article className="flex flex-col gap-6 border-b border-white/10 p-6 last:border-b-0 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="[overflow-wrap:anywhere] text-xl font-semibold">
            {location.title}
          </h2>
          <StatusBadge status={location.status} />
        </div>
        <p className="mt-2 [overflow-wrap:anywhere] text-sm text-white/45">
          {location.space_type} · {place}
        </p>
        <div className="mt-4 flex min-w-0 flex-wrap gap-x-5 gap-y-2 text-xs text-white/45">
          <span>{price}</span>
          <span>Actualizada {formatLocationUpdatedAt(location.updated_at)}</span>
          <span className="max-w-full break-all">/locaciones/{location.slug}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {location.status === "published" && (
          <Link
            href={`/locaciones/${location.slug}`}
            className="rounded-full px-4 py-2 text-sm text-white/50 transition hover:bg-white/[0.04] hover:text-white"
          >
            Ver pública
          </Link>
        )}
        <Link
          href={activationInProgress
            ? locationActivationHref(location.id, activationStep ?? 1)
            : `/mis-locaciones/${location.id}/editar`}
          className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium transition hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {activationInProgress ? "Continuar configuración" : "Editar"}
        </Link>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: LocationStatus }) {
  const className =
    status === "published"
      ? "bg-emerald-400/10 text-emerald-200"
      : status === "archived"
        ? "bg-amber-400/10 text-amber-200"
        : "bg-white/[0.07] text-white/45";

  return (
    <span className={`rounded-full px-3 py-1 text-xs ${className}`}>
      {getLocationStatusLabel(status)}
    </span>
  );
}
