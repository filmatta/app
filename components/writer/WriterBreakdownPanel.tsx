"use client";

/* eslint-disable @next/next/no-img-element -- authenticated image route is intentionally not sent through the public optimizer */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WRITER_BREAKDOWN_CATEGORIES,
  WRITER_BREAKDOWN_CATEGORY_LABELS,
  type WriterBreakdownCategory,
  type WriterBreakdownElement,
} from "@/lib/writer/production";
import { SmartFeatureIndicator } from "./WriterSmartFormatting";

type BreakdownAnalysis = { status: string; stale: boolean; sourceRevision: number; scope: string; errorCode: string | null; model: string; updatedAt: string } | null;

const PRIMARY: Array<{ id: WriterBreakdownCategory; icon: string }> = [
  { id: "character", icon: "◉" }, { id: "prop", icon: "◆" }, { id: "location", icon: "⌂" },
  { id: "wardrobe", icon: "♙" }, { id: "vehicle", icon: "▰" }, { id: "animal", icon: "♢" }, { id: "other", icon: "•••" },
];
const OTHER = new Set<WriterBreakdownCategory>(["extra", "makeup", "practical_effect", "visual_effect", "stunt", "sound_music", "other"]);

export default function WriterBreakdownPanel({
  scriptId,
  activeSceneId,
  characters,
  characterCount,
  onEnsureSaved,
  onNavigate,
}: {
  scriptId: string;
  activeSceneId: string | null;
  characters: React.ReactNode;
  characterCount: number;
  onEnsureSaved: () => Promise<void>;
  onNavigate: (reference: { sceneId: string | null; blockId: string | null; fromOffset: number | null; toOffset: number | null }) => void;
}) {
  const [category, setCategory] = useState<WriterBreakdownCategory>("character");
  const [reviewMode, setReviewMode] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [elements, setElements] = useState<WriterBreakdownElement[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<"scene" | "changed" | "document">("scene");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<BreakdownAnalysis>(null);
  const [loadError, setLoadError] = useState(false);
  const [detectionIssue, setDetectionIssue] = useState<"provider" | "error" | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/writer/scripts/${scriptId}/breakdown`, { cache: "no-store" });
    if (!response.ok) { setLoadError(true); return; }
    const data = await response.json();
    setElements(data.elements ?? []); setPendingCount(Number(data.pendingCount ?? 0)); setAnalysis(data.analysis ?? null); setLoadError(false);
  }, [scriptId]);
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/writer/scripts/${scriptId}/breakdown`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        setElements(data.elements ?? []);
        setPendingCount(Number(data.pendingCount ?? 0));
        setAnalysis(data.analysis ?? null);
        if (!data.analysis) setScope("document");
        setLoadError(false);
      });
    return () => { cancelled = true; };
  }, [scriptId]);
  async function detect(useAi = false) {
    if (busy) return;
    if (useAi && !window.confirm("Ejecutar detección asistida para este ámbito? Sólo se enviarán las escenas seleccionadas y las propuestas quedarán por revisar.")) return;
    setBusy(true); setMessage(null); setDetectionIssue(null);
    try {
      await onEnsureSaved();
      const response = await fetch(`/api/writer/scripts/${scriptId}/breakdown`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: useAi ? "detectAi" : "detect", scope, sceneId: scope === "scene" ? activeSceneId : null, ...(useAi ? { operationId: crypto.randomUUID() } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos detectar el Breakdown.");
      setElements(data.breakdown.elements); setPendingCount(data.breakdown.pendingCount);
      setAnalysis(data.breakdown.analysis ?? { status: "completed", stale: false, sourceRevision: data.revision, scope, errorCode: null, model: useAi ? "provider" : "local-rules-v1", updatedAt: new Date().toISOString() });
      setMessage(useAi ? `${data.candidates?.length ?? 0} propuestas asistidas validadas contra el guion.` : `${data.detected} referencias verificables procesadas con reglas locales.`);
    } catch (cause) { const text = cause instanceof Error ? cause.message : "No pudimos detectar el Breakdown."; setMessage(text); setDetectionIssue(/no está habilitada|proveedor|asistencia/iu.test(text) ? "provider" : "error"); }
    finally { setBusy(false); }
  }
  async function mutate(element: WriterBreakdownElement, body: Record<string, unknown>) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/writer/scripts/${scriptId}/breakdown`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, elementId: element.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos guardar la decisión.");
      setElements(data.breakdown.elements); setPendingCount(data.breakdown.pendingCount);
      if (body.action === "status" && body.status !== "suggested") setSelectedId(null);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "No pudimos guardar la decisión."); }
    finally { setBusy(false); }
  }
  async function addManual() {
    const name = window.prompt("Nombre del elemento");
    if (!name?.trim()) return;
    const selectedCategory = category === "character" ? "other" : category;
    setBusy(true);
    try {
      const response = await fetch(`/api/writer/scripts/${scriptId}/breakdown`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual", category: selectedCategory, name, sceneId: activeSceneId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos añadir el elemento.");
      setElements(data.breakdown.elements); setPendingCount(data.breakdown.pendingCount);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "No pudimos añadir el elemento."); }
    finally { setBusy(false); }
  }
  async function uploadImage(element: WriterBreakdownElement, file: File) {
    setBusy(true); setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file); form.set("targetType", "breakdown"); form.set("targetId", element.id);
      const response = await fetch("/api/writer/production-assets", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos añadir la imagen.");
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "No pudimos añadir la imagen."); }
    finally { setBusy(false); }
  }
  async function removeImage(element: WriterBreakdownElement) {
    if (!element.assetId || !window.confirm("Quitar esta imagen del elemento?")) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/writer/production-assets/${element.assetId}?targetType=breakdown&targetId=${element.id}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? "No pudimos quitar la imagen."); }
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "No pudimos quitar la imagen."); }
    finally { setBusy(false); }
  }

  const visible = useMemo(() => elements.filter((element) => showDismissed
    ? element.status === "dismissed"
    : reviewMode ? element.status === "suggested"
    : category === "other" ? OTHER.has(element.category) && element.status !== "dismissed"
      : element.category === category && element.status !== "dismissed"), [category, elements, reviewMode, showDismissed]);
  const countFor = (id: WriterBreakdownCategory) => id === "character" ? characterCount
    : elements.filter((element) => (id === "other" ? OTHER.has(element.category) : element.category === id) && element.status !== "dismissed").length;

  return <div className="writer-breakdown">
    <div className="writer-breakdown-tabs" role="tablist" aria-label="Categorías de Breakdown">
      {PRIMARY.map((item) => <button key={item.id} type="button" role="tab" aria-selected={!reviewMode && !showDismissed && category === item.id} aria-label={WRITER_BREAKDOWN_CATEGORY_LABELS[item.id]} title={WRITER_BREAKDOWN_CATEGORY_LABELS[item.id]} onClick={() => { setReviewMode(false); setShowDismissed(false); setCategory(item.id); setSelectedId(null); }}><span>{item.icon}</span><b>{countFor(item.id)}</b></button>)}
    </div>
    <div className="writer-breakdown-head"><div><small>BREAKDOWN</small><strong>{showDismissed ? "Descartados" : reviewMode ? "Por revisar" : WRITER_BREAKDOWN_CATEGORY_LABELS[category]} <b>{showDismissed ? visible.length : reviewMode ? pendingCount : countFor(category)}</b></strong></div><div className="writer-breakdown-head-actions"><button type="button" onClick={() => void detect(false)} disabled={busy || (scope === "scene" && !activeSceneId)}><SmartFeatureIndicator label={busy ? "Detectando…" : "Detectar elementos"} /></button><button type="button" onClick={() => { setReviewMode(true); setShowDismissed(false); setSelectedId(null); }} aria-pressed={reviewMode}>Por revisar {pendingCount}</button><details><summary aria-label="Más opciones">···</summary><button type="button" onClick={() => { setReviewMode(false); setShowDismissed(true); setSelectedId(null); }}>Ver descartados ({elements.filter((element) => element.status === "dismissed").length})</button><button type="button" onClick={() => void addManual()} disabled={busy || category === "character"}>Añadir manualmente</button></details></div></div>
    <div className={`writer-breakdown-analysis is-${loadError || detectionIssue ? "error" : busy ? "analyzing" : !analysis ? "never" : analysis.stale ? "stale" : analysis.status === "completed" ? "complete" : "error"}`} role={loadError || detectionIssue ? "alert" : "status"}>{loadError ? "No pudimos cargar el estado de detección." : detectionIssue === "provider" ? "Proveedor o configuración asistida no disponible. La detección local sigue disponible." : detectionIssue === "error" ? "La última detección falló. El inventario anterior permanece intacto." : busy ? "Analizando el ámbito seleccionado…" : !analysis ? "Nunca analizado. Empieza por Todo el guion." : analysis.stale ? "El resultado corresponde a una revisión anterior." : analysis.status === "completed" ? (elements.length ? `Analizado · ${elements.filter((item) => item.status !== "dismissed").length} elementos en inventario.` : "Analizado sin elementos adicionales.") : "La última detección no pudo completarse."}</div>
    {category === "character" && !reviewMode && !showDismissed ? characters : <div className="writer-breakdown-list" role="tabpanel">
      {visible.map((element) => <article key={element.id} className={selectedId === element.id ? "is-selected" : ""}>
        <button className="writer-breakdown-item" type="button" onClick={() => setSelectedId((current) => current === element.id ? null : element.id)}><span className={`writer-breakdown-check is-${element.status}`}>{element.status === "confirmed" ? "✓" : element.status === "suggested" ? "?" : "×"}</span><span><strong>{element.name}</strong><small>{element.status === "confirmed" ? "Confirmado" : element.status === "suggested" ? "Detectado · sin confirmar" : "Descartado"} · {element.appearances.some((item) => item.stale) ? "revisar aparición" : element.appearances.length ? `${element.appearances.length} ${element.appearances.length === 1 ? "aparición" : "apariciones"}` : "sin aparición vinculada"}</small></span><b>Ver</b></button>
        {(reviewMode || (selectedId === element.id && element.status === "suggested")) && <div className="writer-breakdown-review"><p>¿“{element.name}” es {WRITER_BREAKDOWN_CATEGORY_LABELS[element.category].toLocaleLowerCase("es-MX")} de esta escena?</p><blockquote>{element.appearances[0]?.excerpt ?? "Sin fragmento vinculado"}</blockquote><div><button type="button" onClick={() => void mutate(element, { action: "status", status: "confirmed" })}>Sí</button><button type="button" onClick={() => void mutate(element, { action: "status", status: "dismissed" })}>No</button></div></div>}
        {showDismissed && <div className="writer-breakdown-review"><p>Este candidato fue descartado y no reaparecerá en una nueva detección.</p><blockquote>{element.appearances[0]?.excerpt ?? "Sin fragmento vinculado"}</blockquote><div><button type="button" onClick={() => void mutate(element, { action: "status", status: "suggested" })}>Recuperar</button></div></div>}
        {selectedId === element.id && !showDismissed && <div className="writer-breakdown-detail">{element.assetId && <img className="writer-breakdown-thumbnail" src={`/api/writer/production-assets/${element.assetId}`} alt="Referencia visual privada" />}<label>Nombre<input defaultValue={element.name} onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== element.name) void mutate(element, { action: "edit", name }); }} /></label><label>Categoría<select value={element.category} onChange={(event) => void mutate(element, { action: "edit", category: event.target.value })}>{WRITER_BREAKDOWN_CATEGORIES.filter((value) => value !== "character").map((value) => <option key={value} value={value}>{WRITER_BREAKDOWN_CATEGORY_LABELS[value]}</option>)}</select></label><label>Nota<textarea defaultValue={element.note ?? ""} placeholder="Nota de producción" onBlur={(event) => { if (event.target.value !== (element.note ?? "")) void mutate(element, { action: "edit", note: event.target.value }); }} /></label><h4>Apariciones</h4>{element.appearances.length ? <ul>{element.appearances.map((appearance) => <li key={appearance.id}><p>{appearance.excerpt}</p><button type="button" disabled={appearance.stale} onClick={() => onNavigate({ sceneId: appearance.sceneId, blockId: appearance.blockId, fromOffset: appearance.fromOffset, toOffset: appearance.toOffset })}>{appearance.stale ? "Referencia obsoleta" : "Ir al fragmento"}</button></li>)}</ul> : <p>Sin aparición vinculada.</p>}<label className="writer-breakdown-image">{element.assetId ? "Cambiar imagen" : "Añadir imagen"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(element, file); event.target.value = ""; }} /></label>{element.assetId && <button className="writer-breakdown-remove-image" type="button" disabled={busy} onClick={() => void removeImage(element)}>Quitar imagen</button>}</div>}
      </article>)}
      {!visible.length && <div className="writer-sidebar-empty"><p>{showDismissed ? "No hay descartes que recuperar." : reviewMode ? "No hay elementos pendientes." : analysis ? "No hay elementos de esta categoría en el último análisis." : "Esta categoría todavía no fue analizada."}</p>{!analysis && <button type="button" onClick={() => void detect(false)}><SmartFeatureIndicator label="Detectar elementos" /></button>}</div>}
    </div>}
    <div className="writer-breakdown-detect"><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} aria-label="Ámbito del Breakdown"><option value="scene">Escena actual</option><option value="changed">Escenas nuevas/modificadas</option><option value="document">Todo el guion</option></select><button type="button" onClick={() => void detect(true)} disabled={busy || (scope === "scene" && !activeSceneId)} title="Acción explícita; usa IA sólo si está habilitada en este Preview">Detectar con asistencia</button>{message && <p role="status">{message}</p>}</div>
  </div>;
}
