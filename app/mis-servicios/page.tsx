import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import {
  CatalogFailure,
  CatalogPagination,
} from "@/components/catalogs/CatalogControls";
import {
  catalogErrorKind,
  parseCatalogFilters,
  PAGE_SIZE,
  type SearchParams,
} from "@/lib/catalogs/filters";
export const metadata = { title: "Mis servicios" };
export default async function MyServices({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=%2Fmis-servicios");
  const filters = parseCatalogFilters(await searchParams),
    supabase = await createClient(),
    offset = (filters.page - 1) * PAGE_SIZE;
  const { data, error } = await supabase
    .from("service_listings")
    .select("id,title,slug,status")
    .eq("owner_user_id", viewer.id)
    .order("updated_at", { ascending: false })
    .order("id")
    .range(offset, offset + PAGE_SIZE);
  const status: Record<string, string> = {
    draft: "Borrador / despublicado",
    published: "Publicado",
    archived: "Archivado",
  };
  return (
    <div className="editorial-page">
      <SiteHeader />
      <main className="editorial-container py-16">
        <p className="eyebrow">Tu espacio / Marketplace</p>
        <h1 className="mt-5 text-4xl font-semibold sm:text-6xl">
          Mis servicios
        </h1>
        <div className="editorial-actions">
          <Link className="editorial-primary" href="/mis-servicios/nuevo">
            Publicar un servicio
          </Link>
          <Link className="editorial-secondary" href="/mis-servicios/consultas">
            Consultas privadas ↗
          </Link>
        </div>
        {error ? (
          <CatalogFailure kind={catalogErrorKind(error)} />
        ) : (
          <>
            {data?.length ? (
              <ul className="mt-10 divide-y divide-white/15">
                {data.slice(0, PAGE_SIZE).map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-6 py-7"
                  >
                    <div>
                      <p className="eyebrow">{status[s.status]}</p>
                      <h2 className="mt-3 text-2xl">{s.title}</h2>
                    </div>
                    <div className="flex gap-5">
                      <Link
                        className="editorial-secondary"
                        href={`/mis-servicios/${s.id}/editar`}
                      >
                        Editar
                      </Link>
                      {s.status === "published" && (
                        <Link
                          className="editorial-secondary"
                          href={`/marketplace/${s.slug}`}
                        >
                          Ver ficha ↗
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-12 border-y border-white/15 py-10 text-white/70">
                No hay servicios en esta página. Puedes empezar con un borrador.
              </p>
            )}
            <CatalogPagination
              path="/mis-servicios"
              filters={filters}
              hasNext={(data?.length ?? 0) > PAGE_SIZE}
            />
          </>
        )}
      </main>
    </div>
  );
}
