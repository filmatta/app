"use client";

import { useState } from "react";
import type { CrearItem, CrearSession } from "./model";

type Section = {
  id: string;
  label: string;
  hint: string;
  items: CrearItem[];
};

export default function CrearStructurePanel({
  session,
  items,
  busyItemId,
  onUpdate,
  onDelete,
}: {
  session: CrearSession;
  items: CrearItem[];
  busyItemId: string | null;
  onUpdate: (itemId: string, patch: Partial<Pick<CrearItem, "title" | "content" | "state">>) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
}) {
  const active = items.filter((item) => item.state !== "discarded");
  const structural = (type: CrearItem["type"]) => active.filter((item) => item.type === type && (item.state === "active" || item.state === "canon"));
  const sections: Section[] = [
    { id: "premise", label: "Idea / Premisa", hint: "El corazón de la historia", items: structural("premise") },
    { id: "characters", label: "Personajes", hint: "Quién mueve la historia", items: structural("character") },
    { id: "world", label: "Mundo", hint: "Reglas, lugares y contexto", items: structural("world") },
    { id: "themes", label: "Temas", hint: "Lo que la historia explora", items: structural("theme") },
    { id: "canon", label: "Canon", hint: "Decisiones activas", items: active.filter((item) => item.state === "canon") },
    { id: "maybe", label: "Maybe", hint: "Ideas por decidir", items: active.filter((item) => item.state === "maybe") },
    { id: "pending", label: "Pendientes", hint: "Ideas detectadas", items: active.filter((item) => item.type === "pending" && item.state === "active") },
  ];

  return (
    <div className="crear-structure">
      <header className="crear-structure-head">
        <div><p>ESTRUCTURA VIVA</p><h2>Tu historia</h2></div>
        <span>{active.length}</span>
      </header>
      <p className="crear-structure-intro">Se organiza contigo. Puedes corregir o quitar cualquier elemento.</p>
      <div className="crear-structure-sections">
        {sections.map((section, index) => (
          <StructureSection
            key={section.id}
            section={section}
            fallback={section.id === "premise" && section.items.length === 0 ? session.premise : null}
            initiallyOpen={index < 4 || section.items.length > 0}
            busyItemId={busyItemId}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>
      <p className="crear-structure-footnote">Sólo Canon y los elementos activos pasarán al proyecto.</p>
    </div>
  );
}

function StructureSection({ section, fallback, initiallyOpen, busyItemId, onUpdate, onDelete }: {
  section: Section;
  fallback: string | null;
  initiallyOpen: boolean;
  busyItemId: string | null;
  onUpdate: (itemId: string, patch: Partial<Pick<CrearItem, "title" | "content" | "state">>) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
}) {
  return (
    <details className="crear-structure-section" open={initiallyOpen}>
      <summary>
        <span><strong>{section.label}</strong><small>{section.hint}</small></span>
        <i>{section.items.length || (fallback ? 1 : 0)}</i>
      </summary>
      <div className="crear-structure-list">
        {section.items.map((item) => (
          <StructureItem key={item.id} item={item} busy={busyItemId === item.id} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
        {!section.items.length && fallback && <p className="crear-structure-fallback">{fallback}</p>}
        {!section.items.length && !fallback && <p className="crear-structure-empty">Aún no hay nada aquí.</p>}
      </div>
    </details>
  );
}

function StructureItem({ item, busy, onUpdate, onDelete }: {
  item: CrearItem;
  busy: boolean;
  onUpdate: (itemId: string, patch: Partial<Pick<CrearItem, "title" | "content" | "state">>) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title ?? "");
  const [content, setContent] = useState(item.content);

  if (editing) {
    return (
      <form className="crear-structure-editor" onSubmit={(event) => {
        event.preventDefault();
        const next = content.trim();
        if (!next || busy) return;
        void onUpdate(item.id, { title: title.trim() || null, content: next })
          .then(() => setEditing(false))
          .catch(() => undefined);
      }}>
        <label>Título opcional<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></label>
        <label>Contenido<textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} rows={4} required /></label>
        <div><button type="button" disabled={busy} onClick={() => { setTitle(item.title ?? ""); setContent(item.content); setEditing(false); }}>Cancelar</button><button type="submit" disabled={busy || !content.trim()}>{busy ? "Guardando…" : "Guardar"}</button></div>
      </form>
    );
  }

  return (
    <article className="crear-structure-item" data-state={item.state}>
      <header>{item.title && <strong>{item.title}</strong>}{item.state === "canon" && <span>Canon</span>}{item.state === "maybe" && <span>Maybe</span>}</header>
      <p>{item.content}</p>
      {item.type === "pending" && item.state === "active" && <div className="crear-structure-item-decisions" aria-label="Decidir sobre esta idea">
        <button type="button" disabled={busy} onClick={() => void onUpdate(item.id, { state: "canon" }).catch(() => undefined)}>Canon</button>
        <button type="button" disabled={busy} onClick={() => void onUpdate(item.id, { state: "maybe" }).catch(() => undefined)}>Maybe</button>
        <button type="button" disabled={busy} onClick={() => void onUpdate(item.id, { state: "discarded" }).catch(() => undefined)}>Descartar</button>
      </div>}
      <div className="crear-structure-item-actions">
        <button type="button" disabled={busy} onClick={() => setEditing(true)}>Editar</button>
        <button type="button" disabled={busy} onClick={() => void onDelete(item.id)}>{busy ? "Quitando…" : "Quitar"}</button>
      </div>
    </article>
  );
}
