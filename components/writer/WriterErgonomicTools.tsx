"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WriterDocument, WriterSnapshot } from "@/lib/writer/document";
import { type WriterIdea } from "@/lib/writer/ideas";
import { SmartFeatureIndicator } from "./WriterSmartFormatting";
import { findWriterSmartCandidates, findWriterText, type WriterSearchOptions, type WriterSearchResult, type WriterSearchScope } from "@/lib/writer/search";
import {
  createWriterCheckpoint,
  listWriterCheckpoints,
  loadWriterCheckpoint,
  writerCheckpointLabel,
  type WriterCheckpoint,
} from "@/lib/writer/checkpoints";

type ToolMetrics = {
  inputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  outputTokens: number;
  costMicrousd: number;
  chunks: number;
  scope: WriterSearchScope;
  latencyMs: number;
};

class WriterIdeasClientError extends Error {
  constructor(message: string, readonly code: string | null) { super(message); }
}

export function WriterSearchPanel({
  scriptId,
  document,
  activeSceneId,
  onClose,
  onNavigate,
  onReplace,
  onReplaceAll,
  initialReplace = false,
}: {
  scriptId: string;
  document: WriterDocument;
  activeSceneId: string | null;
  onClose: () => void;
  onNavigate: (result: WriterSearchResult) => void;
  onReplace: (result: WriterSearchResult, replacement: string) => boolean;
  onReplaceAll: (results: WriterSearchResult[], replacement: string) => Promise<number>;
  initialReplace?: boolean;
}) {
  const [tab, setTab] = useState<"find" | "smart">("find");
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(initialReplace);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [scope, setScope] = useState<WriterSearchScope>("document");
  const [index, setIndex] = useState(0);
  const [smartQuery, setSmartQuery] = useState("");
  const [smartResults, setSmartResults] = useState<WriterSearchResult[]>([]);
  const [smartMetrics, setSmartMetrics] = useState<ToolMetrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => findWriterText(document, query, {
    caseSensitive,
    wholeWord,
    scope,
    sceneId: activeSceneId,
  } satisfies WriterSearchOptions), [caseSensitive, document, query, scope, wholeWord, activeSceneId]);
  const currentIndex = results.length ? Math.min(index, results.length - 1) : 0;

  useEffect(() => { inputRef.current?.focus(); }, []);
  function step(delta: number) {
    if (!results.length) return;
    const next = (currentIndex + delta + results.length) % results.length;
    setIndex(next);
    const result = results[next];
    if (result) onNavigate(result);
  }

  async function replaceAll() {
    if (!results.length) return;
    if (!window.confirm(`Se reemplazarán ${results.length} coincidencias. Se creará una versión recuperable antes de continuar.`)) return;
    const count = await onReplaceAll(results, replacement);
    setMessage(`${count} ${count === 1 ? "coincidencia reemplazada" : "coincidencias reemplazadas"}.`);
  }

  async function smartSearch() {
    if (!smartQuery.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    const localResults = findWriterSmartCandidates(document, smartQuery, scope, scope === "scene" ? activeSceneId : null);
    setSmartResults(localResults);
    try {
      const response = await fetch(`/api/writer/scripts/${scriptId}/smart-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: smartQuery, scope, sceneId: scope === "scene" ? activeSceneId : null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "No pudimos completar la búsqueda inteligente.");
      const remoteResults = Array.isArray(data.results) ? data.results : [];
      setSmartResults(remoteResults.length ? remoteResults : localResults);
      setSmartMetrics(data.metrics ?? null);
      if (!remoteResults.length && !localResults.length) setMessage("No encontramos referencias locales suficientemente cercanas.");
    } catch (cause) {
      setSmartResults(localResults);
      setMessage(localResults.length
        ? "Mostramos los resultados lexicales locales porque el endpoint no respondió."
        : cause instanceof Error ? cause.message : "No pudimos completar la búsqueda.");
    } finally {
      setBusy(false);
    }
  }

  return <ToolDialog title="Buscar en Writer" onClose={onClose} className="writer-search-panel">
    <div className="writer-tool-tabs" role="tablist" aria-label="Tipo de búsqueda">
      <button type="button" role="tab" aria-selected={tab === "find"} onClick={() => setTab("find")}>Buscar</button>
      <button type="button" role="tab" aria-selected={tab === "smart"} onClick={() => setTab("smart")}>✦ Búsqueda inteligente</button>
    </div>
    {tab === "find" ? <>
      <label className="writer-tool-field">Buscar
        <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setIndex(0); }} onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); step(event.shiftKey ? -1 : 1); }
        }} placeholder="Texto exacto del guion" />
      </label>
      <div className="writer-search-options">
        <label><input type="checkbox" checked={caseSensitive} onChange={(event) => { setCaseSensitive(event.target.checked); setIndex(0); }} /> Mayúsculas</label>
        <label><input type="checkbox" checked={wholeWord} onChange={(event) => { setWholeWord(event.target.checked); setIndex(0); }} /> Palabra completa</label>
        <ScopeButtons scope={scope} activeSceneId={activeSceneId} onChange={(next) => { setScope(next); setIndex(0); }} />
      </div>
      <div className="writer-search-navigation">
        <span>{results.length ? `${currentIndex + 1} de ${results.length} resultados` : "Sin resultados"}</span>
        <button type="button" onClick={() => step(-1)} disabled={!results.length} aria-label="Resultado anterior">↑ Anterior</button>
        <button type="button" onClick={() => step(1)} disabled={!results.length} aria-label="Resultado siguiente">↓ Siguiente</button>
        <button type="button" onClick={() => setReplaceOpen((value) => !value)} aria-expanded={replaceOpen}>Reemplazar</button>
      </div>
      {replaceOpen && <div className="writer-replace-row">
        <input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="Reemplazar por" aria-label="Reemplazar por" />
        <button type="button" disabled={!results.length} onClick={() => {
          const current = results[currentIndex];
          if (current && onReplace(current, replacement)) setMessage("Coincidencia reemplazada. Puedes deshacerla.");
        }}>Reemplazar</button>
        <button type="button" disabled={!results.length} onClick={() => void replaceAll()}>Reemplazar todos</button>
      </div>}
      <ResultList results={results.slice(Math.max(0, currentIndex - 2), currentIndex + 3)} onNavigate={onNavigate} />
    </> : <>
      <label className="writer-tool-field">Pregunta
        <textarea value={smartQuery} onChange={(event) => setSmartQuery(event.target.value)} rows={3} maxLength={500} placeholder="Ejemplo: ¿En qué parte del guion se tropieza María?" />
      </label>
      <ScopeButtons scope={scope} activeSceneId={activeSceneId} onChange={setScope} />
      <button className="writer-tool-primary" type="button" disabled={busy || !smartQuery.trim()} onClick={() => void smartSearch()}>{busy ? "Buscando…" : "✦ Buscar inteligentemente"}</button>
      <p className="writer-tool-privacy">Preview: índice lexical local, sin llamadas de IA y sin modificar el guion.</p>
      <ResultList results={smartResults} onNavigate={onNavigate} />
      {smartMetrics && <small className="writer-tool-metrics">{smartMetrics.latencyMs} ms · {smartMetrics.chunks} chunks · US$ {(smartMetrics.costMicrousd / 1_000_000).toFixed(2)}</small>}
    </>}
    {message && <p className="writer-tool-message" role="status">{message}</p>}
  </ToolDialog>;
}

export function WriterIdeasPanel({ scriptId, activeSceneId, confirmedRevision, onEnsureCurrentSaved, onNavigate, onThinkTogether }: {
  scriptId: string;
  activeSceneId: string | null;
  confirmedRevision: number;
  onEnsureCurrentSaved: () => Promise<void>;
  onNavigate: (result: WriterSearchResult) => void;
  onThinkTogether: (idea: WriterIdea, scope: WriterSearchScope, sceneId: string | null, sourceRevision: number) => void;
}) {
  const [scope, setScope] = useState<WriterSearchScope>(activeSceneId ? "scene" : "document");
  const [question, setQuestion] = useState("");
  const [ideas, setIdeas] = useState<WriterIdea[]>([]);
  const [sourceRevision, setSourceRevision] = useState<number | null>(null);
  const [sourceContext, setSourceContext] = useState<{ scope: WriterSearchScope; sceneId: string | null } | null>(null);
  const [metrics, setMetrics] = useState<ToolMetrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  async function generate() {
    if (busy || (scope === "scene" && !activeSceneId)) return;
    const requestId = ++requestRef.current;
    setBusy(true);
    setMessage(null);
    setProviderUnavailable(false);
    const requestedScope = scope;
    const requestedSceneId = requestedScope === "scene" ? activeSceneId : null;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await onEnsureCurrentSaved();
      const response = await fetch(`/api/writer/scripts/${scriptId}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: requestedScope,
          sceneId: requestedSceneId,
          question,
          category: null,
          operationId: crypto.randomUUID(),
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new WriterIdeasClientError(
        typeof data.error === "string" ? data.error : "No pudimos preparar ideas.",
        typeof data.code === "string" ? data.code : null,
      );
      if (requestId !== requestRef.current) return;
      setIdeas(Array.isArray(data.ideas) ? data.ideas : []);
      setSourceRevision(Number.isSafeInteger(data.sourceRevision) ? data.sourceRevision : confirmedRevision);
      setSourceContext({ scope: requestedScope, sceneId: requestedSceneId });
      setMetrics(data.metrics ?? null);
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      const next = controller.signal.aborted ? "Generación cancelada." : cause instanceof Error ? cause.message : "No pudimos preparar ideas.";
      setProviderUnavailable(cause instanceof WriterIdeasClientError && cause.code === "provider_unavailable");
      setMessage(next);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (requestId === requestRef.current) setBusy(false);
    }
  }

  const stale = sourceRevision !== null && confirmedRevision > sourceRevision;
  return <section className="writer-ideas-panel writer-ideas-panel--embedded" aria-label="Ideas" aria-busy={busy}>
    <div className="writer-ideas-controls">
      <div>
        <p className="writer-tool-lead">Explora direcciones narrativas sin bloquear el guion. FILMATTA no insertará texto ni escribirá diálogo.</p>
        <ScopeButtons scope={scope} activeSceneId={activeSceneId} onChange={setScope} />
      </div>
      <label className="writer-tool-field">Breve opcional
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} maxLength={500} placeholder="Ejemplo: más tensión sin convertir el encuentro en una pelea" />
      </label>
      {busy ? <button className="writer-tool-primary" type="button" onClick={() => abortRef.current?.abort()}>Cancelar</button>
        : <button className="writer-tool-primary" type="button" disabled={scope === "scene" && !activeSceneId} onClick={() => void generate()}><SmartFeatureIndicator label="Generar ideas" /></button>}
    </div>
    {busy && <p className="writer-ideas-state" role="status">Leyendo la revisión guardada y preparando direcciones distintas…</p>}
    {!busy && !ideas.length && !message && <p className="writer-ideas-state">Elige el alcance; el breve es opcional. Ideas sólo se ejecuta cuando pulsas “Generar ideas”.</p>}
    {ideas.length > 0 && <div className="writer-idea-results">
      {stale && <p className="writer-ideas-stale" role="status">Estas ideas corresponden a la revisión {sourceRevision}; el guion guardado ya está en la revisión {confirmedRevision}.</p>}
      {ideas.map((idea) => <article key={idea.id}>
        <small>{idea.category} · {idea.basis === "source_fact" ? "Hecho del guion" : idea.basis === "interpretation" ? "Lectura posible" : "Idea nueva"}</small><h3>{idea.title}</h3><p>{idea.direction}</p><p><strong>Efecto esperado:</strong> {idea.consequence}</p>
        <div className="writer-idea-actions">
          {idea.references.map((reference) => <button key={reference.id} type="button" className="writer-idea-reference" onClick={() => onNavigate(reference)}>Escena {reference.sceneNumber ?? "—"} · Ver en guion →</button>)}
          <button type="button" onClick={() => onThinkTogether(
            idea,
            sourceContext?.scope ?? scope,
            sourceContext?.sceneId ?? null,
            sourceRevision ?? confirmedRevision,
          )}>Llevar a Guía →</button>
        </div>
      </article>)}
    </div>}
    {metrics && <small className="writer-tool-metrics">{metrics.latencyMs} ms · {metrics.chunks} {metrics.chunks === 1 ? "escena" : "escenas"} · US$ {(metrics.costMicrousd / 1_000_000).toFixed(4)}</small>}
    {message && <p className={`writer-tool-message${providerUnavailable ? " is-unavailable" : ""}`} role={providerUnavailable ? "status" : "alert"}>{message}</p>}
  </section>;
}

