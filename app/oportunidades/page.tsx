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
import {
  formatOpportunityCompensation,
  getOpportunityCategoryLabel,
  getOpportunityWorkModeLabel,
} from "@/lib/opportunities/format";
import {
  getPublishedOpportunities,
  type PublicOpportunitySummary,
} from "@/lib/opportunities/public";

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

function OpportunityRow({
  opportunity,
}: {
  opportunity: PublicOpportunitySummary;
}) {
  const place = [
    opportunity.city,
    getOpportunityWorkModeLabel(opportunity.workMode),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/oportunidades/${opportunity.slug}`}
      className="group grid gap-8 py-9 transition hover:bg-white/[0.02] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white md:grid-cols-[minmax(0,1fr)_14rem] md:px-5"
    >
      <div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/65">
          <span>{getOpportunityCategoryLabel(opportunity.category)}</span>
          {opportunity.discipline && (
            <>
              <span aria-hidden="true">•</span>
              <span>{opportunity.discipline}</span>
            </>
          )}
        </div>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.025em] transition group-hover:text-white/80 sm:text-4xl">
          {opportunity.title}
        </h2>
        <p className="mt-3 text-sm text-white/65">{opportunity.projectTitle}</p>
        {opportunity.summary && (
          <p className="mt-5 max-w-3xl text-base leading-7 text-white/65">
            {opportunity.summary}
          </p>
        )}
      </div>
      <div className="flex flex-col justify-between gap-6 md:text-right">
        <div>
          <p className="text-sm text-white/55">{place}</p>
          <p className="mt-2 text-sm text-white/65">
            {formatOpportunityCompensation(opportunity)}
          </p>
        </div>
        <span className="text-sm font-semibold text-white/65 transition group-hover:text-white">
          Ver convocatoria →
        </span>
      </div>
    </Link>
  );
}
