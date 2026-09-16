import Link from "next/link";
import type { CSSProperties } from "react";
import SiteHeader from "@/components/SiteHeader";
import {
  CatalogFailure,
  CatalogFiltersForm,
  CatalogPagination,
} from "@/components/catalogs/CatalogControls";
import { parseCatalogFilters, type SearchParams } from "@/lib/catalogs/filters";
import { getServices } from "@/lib/services/queries";
import {
  SERVICE_CATEGORIES,
  WORK_MODES,
  servicePrice,
} from "@/lib/services/form";
export const metadata = { title: "Marketplace · Servicios audiovisuales" };
export default async function Marketplace({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseCatalogFilters(await searchParams),
    result = await getServices(filters);
  return (
    <div
      className="editorial-page"
      style={{ "--vertical-accent": "#A7C4BF" } as CSSProperties}
    >
      <SiteHeader />
      <main className="editorial-container py-16">
        <p className="eyebrow">FILMATTA / Marketplace</p>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Servicios para hacer posible tu producción.
        </h1>
        <p className="mt-6 max-w-2xl leading-7 text-white/70">
          Explora servicios publicados y envía una consulta privada. Este
          directorio no gestiona reservas, contrataciones ni pagos.
        </p>
        <Link href="/mis-servicios/nuevo" className="editorial-secondary mt-6">
          Publicar un servicio ↗
        </Link>
        <CatalogFiltersForm
          path="/marketplace"
          filters={filters}
          fields={[
            { name: "q", label: "Buscar servicio" },
            {
              name: "category",
              label: "Categoría",
              options: SERVICE_CATEGORIES,
            },
            { name: "city", label: "Ciudad" },
            { name: "workMode", label: "Modalidad", options: WORK_MODES },
          ]}
        />
        {!result.ok ? (
          <CatalogFailure kind={result.kind} />
        ) : (
          <>
            {result.services.length ? (
              <div className="grid gap-x-8 md:grid-cols-2 lg:grid-cols-3">
                {result.services.map((s) => (
                  <Link
                    key={s.id}
                    href={`/marketplace/${s.slug}`}
                    className="group border-t border-white/20 py-8 focus-visible:outline-2 focus-visible:outline-offset-4"
                  >
                    <p className="eyebrow">
                      {
                        SERVICE_CATEGORIES.find((c) => c.value === s.category)
                          ?.label
                      }
                    </p>
                    <h2 className="mt-5 text-3xl font-medium group-hover:text-[#A7C4BF]">
                      {s.title}
                    </h2>
                    <p className="mt-4 text-sm text-white/65">
                      {s.city || "Sin ciudad indicada"} ·{" "}
                      {WORK_MODES.find((m) => m.value === s.work_mode)?.label}
                    </p>
                    <p className="mt-5 line-clamp-3 leading-7 text-white/70">
                      {s.description}
                    </p>
                    <p className="mt-6 text-sm text-[#A7C4BF]">
                      {servicePrice(s)}
                    </p>
                    <span className="editorial-secondary mt-5">
                      Ver servicio ↗
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border-y border-white/15 py-12">
                <h2 className="text-2xl">
                  No hay servicios para esta selección.
                </h2>
                <p className="mt-3 text-white/70">
                  Prueba otros filtros o publica el primer servicio de tu
                  especialidad.
                </p>
              </div>
            )}
            <CatalogPagination
              path="/marketplace"
              filters={filters}
              hasNext={result.hasNext}
            />
          </>
        )}
      </main>
    </div>
  );
}
