import Link from "next/link";
import { catalogPageHref, type CatalogFilters } from "@/lib/catalogs/filters";
export type FilterField = {
  name: keyof CatalogFilters;
  label: string;
  type?: "date" | "number";
  options?: readonly { value: string; label: string }[];
};

export function CatalogFiltersForm({
  path,
  filters,
  fields,
}: {
  path: string;
  filters: CatalogFilters;
  fields: FilterField[];
}) {
  return (
    <form
      action={path}
      method="get"
      className="catalog-filters"
      aria-label="Filtrar catálogo"
    >
      {fields.map((field) => (
        <div key={field.name} className="min-w-0 text-sm text-white/70">
          <label htmlFor={`catalog-${field.name}`} className="mb-2 block">
            {field.label}
          </label>
          {field.options ? (
            <select
              id={`catalog-${field.name}`}
              name={field.name}
              defaultValue={filters[field.name]}
              className="catalog-input"
            >
              <option value="">Todas las opciones</option>
              {field.options.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`catalog-${field.name}`}
              name={field.name}
              defaultValue={filters[field.name]}
              maxLength={80}
              type={field.type ?? "text"}
              min={
                field.type === "number"
                  ? 0
                  : field.type === "date"
                    ? "2000-01-01"
                    : undefined
              }
              max={
                field.type === "number"
                  ? 9999999999.99
                  : field.type === "date"
                    ? "2200-12-31"
                    : undefined
              }
              step={field.type === "number" ? "0.01" : undefined}
              className="catalog-input"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-5 self-end">
        <button className="editorial-primary" type="submit">
          Filtrar
        </button>
        <Link href={path} className="editorial-secondary">
          Limpiar
        </Link>
      </div>
    </form>
  );
}

export function CatalogPagination({
  path,
  filters,
  hasNext,
}: {
  path: string;
  filters: CatalogFilters;
  hasNext: boolean;
}) {
  return (
    <nav
      className="mt-10 flex flex-wrap items-center justify-between gap-6 border-t border-white/15 pt-6 text-sm text-white/75"
      aria-label="Paginación"
    >
      {filters.page > 1 ? (
        <Link
          className="editorial-secondary"
          href={catalogPageHref(path, filters, filters.page - 1)}
        >
          ← Anterior
        </Link>
      ) : (
        <span />
      )}
      <span>Página {filters.page}</span>
      {hasNext && filters.page < 1000 ? (
        <Link
          className="editorial-secondary"
          href={catalogPageHref(path, filters, filters.page + 1)}
        >
          Siguiente →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function CatalogFailure({ kind }: { kind: "unconfigured" | "error" }) {
  return (
    <div role="status" className="my-12 border-y border-white/15 py-10">
      <h2 className="text-xl font-semibold">
        {kind === "unconfigured"
          ? "Este catálogo todavía no está configurado."
          : "No pudimos cargar el catálogo."}
      </h2>
      <p className="mt-3 max-w-xl leading-7 text-white/65">
        {kind === "unconfigured"
          ? "Estamos preparando su disponibilidad. Vuelve a intentarlo más adelante."
          : "Inténtalo de nuevo en unos minutos. Tus filtros se conservarán en la dirección de esta página."}
      </p>
    </div>
  );
}
