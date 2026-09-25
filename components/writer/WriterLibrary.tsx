"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createWriterBackup, writerFileStem } from "@/lib/writer/export";
import { loadLocalWriterDrafts, type LocalWriterDraft } from "@/lib/writer/storage";

export type WriterListItem = {
  id: string;
  title: string;
  revision: number;
  updated_at: string;
};

export default function WriterLibrary({
  initialScripts,
  limit,
  userId,
}: {
  initialScripts: WriterListItem[];
  limit: number;
  userId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [rename, setRename] = useState<WriterListItem | null>(null);
  const [deleting, setDeleting] = useState<WriterListItem | null>(null);
  const [pendingDeleteDraft, setPendingDeleteDraft] = useState<LocalWriterDraft | null>(null);

  async function createScript() {
    setBusy("create");
    setFeedback(null);
    const response = await fetch("/api/writer/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationId: crypto.randomUUID(), title: "Guion sin título" }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setFeedback(data.error ?? "No se pudo crear el guion.");
      return;
    }
    router.push(`/writer/${data.script.id}`);
  }

  async function duplicateScript(script: WriterListItem) {
    setBusy(`duplicate:${script.id}`);
    setFeedback(null);
    const response = await fetch(`/api/writer/scripts/${script.id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationId: crypto.randomUUID(),
        title: `${script.title} — copia`.slice(0, 160),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setFeedback(data.error ?? "No se pudo duplicar el guion.");
      return;
    }
    router.push(`/writer/${data.script.id}`);
  }

  async function renameScript(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rename) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    setBusy(`rename:${rename.id}`);
    const response = await fetch(`/api/writer/scripts/${rename.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "rename",
        operationId: crypto.randomUUID(),
        expectedRevision: rename.revision,
        title,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setFeedback(data.error ?? "No se pudo renombrar.");
      return;
    }
    setRename(null);
    router.refresh();
  }

  async function deleteScript() {
    if (!deleting) return;
    setBusy(`delete:${deleting.id}`);
    const response = await fetch(`/api/writer/scripts/${deleting.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision: deleting.revision }),
    });
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setFeedback(data.error ?? "No se pudo eliminar.");
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  async function prepareDelete(script: WriterListItem) {
    setDeleting(script);
    setPendingDeleteDraft(null);
    try {
      const drafts = await loadLocalWriterDrafts(location.origin, userId, script.id);
      setPendingDeleteDraft(drafts.find((draft) => draft.pending) ?? null);
    } catch {
      setFeedback("No se pudo comprobar si hay cambios locales pendientes. Abre el guion y exporta un respaldo si es necesario.");
    }
  }

  function exportPendingDeleteDraft() {
    if (!pendingDeleteDraft) return;
    const url = URL.createObjectURL(new Blob([createWriterBackup(pendingDeleteDraft)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${writerFileStem(pendingDeleteDraft.title)}-local.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  return (
    <main className="writer-library">
      <div className="writer-library-heading">
        <div>
          <p className="writer-eyebrow">FILMATTA Writer</p>
          <h1>Mis guiones</h1>
          <p>Un espacio privado para escribir y conservar tu trabajo.</p>
        </div>
        <button
          className="writer-primary-button"
          type="button"
          onClick={createScript}
          disabled={busy !== null || initialScripts.length >= limit}
        >
          {busy === "create" ? "Creando…" : "Crear guion"}
        </button>
      </div>

      <div className="writer-quota" aria-label={`${initialScripts.length} de ${limit} guiones utilizados`}>
        <span>{initialScripts.length} de {limit} guiones</span>
        <span>Writer Foundation</span>
      </div>
      {feedback && <p className="writer-feedback writer-feedback--error" role="alert">{feedback}</p>}

      {initialScripts.length === 0 ? (
        <section className="writer-empty-state">
          <p className="writer-eyebrow">Tu primera página</p>
          <h2>Empieza un guion nuevo.</h2>
          <p>La escritura se guarda localmente y se sincroniza con la nube.</p>
          <button className="writer-primary-button" type="button" onClick={createScript} disabled={busy !== null}>
            Crear guion
          </button>
        </section>
      ) : (
        <section className="writer-script-list" aria-label="Guiones">
          {initialScripts.map((script) => (
            <article className="writer-script-card" key={script.id}>
              <Link href={`/writer/${script.id}`} className="writer-script-card-main">
                <span className="writer-script-icon" aria-hidden="true">W</span>
                <span>
                  <strong>{script.title}</strong>
                  <small>Modificado {formatDate(script.updated_at)}</small>
                </span>
              </Link>
              <div className="writer-script-actions">
                <button type="button" onClick={() => setRename(script)}>Renombrar</button>
                <button type="button" onClick={() => duplicateScript(script)} disabled={busy !== null || initialScripts.length >= limit}>
                  {busy === `duplicate:${script.id}` ? "Duplicando…" : "Duplicar"}
                </button>
                <button className="writer-danger-link" type="button" onClick={() => void prepareDelete(script)}>Eliminar</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {rename && (
        <div className="writer-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setRename(null);
        }}>
          <form className="writer-modal" onSubmit={renameScript} aria-labelledby="writer-rename-title">
            <h2 id="writer-rename-title">Renombrar guion</h2>
            <label htmlFor="writer-rename-input">Título</label>
            <input id="writer-rename-input" name="title" defaultValue={rename.title} maxLength={160} required autoFocus />
            <div className="writer-modal-actions">
              <button type="button" onClick={() => setRename(null)}>Cancelar</button>
              <button className="writer-primary-button" type="submit" disabled={busy !== null}>Guardar</button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="writer-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDeleting(null);
        }}>
          <section className="writer-modal" role="alertdialog" aria-modal="true" aria-labelledby="writer-delete-title">
            <p className="writer-eyebrow">Acción permanente</p>
            <h2 id="writer-delete-title">Eliminar “{deleting.title}”</h2>
            <p>El guion se eliminará de la nube. Esta versión no incluye papelera.</p>
            {pendingDeleteDraft && (
              <div className="writer-local-delete-warning">
                <strong>Hay cambios locales pendientes.</strong>
                <p>Descarga esta copia antes de eliminar si quieres conservarlos.</p>
                <button type="button" onClick={exportPendingDeleteDraft}>Descargar cambios locales</button>
              </div>
            )}
            <div className="writer-modal-actions">
              <button type="button" onClick={() => setDeleting(null)}>Cancelar</button>
              <button className="writer-danger-button" type="button" onClick={deleteScript} disabled={busy !== null}>
                {busy === `delete:${deleting.id}` ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