export function WriterVersionsPanel({ scriptId, snapshot, revision, onClose, onRestore }: {
  scriptId: string;
  snapshot: WriterSnapshot;
  revision: number;
  onClose: () => void;
  onRestore: (snapshot: WriterSnapshot, checkpoint: WriterCheckpoint) => Promise<void>;
}) {
  const [checkpoints, setCheckpoints] = useState<WriterCheckpoint[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    setBusy(true);
    try { setCheckpoints(await listWriterCheckpoints(scriptId)); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "No pudimos cargar las versiones."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    void listWriterCheckpoints(scriptId).then((items) => {
      if (active) setCheckpoints(items);
    }).catch((cause: unknown) => {
      if (active) setMessage(cause instanceof Error ? cause.message : "No pudimos cargar las versiones.");
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [scriptId]);

  async function createManual() {
    setBusy(true);
    try {
      await createWriterCheckpoint(scriptId, { kind: "manual", label: writerCheckpointLabel("manual", label), snapshot, sourceRevision: revision });
      setLabel("");
      setMessage("Versión creada.");
      await reload();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "No pudimos crear la versión."); setBusy(false); }
  }

  async function restore(checkpoint: WriterCheckpoint) {
    if (!window.confirm(`Restaurar “${checkpoint.label}”? Guardaremos antes una versión del estado actual.`)) return;
    setBusy(true);
    try {
      const restored = await loadWriterCheckpoint(scriptId, checkpoint.id);
      await onRestore(restored, checkpoint);
      setMessage("Versión restaurada. El estado anterior también quedó guardado.");
      await reload();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "No pudimos restaurar la versión."); setBusy(false); }
  }

  return <ToolDialog title="Versiones" onClose={onClose} className="writer-versions-panel">
    <div className="writer-version-create"><input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} placeholder="Antes de cambiar el final (opcional)" aria-label="Nombre de la versión" /><button type="button" disabled={busy} onClick={() => void createManual()}>Crear versión</button></div>
    <p className="writer-tool-privacy">Writer conserva hasta 15 versiones automáticas por documento; las manuales se mantienen aparte.</p>
    <div className="writer-version-list">{busy && !checkpoints.length ? <p>Cargando versiones…</p> : checkpoints.map((checkpoint) => <article key={checkpoint.id}>
      <div><strong>{checkpoint.label}</strong><small>{checkpointKindLabel(checkpoint.kind)} · {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(checkpoint.createdAt))}</small></div>
      <button type="button" disabled={busy} onClick={() => void restore(checkpoint)}>Restaurar</button>
    </article>)}</div>
    {!busy && !checkpoints.length && <p className="writer-tool-message">Todavía no hay versiones guardadas.</p>}
    {message && <p className="writer-tool-message" role="status">{message}</p>}
  </ToolDialog>;
}

