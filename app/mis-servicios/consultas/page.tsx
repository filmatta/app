import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { InquiryResponse } from "@/components/services/InquiryForm";
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
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
export const metadata = { title: "Consultas privadas" };
type Inquiry = {
  id: string;
  message: string;
  status: string;
  created_at: string;
  is_recipient: boolean;
  target_title: string;
  target_href: string | null;
  profile_name: string | null;
  profile_slug: string | null;
};
export default async function Inquiries({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!(await getViewer()))
    redirect("/login?next=%2Fmis-servicios%2Fconsultas");
  const filters = parseCatalogFilters(await searchParams),
    supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_catalog_inquiries", {
    p_page: filters.page,
  });
  const rows = (data ?? []) as Inquiry[],
    statuses: Record<string, string> = {
      pending: "Pendiente",
      accepted: "Interés aceptado",
      declined: "Declinada",
      archived: "Archivada",
    };
  return (
    <div className="editorial-page">
      <SiteHeader contextLink={{ href: "/cuenta", label: "← Mi cuenta" }} />
      <main className="editorial-container py-16">
        <p className="eyebrow">Tu espacio / Contacto</p>
        <h1 className="mt-5 text-4xl font-semibold">Consultas privadas</h1>
        <p className="mt-5 max-w-2xl leading-7 text-white/70">
          Consulta inicial y respuesta de interés. Aceptar no crea un contrato
          ni un pago. Vuelve a esta bandeja para comprobar respuestas; no
          enviamos notificaciones por email.
        </p>
        {error ? (
          <CatalogFailure kind={catalogErrorKind(error)} />
        ) : (
          <>
            {rows.length ? (
              <div className="mt-10 divide-y divide-white/15">
                {rows.slice(0, PAGE_SIZE).map((item) => (
                  <article key={item.id} className="py-8">
                    <p className="eyebrow">
                      {item.is_recipient ? "Recibida" : "Enviada"} /{" "}
                      {statuses[item.status]}
                    </p>
                    <h2 className="mt-4 text-2xl">{item.target_title}</h2>
                    <p className="mt-3 text-sm text-white/65">
                      {new Intl.DateTimeFormat("es-MX", {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      }).format(new Date(item.created_at))}{" "}
                      ·{" "}
                      {item.profile_slug ? (
                        <Link
                          className="underline underline-offset-4"
                          href={`/perfiles/${item.profile_slug}`}
                        >
                          {item.profile_name}
                        </Link>
                      ) : (
                        "Perfil no disponible"
                      )}
                    </p>
                    <p className="mt-5 max-w-3xl whitespace-pre-wrap break-words leading-7 text-white/75">
                      {item.message}
                    </p>
                    {item.target_href && (
                      <Link
                        className="editorial-secondary mt-4"
                        href={item.target_href}
                      >
                        Ver ficha ↗
                      </Link>
                    )}
                    {item.is_recipient && <InquiryResponse id={item.id} />}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-12 border-y border-white/15 py-10 text-white/70">
                Todavía no tienes consultas.
              </p>
            )}
            <CatalogPagination
              path="/mis-servicios/consultas"
              filters={filters}
              hasNext={rows.length > PAGE_SIZE}
            />
          </>
        )}
      </main>
    </div>
  );
}
