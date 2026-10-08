"use client";

import { useState } from "react";
import { createResourceAction, updateResourceAction } from "@/app/production/actions";
import type { ActionResult, ProductionResource, ProductionWorkspaceData } from "@/lib/production/types";

type CatalogKind = "location" | "person";
type ResourceFields = {
  name: string;
  contact: string;
  address: string;
  availabilityNotes: string;
  notes: string;
  role: string;
  phone: string;
  includeInCallSheet: boolean;
};

export type ProductionCatalogMutate = <T>(
  key: string,
  operation: Promise<ActionResult<T>>,
  after?: () => void,
) => Promise<boolean>;

export type ProductionCatalogProps = {
  data: ProductionWorkspaceData;
  mutate: ProductionCatalogMutate;
  busyKey: string | null;
};

const copy = {
  location: {
    eyebrow: "LOCACIONES DE PRODUCCIÓN",
    heading: "Directorio de locaciones",
    description: "Direcciones, contactos e indicaciones disponibles para el plan de rodaje.",
    add: "Nueva locación",
    search: "Buscar locaciones",
    emptyTitle: "Aún no hay locaciones",
    emptyBody: "Añade la primera locación para que el equipo encuentre su dirección y sus indicaciones en un solo lugar.",
    noun: "locación",
    plural: "locaciones",
  },
  person: {
    eyebrow: "CONTACTOS DE PRODUCCIÓN",
    heading: "Agenda de contactos",
    description: "Personas y datos de contacto asociados a esta producción.",
    add: "Nuevo contacto",
    search: "Buscar contactos",
    emptyTitle: "Aún no hay contactos",
    emptyBody: "Añade a una persona para tener su dato de contacto y notas a mano durante la planificación.",
    noun: "contacto",
    plural: "contactos",
  },
} as const;

export function LocationCatalog({ createRequest = 0, ...props }: ProductionCatalogProps & { createRequest?: number }) {
  return <Catalog key={createRequest} kind="location" initialCreateOpen={createRequest > 0} {...props} />;
}

export function ContactCatalog(props: ProductionCatalogProps) {
  return <Catalog kind="person" {...props} />;
}

