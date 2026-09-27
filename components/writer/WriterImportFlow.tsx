"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SCREENPLAY_KINDS, WRITER_SCHEMA_VERSION, type ScreenplayKind } from "@/lib/writer/document";
import {
  PENDING_WRITER_IMPORT_ADAPTERS,
  analyzePastedWriterText,
  analyzeWriterFdx,
  analyzeWriterTxt,
  changeWriterImportKind,
  validateWriterImportFile,
  writerImportPreservesSignificantText,
  writerImportSummary,
  writerImportToDocument,
  type WriterImportBlock,
  type WriterImportStaging,
} from "@/lib/writer/import";

const KIND_LABELS: Record<ScreenplayKind, string> = {
  sceneHeading: "Escena",
  action: "Acción",
  character: "Personaje",
  dialogue: "Diálogo",
  parenthetical: "Acotación",
  transition: "Transición",
  authorNote: "Nota del autor",
};

type Filter = "all" | "review" | ScreenplayKind;

export default function WriterImportFlow({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [pastedText, setPastedText] = useState("");
  const [staging, setStaging] = useState<WriterImportStaging | null>(null);
  const [title, setTitle] = useState("Borrador importado");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkKind, setBulkKind] = useState<ScreenplayKind>("action");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => staging ? writerImportSummary(staging.blocks) : null, [staging]);
  const filtered = useMemo(() => {
    if (!staging) return [];
    if (filter === "all") return staging.blocks;
    if (filter === "review") return staging.blocks.filter((block) => block.confidence !== "high" || !block.proposedKind);
    return staging.blocks.filter((block) => block.proposedKind === filter);
  }, [filter, staging]);

  function startReview(next: WriterImportStaging) {
    if (!writerImportPreservesSignificantText(next)) {
      setError("La verificación de integridad del texto falló. No se continuará con esta importación.");
      return;
    }
    setStaging(next);
    setTitle(next.suggestedTitle);
    setSelected(new Set());
    setFilter(next.blocks.some((block) => !block.proposedKind) ? "review" : "all");
    setError(null);
  }

  function analyzePaste() {
    try {
      startReview(analyzePastedWriterText(pastedText, title));
    } catch (cause) {
      setError(importError(cause));
    }
  }

  async function analyzeFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const format = validateWriterImportFile(file);
      const contents = await file.text();
      startReview(format === "txt"
        ? analyzeWriterTxt(contents, file.name)
        : analyzeWriterFdx(contents, file.name));
    } catch (cause) {
      setError(importError(cause));
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  function setBlockKind(block: WriterImportBlock, kind: ScreenplayKind) {
    if (!staging) return;
    setStaging({ ...staging, blocks: changeWriterImportKind(staging.blocks, new Set([block.id]), kind) });
  }

  function applyBulk() {
    if (!staging || selected.size === 0) return;
    setStaging({ ...staging, blocks: changeWriterImportKind(staging.blocks, selected, bulkKind) });
    setSelected(new Set());
  }

  function importUnresolvedAsAction() {
    if (!staging) return;
    const unresolved = new Set(staging.blocks.filter((block) => !block.proposedKind).map((block) => block.id));
    setStaging({ ...staging, blocks: changeWriterImportKind(staging.blocks, unresolved, "action") });
    setSelected(new Set());
  }

  async function confirmImport() {
    if (!staging) return;
    setBusy(true);
    setError(null);
    try {
      const document = writerImportToDocument(staging.blocks);
      const cleanTitle = title.trim();
      if (!cleanTitle) throw new Error("Escribe un título para el nuevo guion.");
      const response = await fetch("/api/writer/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          title: cleanTitle.slice(0, 160),
          document,
          schemaVersion: WRITER_SCHEMA_VERSION,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "No se pudo crear el guion importado.");
      router.push(`/writer/${payload.script.id}?imported=1`);
    } catch (cause) {
      setError(importError(cause));
      setBusy(false);
    }
  }

  return (
    <div className="writer-import-shell" role="dialog" aria-modal="true" aria-labelledby="writer-import-title">
      <header className="writer-import-header">
        <div>
          <p className="writer-eyebrow">Import Foundation V0</p>
          <h2 id="writer-import-title">Importar borrador</h2>
          <p>{staging ? "Revisa cada decisión antes de crear un guion nuevo." : "El archivo se analiza localmente y nunca modifica el original."}</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy}>Cerrar</button>
      </header>

      {!staging ? (
        <div className="writer-import-source">
          <div className="writer-import-tabs" role="tablist" aria-label="Origen del borrador">
            <button type="button" role="tab" aria-selected={mode === "paste"} onClick={() => setMode("paste")}>Texto pegado</button>
            <button type="button" role="tab" aria-selected={mode === "file"} onClick={() => setMode("file")}>Archivo TXT o FDX</button>
          </div>
          <label>
            Título del nuevo guion
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
          </label>
          {mode === "paste" ? (
            <label>
              Texto del borrador
              <textarea
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                rows={16}
                placeholder={"INT. CASA - DÍA\n\nCAROLINA\nNo podemos esperar más."}
                spellCheck={false}
              />
              <small>{pastedText.length.toLocaleString("es-MX")} caracteres · no se corrige ortografía ni mayúsculas</small>
            </label>
          ) : (
            <div className="writer-import-file">
              <label htmlFor="writer-import-file">Selecciona un archivo</label>
              <input
                ref={fileInputRef}
                id="writer-import-file"
                type="file"
                accept=".txt,.fdx,text/plain,application/xml,text/xml"
                onChange={(event) => void analyzeFile(event.target.files?.[0] ?? null)}
                disabled={busy}
              />
              <p>Máximo 5 MB. Se comprueba extensión, tipo observable y contenido antes de clasificar.</p>
            </div>
          )}
          <aside className="writer-import-privacy">
            <strong>Procesamiento local</strong>
            <p>No se usa IA, OCR ni servicios de conversión. El contenido permanece en memoria hasta confirmar la creación.</p>
            <p>DOCX y PDF no se anuncian como compatibles en esta V0: {PENDING_WRITER_IMPORT_ADAPTERS.map((adapter) => adapter.format.toUpperCase()).join(" y ")} quedan pendientes de un extractor local acotado.</p>
          </aside>
          {error && <p className="writer-feedback writer-feedback--error" role="alert">{error}</p>}
          <div className="writer-import-actions">
            <button type="button" onClick={onClose}>Cancelar</button>
            {mode === "paste" && (
              <button className="writer-primary-button" type="button" onClick={analyzePaste} disabled={busy || !pastedText.trim()}>
                Analizar texto
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="writer-import-review">
          <section className="writer-import-integrity" aria-label="Integridad de extracción">
            <div><strong>{staging.source.words.toLocaleString("es-MX")}</strong><span>palabras extraídas</span></div>
            <div><strong>{staging.source.significantCharacters.toLocaleString("es-MX")}</strong><span>caracteres significativos representados</span></div>
            <div><strong>{summary?.total.toLocaleString("es-MX")}</strong><span>elementos en staging</span></div>
            <div className={summary?.needsReview ? "needs-review" : "is-ready"}><strong>{summary?.needsReview}</strong><span>decisiones por confirmar</span></div>
          </section>

          <section className="writer-import-summary" aria-label="Resumen detectado">
            {SCREENPLAY_KINDS.map((kind) => (
              <button key={kind} type="button" aria-pressed={filter === kind} onClick={() => setFilter(kind)}>
                <strong>{summary?.byKind[kind] ?? 0}</strong><span>{KIND_LABELS[kind]}</span>
              </button>
            ))}
          </section>

          <div className="writer-import-controls">
            <div className="writer-import-filters" role="group" aria-label="Filtrar elementos">
              <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todos</button>
              <button type="button" aria-pressed={filter === "review"} onClick={() => setFilter("review")}>Revisar ({summary?.needsReview ?? 0})</button>
            </div>
            <div className="writer-import-bulk">
              <span>{selected.size} seleccionados</span>
              <select aria-label="Tipo para selección" value={bulkKind} onChange={(event) => setBulkKind(event.target.value as ScreenplayKind)}>
                {SCREENPLAY_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
              </select>
              <button type="button" onClick={applyBulk} disabled={!selected.size}>Aplicar</button>
            </div>
          </div>

          <section className="writer-import-list" aria-label="Elementos detectados">
            {filtered.map((block) => (
              <article key={block.id} className={block.confidence !== "high" || !block.proposedKind ? "needs-review" : ""}>
                <label className="writer-import-select">
                  <input
                    type="checkbox"
                    checked={selected.has(block.id)}
                    onChange={() => setSelected((current) => toggle(current, block.id))}
                  />
                  Seleccionar
                </label>
                <div className="writer-import-block-text">
                  <small>Línea {block.sourceStartLine}{block.sourceEndLine !== block.sourceStartLine ? `–${block.sourceEndLine}` : ""}</small>
                  <pre>{block.originalText}</pre>
                  <details>
                    <summary>{block.confidence === "high" ? "Alta" : block.confidence === "medium" ? "Media" : "Revisar"} · ver señales</summary>
                    <ul>{block.signals.map((signal, index) => <li key={`${block.id}-${index}`}>{signal}</li>)}</ul>
                  </details>
                </div>
                <label className="writer-import-kind">
                  Tipo
                  <select value={block.proposedKind ?? ""} onChange={(event) => setBlockKind(block, event.target.value as ScreenplayKind)}>
                    <option value="" disabled>Sin resolver</option>
                    {SCREENPLAY_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
                  </select>
                  {block.proposedKind && block.confidence !== "high" && (
                    <button type="button" onClick={() => setBlockKind(block, block.proposedKind!)}>Confirmar este tipo</button>
                  )}
                </label>
              </article>
            ))}
          </section>

          {error && <p className="writer-feedback writer-feedback--error" role="alert">{error}</p>}
          <footer className="writer-import-footer">
            <label>
              Título del nuevo guion
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
            </label>
            <div>
              <button type="button" onClick={() => { setStaging(null); setSelected(new Set()); setError(null); }} disabled={busy}>Volver al origen</button>
              {(summary?.unresolved ?? 0) > 0 && (
                <button type="button" onClick={importUnresolvedAsAction} disabled={busy}>Importar pendientes como Acción</button>
              )}
              <button
                className="writer-primary-button"
                type="button"
                onClick={() => void confirmImport()}
                disabled={busy || !title.trim() || (summary?.needsReview ?? 0) > 0}
              >
                {busy ? "Creando…" : "Importar al Writer"}
              </button>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}

function toggle(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function importError(cause: unknown) {
  return cause instanceof Error ? cause.message : "No se pudo analizar el borrador.";
}
