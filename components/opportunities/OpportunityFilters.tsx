"use client";

import Link from "next/link";
import { useRef } from "react";
import type { CatalogFilters } from "@/lib/catalogs/filters";
import { OPPORTUNITY_CATEGORIES } from "@/lib/opportunities/form";
import "@/app/oportunidades/opportunities.css";

const WORK_MODES = [
  { value: "on_site", label: "Presencial" },
  { value: "remote", label: "Remoto" },
  { value: "hybrid", label: "Híbrido" },
] as const;

const COMPENSATION_OPTIONS = [
  { value: "paid", label: "Pagado" },
  { value: "collaboration", label: "Colaboración" },
  { value: "unspecified", label: "Por definir" },
] as const;

const SEARCH_FILTER_KEYS = [
  "q",
  "category",
  "city",
  "compensation",
  "workMode",
] as const;

type SearchFilterKey = (typeof SEARCH_FILTER_KEYS)[number];

export default function OpportunityFilters({
  filters,
}: {
  filters: CatalogFilters;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const active = activeFilterEntries(filters);

  return (
    <div className="opportunity-search-controls">
      <form
        action="/oportunidades"
        method="get"
        className="opportunity-search-mobile"
        aria-label="Buscar oportunidades"
      >
        <label htmlFor="opportunity-search-mobile" className="sr-only">
          Buscar por rol, producción o ciudad
        </label>
        <input
          id="opportunity-search-mobile"
          name="q"
          defaultValue={filters.q}
          maxLength={80}
          placeholder="Actriz, videoclip, sonido…"
          className="opportunity-search-input"
        />
        {SEARCH_FILTER_KEYS.filter((key) => key !== "q").map(
          (key) =>
            filters[key] && (
              <input
                key={key}
                type="hidden"
                name={key}
                value={filters[key]}
              />
            ),
        )}
        <button type="submit" className="opportunity-search-submit">
          Buscar
        </button>
      </form>

      <button
        type="button"
        className="opportunity-filter-trigger"
        onClick={() => dialog.current?.showModal()}
      >
        <span>Filtros</span>
        <span aria-hidden="true">{active.length ? active.length : "+"}</span>
      </button>

      <form
        action="/oportunidades"
        method="get"
        className="opportunity-search-desktop"
        aria-label="Buscar y filtrar oportunidades"
      >
        <div className="opportunity-search-field">
          <label htmlFor="opportunity-search">Buscar oportunidades</label>
          <div className="opportunity-search-bar">
            <input
              id="opportunity-search"
              name="q"
              defaultValue={filters.q}
              maxLength={80}
              placeholder="Actriz, videoclip, fotógrafo, Guadalajara…"
              className="opportunity-search-input"
            />
            <button type="submit" className="opportunity-search-submit">
              Buscar
            </button>
          </div>
        </div>
        <FilterFields filters={filters} />
        <div className="opportunity-filter-actions">
          <button type="submit" className="opportunity-apply-button">
            Aplicar filtros
          </button>
          <Link href="/oportunidades" className="opportunity-clear-link">
            Limpiar
          </Link>
        </div>
      </form>

      {active.length > 0 && (
        <nav className="opportunity-active-filters" aria-label="Filtros activos">
          {active.map(({ key, label }) => (
            <Link
              key={key}
              href={filterHref(filters, key)}
              className="opportunity-filter-chip"
              aria-label={`Quitar filtro ${label}`}
            >
              {label} <span aria-hidden="true">×</span>
            </Link>
          ))}
          <Link href="/oportunidades" className="opportunity-clear-all">
            Limpiar todo
          </Link>
        </nav>
      )}

      <dialog
        ref={dialog}
        className="opportunity-filter-dialog"
        aria-labelledby="opportunity-filter-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <form action="/oportunidades" method="get">
          <div className="opportunity-filter-dialog-header">
            <div>
              <p className="opportunity-filter-kicker">Oportunidades</p>
              <h2 id="opportunity-filter-title">Filtros</h2>
            </div>
            <button
              type="button"
              className="opportunity-dialog-close"
              aria-label="Cerrar filtros"
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
          </div>
          {filters.q && <input type="hidden" name="q" value={filters.q} />}
          <div className="opportunity-filter-dialog-fields">
            <FilterFields filters={filters} />
          </div>
          <div className="opportunity-filter-dialog-actions">
            <button type="submit" className="opportunity-apply-button">
              Ver resultados
            </button>
            <Link href="/oportunidades" className="opportunity-clear-link">
              Limpiar filtros
            </Link>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function FilterFields({ filters }: { filters: CatalogFilters }) {
  return (
    <>
      <label className="opportunity-filter-field">
        <span>Categoría</span>
        <select name="category" defaultValue={filters.category}>
          <option value="">Todas</option>
          {OPPORTUNITY_CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="opportunity-filter-field">
        <span>Ciudad</span>
        <input
          name="city"
          defaultValue={filters.city}
          maxLength={80}
          placeholder="Ej. Guadalajara"
        />
      </label>
      <label className="opportunity-filter-field">
        <span>Compensación</span>
        <select name="compensation" defaultValue={filters.compensation}>
          <option value="">Cualquiera</option>
          {COMPENSATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="opportunity-filter-field">
        <span>Modalidad</span>
        <select name="workMode" defaultValue={filters.workMode}>
          <option value="">Cualquiera</option>
          {WORK_MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function activeFilterEntries(filters: CatalogFilters) {
  const labels: Record<SearchFilterKey, string> = {
    q: filters.q ? `“${filters.q}”` : "",
    category:
      OPPORTUNITY_CATEGORIES.find(
        (option) => option.value === filters.category,
      )?.label ?? "",
    city: filters.city ? `Ciudad: ${filters.city}` : "",
    compensation:
      COMPENSATION_OPTIONS.find(
        (option) => option.value === filters.compensation,
      )?.label ?? "",
    workMode:
      WORK_MODES.find((option) => option.value === filters.workMode)?.label ??
      "",
  };

  return SEARCH_FILTER_KEYS.flatMap((key) =>
    filters[key] ? [{ key, label: labels[key] }] : [],
  );
}

function filterHref(filters: CatalogFilters, omitted: SearchFilterKey) {
  const query = new URLSearchParams();
  for (const key of SEARCH_FILTER_KEYS) {
    if (key !== omitted && filters[key]) query.set(key, filters[key]);
  }
  return `/oportunidades${query.size ? `?${query.toString()}` : ""}`;
}