function Catalog({ kind, data, mutate, busyKey, initialCreateOpen = false }: ProductionCatalogProps & { kind: CatalogKind; initialCreateOpen?: boolean }) {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [editingId, setEditingId] = useState<string | null>(null);
  const labels = copy[kind];
  const entries = data.resources.filter((resource) => resource.resourceType === kind);
  const search = query.trim().toLocaleLowerCase("es");
  const visible = entries.filter((resource) =>
    [resource.name, resource.address, resource.contact, resource.notes, resource.availabilityNotes, resource.role, resource.phone]
      .some((value) => value?.toLocaleLowerCase("es").includes(search)),
  );

  function create(fields: ResourceFields, form: HTMLFormElement) {
    void mutate(
      `catalog-create-${kind}`,
      createResourceAction({
        productionId: data.production.id,
        resourceType: kind,
        ...fields,
      }),
      () => {
        form.reset();
        setQuery("");
        setCreateOpen(false);
      },
    );
  }

  function update(resource: ProductionResource, fields: ResourceFields) {
    void mutate(
      `catalog-update-${resource.id}`,
      updateResourceAction({
        productionId: data.production.id,
        resourceId: resource.id,
        expectedRevision: resource.revision,
        resourceType: kind,
        ...fields,
      }),
      () => setEditingId(null),
    );
  }

  return (
    <section className="production-catalog" aria-label={labels.heading}>
      <header className="production-catalog-header">
        <div>
          <p className="production-catalog-eyebrow">{labels.eyebrow}</p>
          <h2>{labels.heading}</h2>
          <p className="production-catalog-description">{labels.description}</p>
        </div>
        <button
          type="button"
          className="production-catalog-button is-primary"
          aria-expanded={createOpen}
          onClick={() => {
            setEditingId(null);
            setCreateOpen((open) => !open);
          }}
        >
          {createOpen ? "Cerrar" : `＋ ${labels.add}`}
        </button>
      </header>

      {createOpen && (
        <div className="production-catalog-editor">
          <div className="production-catalog-editor-heading">
            <span>REGISTRO NUEVO</span>
            <strong>{labels.add}</strong>
          </div>
          <ResourceForm
            kind={kind}
            busy={busyKey !== null}
            submitLabel={`Guardar ${labels.noun}`}
            onSubmit={create}
            onCancel={() => setCreateOpen(false)}
          />
        </div>
      )}

      <div className="production-catalog-toolbar">
        <label className="production-catalog-search">
          <span className="production-catalog-search-icon" aria-hidden="true">⌕</span>
          <span className="sr-only">{labels.search}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.search}
            aria-label={labels.search}
          />
        </label>
        <span className="production-catalog-count" aria-live="polite">{visible.length} de {entries.length}</span>
      </div>

      {visible.length ? (
        <div className="production-catalog-grid">
          {visible.map((resource) => (
            <article className="production-catalog-card" key={resource.id}>
              <div className="production-catalog-card-top">
                <div className="production-catalog-marker" aria-hidden="true">{kind === "location" ? "⌖" : "○"}</div>
                <span>{kind === "location" ? "LOCACIÓN" : "PERSONA"}</span>
                <button
                  type="button"
                  className="production-catalog-button"
                  aria-expanded={editingId === resource.id}
                  onClick={() => {
                    setCreateOpen(false);
                    setEditingId((id) => id === resource.id ? null : resource.id);
                  }}
                >
                  {editingId === resource.id ? "Cerrar" : "Editar"}
                </button>
              </div>
              <h3>{resource.name}</h3>
              <dl className="production-catalog-facts">
                {kind === "person" && resource.role && <div><dt>Rol</dt><dd>{resource.role}</dd></div>}
                {kind === "location" && (
                  <div>
                    <dt>Dirección</dt>
                    <dd>{resource.address || "Pendiente"}</dd>
                  </div>
                )}
                <div>
                  <dt>Contacto</dt>
                  <dd>{resource.contact || "Pendiente"}</dd>
                </div>
                {kind === "person" && resource.phone && <div><dt>Teléfono</dt><dd>{resource.phone}</dd></div>}
                {kind === "person" && resource.includeInCallSheet && <div><dt>Call Sheet</dt><dd>Incluir en hoja de llamado</dd></div>}
                {kind === "location" && resource.availabilityNotes && (
                  <div>
                    <dt>Disponibilidad</dt>
                    <dd>{resource.availabilityNotes}</dd>
                  </div>
                )}
                {resource.notes && (
                  <div>
                    <dt>{kind === "location" ? "Indicaciones y notas" : "Notas"}</dt>
                    <dd>{resource.notes}</dd>
                  </div>
                )}
              </dl>
              {editingId === resource.id && (
                <div className="production-catalog-card-editor">
                  <ResourceForm
                    key={`${resource.id}-${resource.revision}`}
                    kind={kind}
                    resource={resource}
                    busy={busyKey !== null}
                    submitLabel="Guardar cambios"
                    onSubmit={(fields) => update(resource, fields)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="production-directory-empty">
          <span aria-hidden="true">{kind === "location" ? "⌖" : "○"}</span>
          <h3>{entries.length ? "No hay resultados" : labels.emptyTitle}</h3>
          <p>{entries.length ? `No encontramos ${labels.plural} para “${query.trim()}”.` : labels.emptyBody}</p>
          {entries.length > 0 && <button type="button" className="production-catalog-button" onClick={() => setQuery("")}>Limpiar búsqueda</button>}
          {entries.length === 0 && !createOpen && <button type="button" className="production-catalog-button" onClick={() => setCreateOpen(true)}>＋ {labels.add}</button>}
        </div>
      )}
    </section>
  );
}

function ResourceForm({ kind, resource, busy, submitLabel, onSubmit, onCancel }: {
  kind: CatalogKind;
  resource?: ProductionResource;
  busy: boolean;
  submitLabel: string;
  onSubmit: (fields: ResourceFields, form: HTMLFormElement) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="production-catalog-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        onSubmit({
          name: String(values.get("name") ?? "").trim(),
          contact: String(values.get("contact") ?? "").trim(),
          address: kind === "location" ? String(values.get("address") ?? "").trim() : resource?.address ?? "",
          availabilityNotes: kind === "location" ? String(values.get("availability") ?? "").trim() : resource?.availabilityNotes ?? "",
          notes: String(values.get("notes") ?? "").trim(),
          role: kind === "person" ? String(values.get("role") ?? "").trim() : "",
          phone: kind === "person" ? String(values.get("phone") ?? "").trim() : "",
          includeInCallSheet: kind === "person" && values.get("includeInCallSheet") === "on",
        }, form);
      }}
    >
      <label>
        <span>{kind === "location" ? "Nombre de la locación" : "Nombre"} <i>*</i></span>
        <input name="name" required maxLength={160} defaultValue={resource?.name ?? ""} placeholder={kind === "location" ? "Ej. Foro principal" : "Ej. Andrea López"} />
      </label>
      {kind === "location" && (
        <label>
          <span>Dirección</span>
          <input name="address" maxLength={1000} defaultValue={resource?.address ?? ""} placeholder="Calle, número, ciudad" />
        </label>
      )}
      {kind === "person" && <>
        <label><span>Rol / departamento</span><input name="role" maxLength={120} defaultValue={resource?.role ?? ""} placeholder="Ej. Dirección de fotografía" /></label>
        <label><span>Teléfono</span><input name="phone" type="tel" maxLength={60} defaultValue={resource?.phone ?? ""} placeholder="Ej. +52 55 0000 0000" /></label>
        <label className="production-catalog-check"><input type="checkbox" name="includeInCallSheet" defaultChecked={resource?.includeInCallSheet ?? false} /> Incluir en Call Sheet</label>
      </>}
      <label>
        <span>Dato de contacto</span>
        <input name="contact" maxLength={500} defaultValue={resource?.contact ?? ""} placeholder="Teléfono, correo u otra referencia" />
      </label>
      {kind === "location" && (
        <label>
          <span>Disponibilidad declarada</span>
          <textarea name="availability" rows={2} maxLength={2000} defaultValue={resource?.availabilityNotes ?? ""} placeholder="Fechas, horarios o restricciones conocidas" />
        </label>
      )}
      <label>
        <span>{kind === "location" ? "Indicaciones y notas" : "Notas"}</span>
        <textarea name="notes" rows={3} maxLength={4000} defaultValue={resource?.notes ?? ""} placeholder={kind === "location" ? "Acceso, estacionamiento, referencias…" : "Rol, área o contexto de trabajo…"} />
      </label>
      <div className="production-catalog-form-actions">
        <button type="button" className="production-catalog-button" disabled={busy} onClick={onCancel}>Cancelar</button>
        <button type="submit" className="production-catalog-button is-primary" disabled={busy}>{busy ? "Guardando…" : submitLabel}</button>
      </div>
    </form>
  );
}
