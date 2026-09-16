import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import {
  CatalogFiltersForm,
  CatalogPagination,
} from "@/components/catalogs/CatalogControls";
import { parseCatalogFilters, type SearchParams } from "@/lib/catalogs/filters";
import { LOCATION_ENVIRONMENTS } from "@/lib/locations/form";
import {
  PublicDataError,
  PublicEmptyState,
} from "@/components/verticals/PublicDataState";
import {
  formatLocationPrice,
  getLocationEnvironmentLabel,
} from "@/lib/locations/format";
import {
  getPublishedLocations,
  type PublicLocationSummary,
} from "@/lib/locations/public";

export const metadata: Metadata = {
  title: "Locaciones",
  description:
    "Espacios publicados para producciones audiovisuales en FILMATTA.",
};

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseCatalogFilters(await searchParams);
  const result = await getPublishedLocations(filters);

  if (!result.ok) {
    return (
      <PublicDataError
        backHref="/"
        backLabel="← Inicio"
        title={
          result.kind === "unconfigured"
            ? "El catálogo de locaciones todavía no está configurado."
            : "No pudimos cargar las locaciones."
        }
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/", label: "← Volver" }} />

      <section className="mx-auto max-w-7xl px-6 pb-20 pt-20 lg:px-8 lg:pb-28 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/65">
          Inventario audiovisual
        </p>
        <h1 className="mt-5 max-w-5xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
          Locaciones
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-white/65">
          Descubre espacios compartidos por la comunidad para tu próxima
          producción. La publicación del inventario es gratuita.
        </p>

        <Link href="/mis-locaciones/nueva" className="editorial-secondary mt-6">
          Publicar una locación ↗
        </Link>
        <CatalogFiltersForm
          path="/locaciones"
          filters={filters}
          fields={[
            { name: "q", label: "Buscar espacio" },
            { name: "city", label: "Ciudad" },
            {
              name: "environment",
              label: "Entorno",
              options: LOCATION_ENVIRONMENTS,
            },
          ]}
        />
        {result.locations.length > 0 ? (
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {result.locations.map((location) => (
              <LocationCard key={location.id} location={location} />
            ))}
          </div>
        ) : (
          <PublicEmptyState
            title="No hay locaciones para esta selección."
            description="Prueba otra búsqueda o limpia los filtros para consultar todos los espacios publicados."
          />
        )}
        <CatalogPagination
          path="/locaciones"
          filters={filters}
          hasNext={result.hasNext}
        />
      </section>
    </main>
  );
}

function LocationCard({ location }: { location: PublicLocationSummary }) {
  const cover = location.photos[0];
  const place = [location.area, location.city].filter(Boolean).join(", ");

  return (
    <Link
      href={`/locaciones/${location.slug}`}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] transition duration-300 hover:-translate-y-1 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
    >
      <div className="aspect-[4/3] overflow-hidden bg-white/[0.04]">
        {cover ? (
          <img
            src={cover.imageUrl}
            alt={cover.altText || location.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-semibold uppercase tracking-[0.3em] text-white/15">
            FILMATTA Locations
          </div>
        )}
      </div>
      <div className="p-7">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs uppercase tracking-[0.18em] text-white/65">
          <span>{location.spaceType}</span>
          <span aria-hidden="true">•</span>
          <span>{getLocationEnvironmentLabel(location.environment)}</span>
        </div>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.025em]">
          {location.title}
        </h2>
        <p className="mt-3 text-sm text-white/65">{place}</p>
        {location.summary && (
          <p className="mt-5 line-clamp-3 leading-7 text-white/65">
            {location.summary}
          </p>
        )}
        <div className="mt-8 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
          <span className="text-sm text-white/65">
            {formatLocationPrice(location)}
          </span>
          <span className="text-sm font-semibold text-white/65 transition group-hover:text-white">
            Ver →
          </span>
        </div>
      </div>
    </Link>
  );
}
