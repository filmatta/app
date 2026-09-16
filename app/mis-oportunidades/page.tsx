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
export const metadata = { title: "Mis oportunidades" };
export default async function MyOpportunities({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseCatalogFilters(await searchParams);
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=%2Fmis-oportunidades");
  const supabase = await createClient();
  const offset = (filters.page - 1) * PAGE_SIZE;
  const { data, error } = await supabase
    .from("opportunities")
    .select("id,title,slug,status,updated_at")
    .eq("owner_id", viewer.id)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + PAGE_SIZE);
  const statuses: Record<string, string> = {
    draft: "Borrador",
    published: "Publicado",
    closed: "Cerrado",
    archived: "Archivado",
  };
  return (
    <div className="editorial-page">
      <SiteHeader />
      <main className="editorial-container py-16">
        <p className="eyebrow">Tu espacio / Publicaciones</p>
        <h1 className="mt-5 text-4xl font-semibold sm:text-6xl">
          Mis oportunidades
        </h1>
        <Link
          href="/mis-oportunidades/nueva"
          className="editorial-primary mt-8"
        >
          Publicar oportunidad ↗
        </Link>
        {error ? (
          <CatalogFailure kind={catalogErrorKind(error)} />
        ) : data?.length ? (
          <ul className="mt-10 divide-y divide-white/15">
            {data.slice(0, PAGE_SIZE).map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 py-7"
              >
                <div>
                  <p className="eyebrow">
                    {statuses[item.status] ?? item.status}
                  </p>
                  <h2 className="mt-2 text-2xl">{item.title}</h2>
                </div>
                <div className="flex gap-6">
                  <Link
                    className="editorial-secondary"
                    href={`/mis-oportunidades/${item.id}/editar`}
                  >
                    Editar
                  </Link>
                  {item.status === "published" && (
                    <Link
                      className="editorial-secondary"
                      href={`/oportunidades/${item.slug}`}
                    >
                      Ver ficha
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-12 border-y border-white/15 py-10 text-white/70">
            Todavía no tienes oportunidades. Empieza con un borrador.
          </p>
        )}
        {!error && (
          <CatalogPagination
            path="/mis-oportunidades"
            filters={filters}
            hasNext={(data?.length ?? 0) > PAGE_SIZE}
          />
        )}
      </main>
    </div>
  );
}
