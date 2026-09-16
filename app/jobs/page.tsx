import type { CSSProperties } from "react";
import SiteHeader from "@/components/SiteHeader";
import Link from "next/link";
import {
  CatalogFiltersForm,
  CatalogPagination,
  CatalogFailure,
} from "@/components/catalogs/CatalogControls";
import { OpportunityRow } from "@/components/catalogs/OpportunityRow";
import { parseCatalogFilters, type SearchParams } from "@/lib/catalogs/filters";
import { getPublishedOpportunities } from "@/lib/opportunities/public";
export const metadata = { title: "Jobs · Encargos audiovisuales" };
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseCatalogFilters(await searchParams);
  filters.category = "";
  const result = await getPublishedOpportunities(filters, true);
  return (
    <div
      className="editorial-page"
      style={{ "--vertical-accent": "#9DADBD" } as CSSProperties}
    >
      <SiteHeader />
      <main className="editorial-container py-16">
        <p className="eyebrow">Oportunidades / Jobs</p>
        <h1 className="mt-5 text-5xl font-semibold tracking-tight sm:text-7xl">
          Encargos con contexto.
        </h1>
        <p className="mt-6 max-w-2xl leading-8 text-white/70">
          Trabajo audiovisual pagado, con entregables, presupuesto y fecha
          límite definidos. Revisa las condiciones antes de presentar tu
          interés.
        </p>
        <Link
          className="editorial-primary mt-6"
          href="/mis-oportunidades/nueva?type=job"
        >
          Publicar un encargo ↗
        </Link>
        <CatalogFiltersForm
          path="/jobs"
          filters={filters}
          fields={[
            { name: "q", label: "Buscar encargo" },
            { name: "discipline", label: "Disciplina" },
            { name: "city", label: "Ciudad" },
            {
              name: "workMode",
              label: "Modalidad",
              options: [
                { value: "remote", label: "Remoto" },
                { value: "on_site", label: "Presencial" },
                { value: "hybrid", label: "Híbrido" },
              ],
            },
            {
              name: "currency",
              label: "Moneda del presupuesto",
              options: [
                { value: "MXN", label: "MXN" },
                { value: "USD", label: "USD" },
                { value: "EUR", label: "EUR" },
              ],
            },
            {
              name: "budgetMin",
              label: "Mínimo ofrecido desde",
              type: "number",
            },
            { name: "deadlineFrom", label: "Cierre a partir de", type: "date" },
          ]}
        />
        <p className="mt-4 text-sm text-white/65">
          El filtro de importe requiere una moneda. Compara el mínimo ofrecido;
          no convierte divisas. Las fechas de cierre se expresan en UTC.
        </p>
        {filters.budgetMin && !filters.currency && (
          <p role="status" className="mt-3 text-amber-200">
            Selecciona una moneda para aplicar el filtro de presupuesto.
          </p>
        )}
        {!result.ok ? (
          <CatalogFailure kind={result.kind} />
        ) : (
          <>
            {result.opportunities.length ? (
              <div className="mt-10 divide-y divide-white/15 border-y border-white/15">
                {result.opportunities.map((opportunity) => (
                  <OpportunityRow
                    key={opportunity.id}
                    opportunity={opportunity}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-12 border-y border-white/15 py-12">
                <h2 className="text-2xl">
                  No hay encargos para esta selección.
                </h2>
                <p className="mt-4 text-white/65">
                  Prueba otra disciplina o limpia los filtros. Sólo aparecen
                  encargos publicados.
                </p>
              </div>
            )}
            <CatalogPagination
              path="/jobs"
              filters={filters}
              hasNext={result.hasNext}
            />
          </>
        )}
      </main>
    </div>
  );
}
