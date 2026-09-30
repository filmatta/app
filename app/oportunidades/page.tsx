import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { CatalogPagination } from "@/components/catalogs/CatalogControls";
import { OpportunityRow } from "@/components/catalogs/OpportunityRow";
import OpportunityFilters from "@/components/opportunities/OpportunityFilters";
import { PublicDataError } from "@/components/verticals/PublicDataState";
import {
  catalogPageHref,
  parseCatalogFilters,
  type CatalogFilters,
  type SearchParams,
} from "@/lib/catalogs/filters";
import { getPublishedOpportunities } from "@/lib/opportunities/public";

const FILTER_KEYS = [
  "q",
  "category",
  "city",
  "compensation",
  "workMode",
  "page",
] as const;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const filtered = FILTER_KEYS.some((key) => Boolean(params[key]));

  return {
    title: "Buscar oportunidades audiovisuales",
    description:
      "Encuentra trabajo, castings, crew y colaboraciones audiovisuales en FILMATTA.",
    alternates: { canonical: "/oportunidades" },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseCatalogFilters(await searchParams);
  const result = await getPublishedOpportunities(filters);

  if (!result.ok) {
    return (
      <PublicDataError
        backHref="/"
        backLabel="← Inicio"
        title={
          result.kind === "unconfigured"
            ? "El buscador de oportunidades todavía no está configurado."
            : "No pudimos cargar las oportunidades."
        }
      />
    );
  }

  const hasFilters = hasOpportunityFilters(filters);
  const returnTo = catalogPageHref(
    "/oportunidades",
    filters,
    filters.page,
  );

  return (
    <main className="opportunity-page">
      <SiteHeader contextLink={{ href: "/", label: "← Volver" }} />

      <section className="opportunity-shell" aria-labelledby="opportunities-title">
        <header className="opportunity-hero">
          <div>
            <p className="opportunity-eyebrow">Tablón audiovisual</p>
            <h1 id="opportunities-title">Buscar oportunidades</h1>
            <p className="opportunity-hero-description">
              Trabajo, castings, crew y colaboraciones para encontrar tu
              próximo rodaje.
            </p>
          </div>
          <Link
            href="/mis-oportunidades/nueva"
            className="opportunity-publish-link"
          >
            Publicar oportunidad ↗
          </Link>
        </header>

        <OpportunityFilters filters={filters} />

        {result.opportunities.length > 0 ? (
          <>
            <div className="opportunity-results-header">
              <h2>Oportunidades disponibles</h2>
              <p>
                {result.opportunities.length}
                {result.hasNext ? "+" : ""} en esta página
              </p>
            </div>
            <div className="opportunity-results">
              {result.opportunities.map((opportunity) => (
                <OpportunityRow
                  key={opportunity.id}
                  opportunity={opportunity}
                  returnTo={returnTo}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="opportunity-empty">
            <h2>
              {hasFilters
                ? "No encontramos oportunidades con estos filtros."
                : "Todavía no hay oportunidades publicadas."}
            </h2>
            <p>
              {hasFilters
                ? "Prueba con menos filtros, otra ciudad o una búsqueda más amplia."
                : "Vuelve pronto para descubrir nuevos castings, trabajos y colaboraciones."}
            </p>
            {hasFilters && <Link href="/oportunidades">Limpiar filtros</Link>}
          </div>
        )}

        {result.opportunities.length > 0 &&
          (filters.page > 1 || result.hasNext) && (
            <CatalogPagination
              path="/oportunidades"
              filters={filters}
              hasNext={result.hasNext}
            />
          )}
      </section>
    </main>
  );
}

function hasOpportunityFilters(filters: CatalogFilters) {
  return Boolean(
    filters.q ||
      filters.category ||
      filters.city ||
      filters.compensation ||
      filters.workMode,
  );
}
