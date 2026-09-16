import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getProfileCatalog } from "@/lib/profiles/catalog";
import {
  AVAILABILITY_LABELS,
  PROFILE_DISCIPLINES,
} from "@/lib/profiles/constants";
import { parseCatalogFilters, type SearchParams } from "@/lib/catalogs/filters";
import {
  CatalogFailure,
  CatalogFiltersForm,
  CatalogPagination,
} from "./CatalogControls";

export default async function ProfileCatalog({
  searchParams,
  talent = false,
}: {
  searchParams: Promise<SearchParams>;
  talent?: boolean;
}) {
  const filters = parseCatalogFilters(await searchParams);
  const result = await getProfileCatalog(filters, talent);
  const path = talent ? "/talento" : "/perfiles";
  const disciplines = talent ? ["Actuación", "Modelaje"] : PROFILE_DISCIPLINES;
  return (
    <div className="editorial-page">
      <SiteHeader />
      <main className="editorial-container py-14 sm:py-20">
        <p className="eyebrow">FILMATTA / {talent ? "Talento" : "Perfiles"}</p>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-.04em] sm:text-6xl">
              {talent
                ? "Talento frente a cámara."
                : "Profesionales del audiovisual."}
            </h1>
            <p className="mt-5 max-w-2xl leading-7 text-white/65">
              {talent
                ? "Actuación y modelaje, desde la misma identidad profesional de FILMATTA."
                : "Explora perfiles publicados por disciplina, ciudad y disponibilidad declarada."}
            </p>
          </div>
          <Link className="editorial-secondary" href="/mi-perfil">
            Crear o editar mi perfil ↗
          </Link>
        </div>
        <CatalogFiltersForm
          path={path}
          filters={filters}
          fields={[
            {
              name: "discipline",
              label: "Disciplina",
              options: disciplines.map((value) => ({ value, label: value })),
            },
            { name: "city", label: "Ciudad" },
            {
              name: "availability",
              label: "Disponibilidad",
              options: Object.entries(AVAILABILITY_LABELS).map(
                ([value, label]) => ({ value, label }),
              ),
            },
          ]}
        />
        {!result.ok ? (
          <CatalogFailure kind={result.kind} />
        ) : (
          <>
            {result.profiles.length === 0 ? (
              <div className="border-y border-white/15 py-12">
                <h2 className="text-2xl font-medium">
                  No hay perfiles para esta selección.
                </h2>
                <p className="mt-3 text-white/65">
                  Prueba otra disciplina o ciudad, o vuelve al catálogo
                  completo.
                </p>
                <Link className="editorial-secondary mt-4" href={path}>
                  Ver todos
                </Link>
              </div>
            ) : (
              <div className="grid gap-x-8 md:grid-cols-2 lg:grid-cols-3">
                {result.profiles.map((profile) => (
                  <Link
                    key={profile.slug}
                    href={`/perfiles/${profile.slug}`}
                    className="group border-t border-white/20 py-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B9DCEB]"
                  >
                    <p className="eyebrow">{profile.disciplines.join(" / ")}</p>
                    <h2 className="mt-5 text-3xl font-medium tracking-tight group-hover:text-[#B9DCEB]">
                      {profile.display_name}
                    </h2>
                    <p className="mt-3 text-sm text-white/65">
                      {profile.city || "Ciudad no indicada"} ·{" "}
                      {AVAILABILITY_LABELS[profile.availability]}
                    </p>
                    {profile.bio && (
                      <p className="mt-5 line-clamp-3 leading-7 text-white/65">
                        {profile.bio}
                      </p>
                    )}
                    <span className="mt-7 inline-block text-sm text-[#B9DCEB]">
                      Ver trabajo y experiencia ↗
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <CatalogPagination
              path={path}
              filters={filters}
              hasNext={result.hasNext}
            />
          </>
        )}
      </main>
    </div>
  );
}
