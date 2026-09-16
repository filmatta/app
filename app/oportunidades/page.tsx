import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import {
  CatalogFiltersForm,
  CatalogPagination,
} from "@/components/catalogs/CatalogControls";
import { parseCatalogFilters, type SearchParams } from "@/lib/catalogs/filters";
import {
  PublicDataError,
  PublicEmptyState,
} from "@/components/verticals/PublicDataState";
import { OpportunityRow } from "@/components/catalogs/OpportunityRow";
import { getPublishedOpportunities } from "@/lib/opportunities/public";

export const metadata: Metadata = {
  title: "Oportunidades",
  description:
    "Convocatorias estructuradas de proyectos audiovisuales en FILMATTA.",
};

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
            ? "El catálogo de oportunidades todavía no está configurado."
            : "No pudimos cargar las oportunidades."
        }
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/", label: "← Volver" }} />

      <section className="mx-auto max-w-7xl px-6 pb-20 pt-20 lg:px-8 lg:pb-28 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/65">
          Proyectos audiovisuales
        </p>
        <h1 className="mt-5 max-w-5xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
          Oportunidades
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-white/65">
          Explora convocatorias de casting, crew, trabajo y colaboración
          publicadas dentro de proyectos reales.
        </p>

        <Link
          href="/mis-oportunidades/nueva"
          className="editorial-secondary mt-6"
        >
          Publicar oportunidad ↗
        </Link>
        <CatalogFiltersForm
          path="/oportunidades"
          filters={filters}
          fields={[
            { name: "q", label: "Buscar convocatoria" },
            { name: "city", label: "Ciudad" },
            {
              name: "category",
              label: "Tipo",
              options: [
                { value: "casting", label: "Casting" },
                { value: "crew", label: "Crew" },
                { value: "paid_work", label: "Trabajo pagado / Freelance" },
                { value: "collaboration", label: "Colaboración" },
                { value: "internship", label: "Prácticas" },
              ],
            },
            {
              name: "workMode",
              label: "Modalidad",
              options: [
                { value: "on_site", label: "Presencial" },
                { value: "remote", label: "Remoto" },
                { value: "hybrid", label: "Híbrido" },
              ],
            },
          ]}
        />
        {result.opportunities.length > 0 ? (
          <div className="mt-14 divide-y divide-white/10 border-y border-white/10">
            {result.opportunities.map((opportunity) => (
              <OpportunityRow key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        ) : (
          <PublicEmptyState
            title="No hay oportunidades para esta selección."
            description="Prueba otra categoría o ciudad, o limpia los filtros para consultar todas las convocatorias publicadas."
          />
        )}
        <CatalogPagination
          path="/oportunidades"
          filters={filters}
          hasNext={result.hasNext}
        />
      </section>
    </main>
  );
}