function ToolDialog({ title, onClose, className, children }: { title: string; onClose: () => void; className: string; children: React.ReactNode }) {
  return <div className="writer-tool-backdrop" role="presentation"><section className={`writer-tool-panel ${className}`} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label={`Cerrar ${title}`}>×</button></header>{children}</section></div>;
}

function ScopeButtons({ scope, activeSceneId, onChange }: { scope: WriterSearchScope; activeSceneId: string | null; onChange: (scope: WriterSearchScope) => void }) {
  return <div className="writer-tool-scope" role="group" aria-label="Alcance"><button type="button" aria-pressed={scope === "scene"} disabled={!activeSceneId} onClick={() => onChange("scene")}>Esta escena</button><button type="button" aria-pressed={scope === "document"} onClick={() => onChange("document")}>Todo el guion</button></div>;
}

function ResultList({ results, onNavigate }: { results: WriterSearchResult[]; onNavigate: (result: WriterSearchResult) => void }) {
  if (!results.length) return null;
  return <div className="writer-search-results">{results.map((result) => <button key={result.id} type="button" onClick={() => onNavigate(result)}><span>ESCENA {result.sceneNumber ?? "—"} · {result.sceneHeading}</span><q>{result.snippet}</q><small>{result.reason} · Ir al fragmento →</small></button>)}</div>;
}

function checkpointKindLabel(kind: WriterCheckpoint["kind"]) {
  if (kind === "manual") return "Manual";
  if (kind === "before_auto_format") return "Antes de Formato";
  if (kind === "before_replace_all") return "Antes de Reemplazar todos";
  return "Antes de restaurar";
}
