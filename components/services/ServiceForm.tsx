"use client";
import { useActionState, useState } from "react";
import { saveService } from "@/app/mis-servicios/actions";
import {
  SERVICE_CATEGORIES,
  WORK_MODES,
  type EditableService,
} from "@/lib/services/form";
export default function ServiceForm({
  service,
}: {
  service?: EditableService;
}) {
  const [state, action, pending] = useActionState(saveService, { error: "" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [links, setLinks] = useState(
    service?.portfolio_links.length
      ? service.portfolio_links
      : [{ label: "", url: "" }],
  );
  const value = (name: string, fallback = "") =>
    values[name] ??
    String(service?.[name as keyof EditableService] ?? fallback);
  const change = (name: string, newValue: string) =>
    setValues((old) => ({ ...old, [name]: newValue }));
  const selects = [
    {
      name: "category",
      label: "Categoría",
      options: SERVICE_CATEGORIES,
      fallback: "production",
    },
    {
      name: "work_mode",
      label: "Modalidad",
      options: WORK_MODES,
      fallback: "on_site",
    },
    {
      name: "currency",
      label: "Moneda",
      options: [
        { value: "", label: "Sin precio" },
        { value: "MXN", label: "MXN" },
        { value: "USD", label: "USD" },
        { value: "EUR", label: "EUR" },
      ],
      fallback: "",
    },
    {
      name: "status",
      label: "Estado",
      options: [
        { value: "draft", label: "Borrador / despublicado" },
        { value: "published", label: "Publicado" },
        ...(service ? [{ value: "archived", label: "Archivado" }] : []),
      ],
      fallback: "draft",
    },
  ];
  return (
    <form action={action} className="mt-10 max-w-4xl space-y-7">
      {service && <input type="hidden" name="id" value={service.id} />}
      <p className="max-w-2xl leading-7 text-white/70">
        Describe un servicio audiovisual. Al publicar, estos datos serán
        públicos. Mantén email y teléfono fuera de la ficha: las consultas se
        reciben de forma privada en FILMATTA.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        {[
          { name: "title", label: "Título", max: 160 },
          { name: "city", label: "Ciudad", max: 120 },
          {
            name: "indicative_price",
            label: "Precio orientativo (opcional)",
            type: "number",
          },
        ].map((field) => (
          <label key={field.name} className="text-sm">
            {field.label}
            <input
              className="catalog-input mt-2"
              name={field.name}
              required={field.name === "title"}
              type={field.type ?? "text"}
              maxLength={field.max}
              min={field.type === "number" ? 0 : undefined}
              step={field.type === "number" ? "0.01" : undefined}
              value={value(field.name)}
              onChange={(e) => change(field.name, e.target.value)}
            />
          </label>
        ))}
        {selects.map((field) => (
          <div key={field.name} className="text-sm">
            <label htmlFor={`service-${field.name}`}>{field.label}</label>
            <select
              id={`service-${field.name}`}
              className="catalog-input mt-2"
              name={field.name}
              value={value(field.name, field.fallback)}
              onChange={(e) => change(field.name, e.target.value)}
            >
              {field.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <label className="block text-sm">
        Descripción y condiciones
        <textarea
          name="description"
          rows={8}
          maxLength={12000}
          className="catalog-input mt-2"
          value={value("description")}
          onChange={(e) => change("description", e.target.value)}
        />
        <span className="mt-2 block text-white/65">
          Al menos 40 caracteres para publicar. Aclara alcance, entregables y
          qué incluye el precio.
        </span>
      </label>
      <fieldset className="space-y-4">
        <legend className="mb-3 text-xl">Portafolio y enlaces</legend>
        <p className="text-sm text-white/65">
          Hasta seis enlaces HTTPS. No subimos ni procesamos video.
        </p>
        {links.map((link, i) => (
          <div
            key={i}
            className="grid gap-4 border-t border-white/15 pt-4 sm:grid-cols-[1fr_2fr_auto]"
          >
            <label className="text-sm">
              Nombre del enlace {i + 1}
              <input
                className="catalog-input mt-2"
                name={`link_label_${i}`}
                maxLength={80}
                value={link.label}
                onChange={(e) =>
                  setLinks((old) =>
                    old.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label className="text-sm">
              URL del enlace {i + 1}
              <input
                type="url"
                className="catalog-input mt-2"
                name={`link_url_${i}`}
                maxLength={2000}
                placeholder="https://"
                value={link.url}
                onChange={(e) =>
                  setLinks((old) =>
                    old.map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="editorial-secondary self-end"
              onClick={() => setLinks((old) => old.filter((_, j) => j !== i))}
              aria-label={`Quitar enlace ${i + 1}`}
            >
              Quitar
            </button>
          </div>
        ))}
        {links.length < 6 && (
          <button
            type="button"
            className="editorial-secondary"
            onClick={() => setLinks((old) => [...old, { label: "", url: "" }])}
          >
            Añadir enlace
          </button>
        )}
      </fieldset>
      {state.error && (
        <p role="alert" className="text-red-200">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="editorial-primary disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar servicio"}
      </button>
    </form>
  );
}
