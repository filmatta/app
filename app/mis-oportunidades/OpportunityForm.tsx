"use client";
import { useActionState, useState, type ChangeEvent } from "react";
import { saveOpportunity } from "./actions";
import { OPPORTUNITY_CATEGORIES } from "@/lib/opportunities/form";

export type EditableOpportunity = {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  category: string;
  discipline: string | null;
  city: string | null;
  work_mode: string;
  compensation_type: string;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_currency: string | null;
  starts_on: string | null;
  ends_on: string | null;
  application_deadline: string | null;
  status: string;
};
export default function OpportunityForm({
  opportunity,
}: {
  opportunity?: EditableOpportunity;
}) {
  const [state, action, pending] = useActionState(saveOpportunity, {
    error: "",
  });
  // Controlled values survive React's automatic form reset when an action
  // returns a validation or transport error instead of redirecting.
  const [values, setValues] = useState<Record<string, string>>({});
  const fieldValue = (name: string, fallback = "") =>
    values[name] ??
    String(opportunity?.[name as keyof EditableOpportunity] ?? fallback);
  const changeValue = (
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  };
  const fields = [
    { name: "title", label: "Título", max: 160, required: true },
    { name: "summary", label: "Resumen", max: 500 },
    { name: "discipline", label: "Disciplina requerida", max: 120 },
    { name: "city", label: "Ciudad", max: 120 },
    { name: "compensation_min", label: "Presupuesto mínimo", type: "number" },
    { name: "compensation_max", label: "Presupuesto máximo", type: "number" },
    { name: "starts_on", label: "Fecha de inicio", type: "date" },
    { name: "ends_on", label: "Fecha de fin", type: "date" },
    {
      name: "application_deadline",
      label: "Fecha límite (cierre a las 23:59 UTC)",
      type: "date",
    },
  ];
  const selects = [
    {
      name: "category",
      label: "Tipo",
      options: OPPORTUNITY_CATEGORIES,
      initial: "crew",
    },
    {
      name: "work_mode",
      label: "Modalidad",
      options: [
        { value: "on_site", label: "Presencial" },
        { value: "remote", label: "Remoto" },
        { value: "hybrid", label: "Híbrido" },
      ],
      initial: "on_site",
    },
    {
      name: "compensation_type",
      label: "Compensación",
      options: [
        { value: "unspecified", label: "Por definir" },
        { value: "paid", label: "Remunerado" },
        { value: "expenses", label: "Gastos cubiertos" },
        { value: "unpaid", label: "No remunerado" },
      ],
      initial: "unspecified",
    },
    {
      name: "compensation_currency",
      label: "Moneda (sólo si indicas presupuesto)",
      options: [
        { value: "", label: "Sin importe" },
        { value: "MXN", label: "MXN" },
        { value: "USD", label: "USD" },
        { value: "EUR", label: "EUR" },
      ],
      initial: "",
    },
    {
      name: "status",
      label: "Estado",
      options: [
        { value: "draft", label: "Borrador" },
        { value: "published", label: "Publicado" },
        ...(opportunity
          ? [
              { value: "closed", label: "Cerrado" },
              { value: "archived", label: "Archivado" },
            ]
          : []),
      ],
      initial: "draft",
    },
  ];
  return (
    <form action={action} className="mt-10 max-w-4xl">
      {opportunity && <input type="hidden" name="id" value={opportunity.id} />}
      <p className="mb-8 max-w-2xl leading-7 text-white/65">
        Al publicar se hacen visibles la convocatoria y el título del proyecto.
        No incluyas teléfonos, correos ni datos privados. Las postulaciones
        dentro de FILMATTA aún no están disponibles.
      </p>
      {!opportunity && (
        <label className="mb-6 block">
          Título público del proyecto
          <input
            required
            name="project_title"
            value={fieldValue("project_title")}
            onChange={changeValue}
            minLength={3}
            maxLength={160}
            className="catalog-input mt-2"
          />
          <span className="mt-2 block text-sm text-white/60">
            Se crea una ficha mínima para dar contexto a esta convocatoria.
          </span>
        </label>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        {fields.map((field) => {
          const value = fieldValue(field.name);
          return (
            <label className="block text-sm" key={field.name}>
              {field.label}
              <input
                name={field.name}
                type={field.type ?? "text"}
                required={field.required}
                maxLength={field.max}
                min={
                  field.type === "number"
                    ? 0
                    : field.type === "date"
                      ? "2000-01-01"
                      : undefined
                }
                max={field.type === "date" ? "2200-12-31" : undefined}
                step={field.type === "number" ? "0.01" : undefined}
                value={value.slice(0, field.type === "date" ? 10 : undefined)}
                onChange={changeValue}
                className="catalog-input mt-2"
              />
            </label>
          );
        })}
        {selects.map((field) => (
          <div className="text-sm" key={field.name}>
            <label htmlFor={`opportunity-${field.name}`}>{field.label}</label>
            <select
              id={`opportunity-${field.name}`}
              name={field.name}
              value={fieldValue(field.name, field.initial)}
              onChange={changeValue}
              className="catalog-input mt-2"
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <label className="mt-6 block text-sm">
        Brief y requisitos (máximo 20 000 caracteres)
        <textarea
          name="description"
          maxLength={20000}
          rows={9}
          value={fieldValue("description")}
          onChange={changeValue}
          className="catalog-input mt-2"
        />
      </label>
      {state.error && (
        <p
          role="alert"
          className="mt-6 border-l-2 border-red-300 pl-4 leading-7 text-red-200"
        >
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="editorial-primary mt-8 disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar oportunidad"}
      </button>
    </form>
  );
}
