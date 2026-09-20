import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import ProfileFilters from "@/components/profiles/ProfileFilters";
import ProfileCard from "@/components/profiles/ProfileCard";
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
  const filtered = Boolean(
    filters.discipline ||
    filters.city ||
    filters.availability ||
    filters.page > 1,
  );
  return (
    <div className="editorial-page profiles-page">
      <SiteHeader />
      <main className="editorial-container profile-catalog">
        <p className="eyebrow">FILMATTA / {talent ? "Talento" : "Perfiles"}</p>
        <div className="profile-catalog-heading">
          <div>
            <h1>
              {talent
                ? "Presencia. Carácter. Talento."
                : "Personas que hacen cine."}
            </h1>
            <p>
              {talent
                ? "Actuación y modelaje. Conoce su material, su experiencia y su forma de estar frente a cámara."
                : "Una mirada, un oficio, una forma de crear. Encuentra a quienes pueden darle vida a tu próximo proyecto."}
            </p>
          </div>
          <Link className="editorial-secondary" href="/mi-perfil">
            Crear o editar mi perfil ↗
          </Link>
        </div>
        <nav className="profile-catalog-tabs" aria-label="Explorar perfiles">
          <Link href="/perfiles" aria-current={!talent ? "page" : undefined}>
            Profesionales
          </Link>
          <Link href="/talento" aria-current={talent ? "page" : undefined}>
            Talento frente a cámara
          </Link>
        </nav>
        <ProfileFilters
          key={JSON.stringify(filters)}
          active={
            [filters.discipline, filters.city, filters.availability].filter(
              Boolean,
            ).length
          }
        >
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
        </ProfileFilters>
        {!result.ok ? (
          <CatalogFailure kind={result.kind} />
        ) : (
          <>
            {result.profiles.length === 0 ? (
              <section className="profile-empty">
                <p className="eyebrow">
                  {filtered ? "Otra mirada" : "El comienzo de algo propio"}
                </p>
                <h2>
                  {filtered
                    ? "No hay perfiles para esta selección."
                    : talent
                      ? "El próximo rostro puede ser el tuyo."
                      : "Tu trabajo puede abrir esta escena."}
                </h2>
                <p>
                  {filtered
                    ? "Prueba otra disciplina o ciudad, o vuelve al catálogo completo."
                    : "Estamos reuniendo a la comunidad audiovisual. Crea tu perfil, selecciona tu mejor material y comparte tu trabajo."}
                </p>
                <Link
                  className="editorial-secondary"
                  href={filtered ? path : "/mi-perfil"}
                >
                  {filtered ? "Ver todos" : "Crear mi perfil"} ↗
                </Link>
              </section>
            ) : (
              <>
                <div className="profile-results">
                  <p>
                    {result.profiles.length}
                    {result.hasNext ? "+" : ""}{" "}
                    {result.profiles.length === 1
                      ? "perfil en esta página"
                      : "perfiles en esta página"}
                  </p>
                  <p>
                    Material y disponibilidad declarados por cada profesional
                  </p>
                </div>
                <div
                  className={`profile-grid ${talent ? "profile-grid--talent" : ""}`}
                >
                  {result.profiles.map((profile) => (
                    <ProfileCard
                      key={profile.slug}
                      profile={profile}
                      talent={talent}
                    />
                  ))}
                </div>
              </>
            )}
            {(result.profiles.length > 0 || filters.page > 1) && (
              <CatalogPagination
                path={path}
                filters={filters}
                hasNext={result.hasNext}
              />
            )}
          </>
        )}
        <footer className="profile-catalog-footer">
          <p>Tu trabajo también tiene un lugar aquí.</p>
          <Link href="/mi-perfil" className="profile-text-link">
            Presenta tu perfil ↗
          </Link>
        </footer>
      </main>
    </div>
  );
}
