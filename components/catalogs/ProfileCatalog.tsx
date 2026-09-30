import Form from "next/form";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import ProfileFilters from "@/components/profiles/ProfileFilters";
import ProfileCard from "@/components/profiles/ProfileCard";
import {
  getProfileCatalog,
  getProfileSearchFacets,
} from "@/lib/profiles/catalog";
import {
  AVAILABILITY_LABELS,
  PROFILE_DISCIPLINES,
} from "@/lib/profiles/constants";
import { parseCatalogFilters, type SearchParams } from "@/lib/catalogs/filters";
import {
  PROFILE_SEARCH_PARAM_KEYS,
  profileSearchHref,
  type ProfileSearchParam,
} from "@/lib/profiles/search";
import { CatalogFailure, CatalogPagination } from "./CatalogControls";
import "@/components/profiles/profile-search.css";

const FILTER_LABELS: Record<ProfileSearchParam, string> = {
  q: "Búsqueda",
  discipline: "Disciplina",
  city: "Ciudad",
  availability: "Disponibilidad",
  skill: "Especialidad",
};

export default async function ProfileCatalog({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseCatalogFilters(await searchParams);
  const [result, facets] = await Promise.all([
    getProfileCatalog(filters),
    getProfileSearchFacets(),
  ]);
  const activeFilters = PROFILE_SEARCH_PARAM_KEYS.filter((key) => filters[key]);
  const filterCount = activeFilters.filter((key) => key !== "q").length;
  const currentHref = profileSearchHref(filters);

  return (
    <div className="editorial-page profiles-page">
      <SiteHeader />
      <main className="editorial-container profile-catalog">
        <div className="profile-catalog-heading">
          <div>
            <p className="eyebrow">FILMATTA / TALENTO Y PROFESIONALES</p>
            <h1>Encuentra a la persona indicada.</h1>
            <p>
              Explora talento, crew y especialistas audiovisuales por oficio,
              ciudad y disponibilidad.
            </p>
          </div>
          <Link className="editorial-secondary" href="/mi-perfil">
            Crear o editar mi perfil ↗
          </Link>
        </div>

        <Form action="/perfiles" className="profile-search" scroll>
          <label htmlFor="profile-search-query">¿Qué o quién buscas?</label>
          <div>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              id="profile-search-query"
              name="q"
              type="search"
              defaultValue={filters.q}
              maxLength={80}
              placeholder="Nombre, disciplina, especialidad o ciudad"
              autoComplete="off"
            />
            {PROFILE_SEARCH_PARAM_KEYS.filter((key) => key !== "q").map(
              (key) =>
                filters[key] ? (
                  <input key={key} type="hidden" name={key} value={filters[key]} />
                ) : null,
            )}
            <button type="submit">Buscar</button>
          </div>
        </Form>

        {activeFilters.length > 0 && (
          <div className="profile-active-filters" aria-label="Filtros activos">
            {activeFilters.map((key) => (
              <Link key={key} href={profileSearchHref(filters, { [key]: "" })}>
                <span>{FILTER_LABELS[key]}:</span>{" "}
                {key === "availability"
                  ? AVAILABILITY_LABELS[
                      filters[key] as keyof typeof AVAILABILITY_LABELS
                    ]
                  : filters[key]}
                <span aria-hidden="true">×</span>
              </Link>
            ))}
            <Link className="profile-clear-filters" href="/perfiles">
              Limpiar todo
            </Link>
          </div>
        )}

        <div className="profile-search-layout">
          <ProfileFilters
            key={currentHref}
            filters={filters}
            disciplines={PROFILE_DISCIPLINES}
            cities={facets.cities}
            skills={facets.skills}
            active={filterCount}
          />

          <section className="profile-search-results" aria-live="polite">
            {!result.ok ? (
              <CatalogFailure kind={result.kind} retryHref={currentHref} />
            ) : result.profiles.length === 0 ? (
              <section className="profile-empty">
                <p className="eyebrow">
                  {activeFilters.length > 0
                    ? "Amplía la búsqueda"
                    : "El catálogo está comenzando"}
                </p>
                <h2>
                  {activeFilters.length > 0
                    ? "No encontramos perfiles con estos filtros."
                    : "Todavía no hay perfiles publicados."}
                </h2>
                <p>
                  {activeFilters.length > 0
                    ? "Quita uno o varios filtros, o prueba con una búsqueda más amplia."
                    : "Los primeros perfiles públicos aparecerán aquí cuando sus autores decidan publicarlos."}
                </p>
                <div className="profile-empty-actions">
                  {activeFilters.length > 0 && (
                    <Link className="editorial-primary" href="/perfiles">
                      Limpiar filtros
                    </Link>
                  )}
                  <Link className="editorial-secondary" href="/mi-perfil">
                    Crear mi perfil ↗
                  </Link>
                </div>
              </section>
            ) : (
              <>
                <div className="profile-results">
                  <p>
                    <strong>{result.total}</strong>{" "}
                    {result.total === 1 ? "perfil encontrado" : "perfiles encontrados"}
                  </p>
                  <p>Orden estable por relevancia y actualización</p>
                </div>
                <div className="profile-grid">
                  {result.profiles.map((profile) => (
                    <ProfileCard
                      key={profile.slug}
                      profile={profile}
                      returnTo={currentHref}
                    />
                  ))}
                </div>
                <CatalogPagination
                  path="/perfiles"
                  filters={filters}
                  hasNext={result.hasNext}
                />
              </>
            )}
          </section>
        </div>

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
