"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CatalogFilters } from "@/lib/catalogs/filters";
import { AVAILABILITY_LABELS } from "@/lib/profiles/constants";

type Props = {
  filters: CatalogFilters;
  disciplines: readonly string[];
  cities: string[];
  skills: string[];
  active: number;
};

export default function ProfileFilters(props: Props) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const current = dialog.current;
    if (!current) return;
    if (open && !current.open) current.showModal();
    if (!open && current.open) current.close();
  }, [open]);

  return (
    <>
      <aside className="profile-filter-sidebar" aria-label="Filtros de perfiles">
        <div className="profile-filter-heading">
          <h2>Filtros</h2>
          {props.active > 0 && <span>{props.active} activos</span>}
        </div>
        <FilterForm {...props} />
      </aside>

      <button
        type="button"
        className="profile-mobile-filter-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>Filtros {props.active > 0 ? `· ${props.active}` : ""}</span>
        <span aria-hidden="true">☰</span>
      </button>

      <dialog
        ref={dialog}
        className="profile-filter-dialog"
        aria-labelledby="profile-filter-dialog-title"
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className="profile-filter-sheet">
          <header>
            <div>
              <p className="eyebrow">AFINAR RESULTADOS</p>
              <h2 id="profile-filter-dialog-title">Filtros</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar filtros">
              ×
            </button>
          </header>
          <FilterForm {...props} mobile />
        </div>
      </dialog>
    </>
  );
}

function FilterForm({
  filters,
  disciplines,
  cities,
  skills,
  mobile = false,
}: Props & { mobile?: boolean }) {
  return (
    <Form action="/perfiles" className="profile-filter-form" scroll>
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      <FilterSelect
        name="discipline"
        label="Disciplina"
        value={filters.discipline}
        options={disciplines}
        empty="Todas las disciplinas"
      />
      <FilterSelect
        name="city"
        label="Ciudad"
        value={filters.city}
        options={cities}
        empty="Todas las ciudades"
      />
      <label>
        <span>Disponibilidad</span>
        <select name="availability" defaultValue={filters.availability}>
          <option value="">Cualquier disponibilidad</option>
          {Object.entries(AVAILABILITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <FilterSelect
        name="skill"
        label="Skill / especialidad"
        value={filters.skill}
        options={skills}
        empty="Todas las especialidades"
      />
      <div className="profile-filter-actions">
        <button className="editorial-primary" type="submit">
          Aplicar filtros
        </button>
        <Link className="editorial-secondary" href="/perfiles">
          Limpiar
        </Link>
      </div>
      {mobile && <span className="profile-filter-safe-area" aria-hidden="true" />}
    </Form>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
  empty,
}: {
  name: string;
  label: string;
  value: string;
  options: readonly string[];
  empty: string;
}) {
  const values = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label>
      <span>{label}</span>
      <select name={name} defaultValue={value}>
        <option value="">{empty}</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
