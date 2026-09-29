"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SCREENPLAY_KINDS, WRITER_SCHEMA_VERSION, type ScreenplayKind } from "@/lib/writer/document";
import { parseAssistedImportAnalysisStatus } from "@/lib/writer/assisted-import-status";
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
  character: "Personaje — encabezado de diálogo",
  dialogue: "Diálogo",
  parenthetical: "Acotación",
  transition: "Transición",
  authorNote: "Nota del autor",
};

type Filter = "all" | "review" | ScreenplayKind;
type Busy = "basic" | "creating" | "assisted" | null;
type Availability = { enabled: boolean; reason: string | null; operationId?: string; limits?: { maxBytes: number; maxWords: number; maxSourceTokens: number } };

export default function WriterImportFlow({ onClose, beforeCreate }: { onClose: () => void; beforeCreate?: () => Promise<void> }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const operationIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [pastedText, setPastedText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [staging, setStaging] = useState<WriterImportStaging | null>(null);
  const [title, setTitle] = useState("Borrador importado");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkKind, setBulkKind] = useState<ScreenplayKind>("action");
  const [busy, setBusy] = useState<Busy>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>({ enabled: false, reason: "Comprobando disponibilidad…" });

  const summary = useMemo(() => staging ? writerImportSummary(staging.blocks) : null, [staging]);
  const filtered = useMemo(() => {
    if (!staging) return [];
    if (filter === "all") return staging.blocks;
    if (filter === "review") return staging.blocks.filter((block) => block.confidence !== "high" || !block.proposedKind);
    return staging.blocks.filter((block) => block.proposedKind === filter);
  }, [filter, staging]);
  const sourceReady = mode === "paste" ? Boolean(pastedText.trim()) : Boolean(selectedFile);
  const assistedDisabledReason = busy
    ? "Ya hay un proceso en curso."
    : !title.trim()
      ? "Escribe un título para el nuevo guion."
      : !sourceReady
        ? "Añade texto o selecciona un archivo TXT/FDX."
        : availability.enabled ? null : availability.reason;

  useEffect(() => {
    let active = true;
    fetch("/api/writer/imports/assisted", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
      .then(({ response, payload }) => {
        if (!active) return;
        setAvailability(response.ok
          ? { enabled: Boolean(payload.enabled), reason: payload.reason ?? null, operationId: payload.operationId, limits: payload.limits }
          : { enabled: false, reason: payload.error ?? "No se pudo comprobar el cupo asistido." });
      })
      .catch(() => active && setAvailability({ enabled: false, reason: "No se pudo comprobar el cupo asistido." }));
    return () => { active = false; };
  }, []);

  const requestClose = useCallback(() => {
    if (busy === "assisted") return;
    if ((staging || pastedText.trim() || selectedFile)
      && !window.confirm("¿Cerrar la importación? El origen no se ha guardado ni se modificará ningún guion.")) return;
    onClose();
  }, [busy, onClose, pastedText, selectedFile, staging]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, requestClose]);

  function invalidateAnalysis() {
    setStaging(null);
    setSelected(new Set());
    setError(null);
    setStage(null);
    operationIdRef.current = null;
  }

  function startReview(next: WriterImportStaging) {
    if (!writerImportPreservesSignificantText(next)) {
      setError("La verificación de integridad del texto falló. No se continuará con esta importación.");
      return;
    }
    setStaging(next);
    setTitle((current) => current.trim() ? current : next.suggestedTitle);
    setSelected(new Set());
    setFilter(next.blocks.some((block) => !block.proposedKind) ? "review" : "all");
    setError(null);
  }

  async function sourceInput() {
    if (mode === "paste") return { format: "pasted" as const, sourceText: pastedText, fileName: undefined };
    if (!selectedFile) throw new Error("Selecciona un archivo TXT o FDX.");
    const format = validateWriterImportFile(selectedFile);
    return { format, sourceText: await selectedFile.text(), fileName: selectedFile.name };
  }

  async function analyzeBasic() {
    setBusy("basic");
    setError(null);
    setStage("Validando el origen…");
    try {
      const input = await sourceInput();
      setStage("Aplicando las reglas locales…");
      await Promise.resolve();
      startReview(input.format === "pasted"
        ? analyzePastedWriterText(input.sourceText, title)
        : input.format === "txt"
          ? analyzeWriterTxt(input.sourceText, input.fileName!)
          : analyzeWriterFdx(input.sourceText, input.fileName!));
      setStage(null);
    } catch (cause) {
      setError(importError(cause));
      setStage(null);
    } finally {
      setBusy(null);
    }
  }

  async function importAssisted() {
    if (assistedDisabledReason) return;
    setBusy("assisted");
    setError(null);
    setStage("Validando el origen…");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const input = await sourceInput();
      await beforeCreate?.();
      operationIdRef.current ??= availability.operationId ?? crypto.randomUUID();
      setStage("Organizando estructura e identidades…");
      const response = await fetch("/api/writer/imports/assisted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ operationId: operationIdRef.current, title: title.trim().slice(0, 160), ...input }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "No se pudo organizar el borrador con IA.");
      setStage("Comprobando integridad y abriendo Writer…");
      const analysis = parseAssistedImportAnalysisStatus(payload.analysisStatus);
      const identities = Number.isSafeInteger(payload.identities) && payload.identities >= 0 ? payload.identities : 0;
      const recoveryBudgetLimited = payload.recoverySkippedReason === "recovery_budget_unavailable" ? "&recovery=budget" : "";
      router.push(`/writer/${payload.script.id}?imported=ai&analysis=${analysis}&identities=${identities}&observations=${Number(payload.observations ?? 0)}${recoveryBudgetLimited}`);
    } catch (cause) {
      setError(controller.signal.aborted
        ? "La importación se canceló. El origen sigue aquí y no se creó un guion parcial."
        : `${importError(cause)} Puedes conservar el origen e importar sin IA.`);
      setBusy(null);
      setStage(null);
    } finally {
      abortRef.current = null;
    }
  }

  function cancelAssisted() {
    abortRef.current?.abort();
    setStage("Cancelando solicitudes nuevas…");
  }

  function setBlockKind(block: WriterImportBlock, kind: ScreenplayKind) {
    if (!staging) return;
    if (kind === "character" && /[.!?…]/u.test(block.originalText.trim())) {
      const proceed = window.confirm("Este tipo crea un encabezado de diálogo y la línea parece una oración de Acción. Acepta sólo si deseas reemplazar su formato; para reconocer una identidad sin cambiar la frase, importa como Acción y usa Observaciones en Writer.");
      if (!proceed) return;
    }
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

  async function confirmBasicImport() {
    if (!staging) return;
    setBusy("creating");
    setError(null);
    try {
      const document = writerImportToDocument(staging.blocks);
      const cleanTitle = title.trim();
      if (!cleanTitle) throw new Error("Escribe un título para el nuevo guion.");
      await beforeCreate?.();
      operationIdRef.current ??= crypto.randomUUID();
      const response = await fetch("/api/writer/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: operationIdRef.current, title: cleanTitle.slice(0, 160), document, schemaVersion: WRITER_SCHEMA_VERSION }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "No se pudo crear el guion importado.");
      router.push(`/writer/${payload.script.id}?imported=basic`);
    } catch (cause) {
      setError(importError(cause));
      setBusy(null);
    }
  }

  return (
    <div className="writer-import-shell" role="dialog" aria-modal="true" aria-labelledby="writer-import-title">
      <header className="writer-import-header">
        <div>
          <p className="writer-eyebrow">Importación de borradores</p>
          <h2 id="writer-import-title">Importar borrador</h2>
          <p>{staging ? "Ajusta el formato sólo donde lo necesites." : "Crea un guion nuevo sin modificar el archivo ni el documento abierto."}</p>
        </div>
        <button type="button" onClick={requestClose} disabled={busy === "assisted"}>Cerrar</button>
      </header>

      {!staging ? (
        <div className="writer-import-source">
          <div className="writer-import-tabs" role="tablist" aria-label="Origen del borrador">
            <button type="button" role="tab" aria-selected={mode === "paste"} onClick={() => { setMode("paste"); invalidateAnalysis(); }}>Texto pegado</button>
            <button type="button" role="tab" aria-selected={mode === "file"} onClick={() => { setMode("file"); invalidateAnalysis(); }}>Archivo TXT o FDX</button>
          </div>
          <label>Título del nuevo guion<input value={title} onChange={(event) => { setTitle(event.target.value); operationIdRef.current = null; }} maxLength={160} disabled={busy !== null} /></label>
          {mode === "paste" ? (
            <label>
              Texto del borrador
              <textarea value={pastedText} onChange={(event) => { setPastedText(event.target.value); invalidateAnalysis(); }} rows={16} placeholder={"INT. CASA - DÍA\n\nCAROLINA\nNo podemos esperar más."} spellCheck={false} disabled={busy !== null} />
              <small>{pastedText.length.toLocaleString("es-MX")} caracteres · texto, signos y mayúsculas se conservan</small>
            </label>
          ) : (
            <div className="writer-import-file">
              <label htmlFor="writer-import-file">Selecciona un archivo</label>
              <input ref={fileInputRef} id="writer-import-file" type="file" accept=".txt,.fdx,text/plain,application/xml,text/xml" onChange={(event) => { setSelectedFile(event.target.files?.[0] ?? null); invalidateAnalysis(); }} disabled={busy !== null} />
              {selectedFile && <p><strong>Preparado:</strong> {selectedFile.name} · {(selectedFile.size / 1024).toLocaleString("es-MX", { maximumFractionDigits: 1 })} KB</p>}
              <p>Formatos: TXT y FDX. Importación asistida: máximo 2 MiB, 30,000 palabras y 80,000 tokens de origen.</p>
            </div>
          )}
          <aside className="writer-import-privacy">
            <strong>Organización asistida opcional</strong>
            <p>Enviaremos el texto necesario a OpenAI para organizar el borrador e identificar sus elementos. No reescribiremos tu historia.</p>
            <p>La solicitud usa almacenamiento desactivado en la API. FILMATTA conserva decisiones estructuradas y evidencias, no una copia adicional del archivo fuente. También puedes importar sin IA.</p>
            <p>DOCX y PDF siguen pendientes: {PENDING_WRITER_IMPORT_ADAPTERS.map((adapter) => adapter.format.toUpperCase()).join(" y ")} no están disponibles en esta entrega.</p>
          </aside>
          {stage && <p className="writer-import-stage" role="status">{stage}</p>}
          {error && <p className="writer-feedback writer-feedback--error" role="alert">{error}</p>}
          <div className="writer-import-actions writer-import-actions--stacked">
            <div>
              <button type="button" onClick={requestClose} disabled={busy === "assisted"}>Cancelar</button>
              <button type="button" onClick={() => void analyzeBasic()} disabled={busy !== null || !sourceReady || !title.trim()}>{busy === "basic" ? "Preparando…" : "Importar sin IA"}</button>
              <button type="button" onClick={() => void analyzeBasic()} disabled={busy !== null || !sourceReady || !title.trim()}>Ajustar formato manualmente</button>
              {busy === "assisted"
                ? <button type="button" onClick={cancelAssisted}>Detener</button>
                : <button className="writer-primary-button" type="button" onClick={() => void importAssisted()} disabled={Boolean(assistedDisabledReason)}>Importar y organizar</button>}
            </div>
            {assistedDisabledReason && <p className="writer-import-disabled-reason">{assistedDisabledReason}</p>}
          </div>
        </div>
      ) : (
        <div className="writer-import-review">
          <section className="writer-import-integrity" aria-label="Integridad de extracción">
            <div><strong>{staging.source.words.toLocaleString("es-MX")}</strong><span>palabras extraídas</span></div>
            <div><strong>{staging.source.significantCharacters.toLocaleString("es-MX")}</strong><span>caracteres significativos</span></div>
            <div><strong>{summary?.total.toLocaleString("es-MX")}</strong><span>elementos</span></div>
            <div className={summary?.needsReview ? "needs-review" : "is-ready"}><strong>{summary?.needsReview}</strong><span>ajustes pendientes</span></div>
          </section>
          <p className="writer-import-new-document-notice">Modo manual sin IA. Se creará un guion nuevo; el documento actual no se modificará.</p>
          <section className="writer-import-summary" aria-label="Resumen detectado">
            {SCREENPLAY_KINDS.map((kind) => <button key={kind} type="button" aria-pressed={filter === kind} onClick={() => setFilter(kind)}><strong>{summary?.byKind[kind] ?? 0}</strong><span>{KIND_LABELS[kind]}</span></button>)}
          </section>
          <div className="writer-import-controls">
            <div className="writer-import-filters" role="group" aria-label="Filtrar elementos">
              <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todos</button>
              {(summary?.needsReview ?? 0) > 0 && <button type="button" aria-pressed={filter === "review"} onClick={() => setFilter("review")}>Revisar ({summary?.needsReview ?? 0})</button>}
            </div>
            <div className="writer-import-bulk"><span>{selected.size} seleccionados</span><select aria-label="Tipo para selección" value={bulkKind} onChange={(event) => setBulkKind(event.target.value as ScreenplayKind)}>{SCREENPLAY_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}</select><button type="button" onClick={applyBulk} disabled={!selected.size}>Aplicar</button></div>
          </div>
          <section className="writer-import-list" aria-label="Elementos detectados">
            {filtered.map((block) => (
              <article key={block.id} className={block.confidence !== "high" || !block.proposedKind ? "needs-review" : ""}>
                <label className="writer-import-select"><input type="checkbox" checked={selected.has(block.id)} onChange={() => setSelected((current) => toggle(current, block.id))} />Seleccionar</label>
                <div className="writer-import-block-text"><small>Línea {block.sourceStartLine}{block.sourceEndLine !== block.sourceStartLine ? `–${block.sourceEndLine}` : ""}</small><pre>{block.originalText}</pre><details><summary>{block.confidence === "high" ? "Alta" : block.confidence === "medium" ? "Media" : "Revisar"} · ver señales</summary><ul>{block.signals.map((signal, index) => <li key={`${block.id}-${index}`}>{signal}</li>)}</ul></details></div>
                <label className="writer-import-kind">Tipo<select value={block.proposedKind ?? ""} onChange={(event) => setBlockKind(block, event.target.value as ScreenplayKind)}><option value="" disabled>Sin resolver</option>{SCREENPLAY_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}</select>{block.proposedKind && block.confidence !== "high" && <button type="button" onClick={() => setBlockKind(block, block.proposedKind!)}>Confirmar este tipo</button>}</label>
              </article>
            ))}
          </section>
          {error && <p className="writer-feedback writer-feedback--error" role="alert">{error}</p>}
          <footer className="writer-import-footer">
            <label>Título del nuevo guion<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></label>
            <div><button type="button" onClick={invalidateAnalysis} disabled={busy !== null}>Volver al origen</button>{(summary?.unresolved ?? 0) > 0 && <button type="button" onClick={importUnresolvedAsAction} disabled={busy !== null}>Importar pendientes como Acción</button>}<button className="writer-primary-button" type="button" onClick={() => void confirmBasicImport()} disabled={busy !== null || !title.trim() || (summary?.needsReview ?? 0) > 0}>{busy === "creating" ? "Creando…" : "Importar al Writer"}</button></div>
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
