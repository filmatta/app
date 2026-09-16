import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { CatalogFailure } from "@/components/catalogs/CatalogControls";
import InquiryForm from "@/components/services/InquiryForm";
import { getPublicService } from "@/lib/services/queries";
import {
  SERVICE_CATEGORIES,
  WORK_MODES,
  servicePrice,
} from "@/lib/services/form";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
export const metadata = { title: "Servicio audiovisual · Marketplace" };
export default async function ServiceDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublicService(slug);
  if (result.ok && !result.service) notFound();
  const viewer = await getViewer(),
    supabase = await createClient();
  const provider = result.ok
    ? await supabase.rpc("get_service_provider", { p_slug: slug })
    : null;
  const ownProfile = viewer
    ? await supabase
        .from("professional_profiles")
        .select("is_public")
        .eq("user_id", viewer.id)
        .maybeSingle()
    : null;
  const owned = viewer
    ? await supabase
        .from("service_listings")
        .select("id")
        .eq("slug", slug)
        .eq("owner_user_id", viewer.id)
        .maybeSingle()
    : null;
  const service = result.ok ? result.service : null;
  return (
    <div
      className="editorial-page"
      style={{ "--vertical-accent": "#A7C4BF" } as CSSProperties}
    >
      <SiteHeader
        contextLink={{ href: "/marketplace", label: "← Servicios" }}
      />
      <main className="editorial-container py-16">
        {!result.ok ? (
          <CatalogFailure kind={result.kind} />
        ) : (
          service && (
            <>
              <p className="eyebrow">
                {
                  SERVICE_CATEGORIES.find((c) => c.value === service.category)
                    ?.label
                }
              </p>
              <h1 className="mt-5 max-w-5xl text-4xl font-semibold tracking-tight sm:text-6xl">
                {service.title}
              </h1>
              <p className="mt-6 text-white/70">
                {service.city || "Sin ciudad indicada"} ·{" "}
                {WORK_MODES.find((m) => m.value === service.work_mode)?.label}
              </p>
              <div className="mt-12 grid gap-12 lg:grid-cols-[2fr_1fr]">
                <section>
                  <h2 className="text-2xl">Qué ofrece</h2>
                  <p className="mt-6 max-w-3xl whitespace-pre-wrap break-words leading-8 text-white/75">
                    {service.description}
                  </p>
                  {service.portfolio_links.length > 0 && (
                    <>
                      <h2 className="mt-10 text-2xl">Portafolio y enlaces</h2>
                      <ul className="mt-4 space-y-3">
                        {service.portfolio_links.map((link, i) => (
                          <li key={i}>
                            <a
                              className="editorial-secondary"
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                            >
                              {link.label} ↗
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
                <aside className="border-t border-white/20 py-6">
                  <p className="eyebrow">Condiciones</p>
                  <p className="mt-5 text-xl">{servicePrice(service)}</p>
                  <p className="mt-4 leading-7 text-white/65">
                    Confirma alcance, fechas y condiciones directamente con el
                    responsable. FILMATTA no cobra ni intermedia este servicio.
                  </p>
                  {provider?.data?.[0] && (
                    <Link
                      className="editorial-secondary mt-5"
                      href={`/perfiles/${provider.data[0].profile_slug}`}
                    >
                      Ver perfil de {provider.data[0].display_name} ↗
                    </Link>
                  )}
                </aside>
              </div>
              <section className="mt-14 border-t border-white/20 py-10">
                <h2 className="text-3xl">Presenta tu consulta.</h2>
                {owned?.data ? (
                  <Link
                    className="editorial-secondary mt-5"
                    href={`/mis-servicios/${owned.data.id}/editar`}
                  >
                    Editar mi servicio
                  </Link>
                ) : !viewer ? (
                  <Link
                    className="editorial-primary mt-5"
                    href={`/login?next=${encodeURIComponent(`/marketplace/${slug}`)}`}
                  >
                    Entrar para contactar
                  </Link>
                ) : ownProfile?.data?.is_public ? (
                  <InquiryForm slug={slug} />
                ) : (
                  <p className="mt-5 max-w-xl leading-7 text-white/70">
                    Publica tu perfil profesional para que el responsable sepa
                    quién consulta.{" "}
                    <Link className="editorial-secondary" href="/mi-perfil">
                      Completar mi perfil ↗
                    </Link>
                  </p>
                )}
              </section>
            </>
          )
        )}
      </main>
    </div>
  );
}
