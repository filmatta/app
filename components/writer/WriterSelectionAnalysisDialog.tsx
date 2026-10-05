"use client";

import { useState } from "react";
import type { WriterGuidedSelection, WriterGuidedWritingResponse } from "@/lib/writer/guided-writing";
import { SmartFeatureIndicator } from "./WriterSmartFormatting";

export default function WriterSelectionAnalysisDialog({ selection, currentDocumentHash, busy, onAnalyze, onCancel, onClose, onView }: {
  selection: WriterGuidedSelection;
  currentDocumentHash: string | null;
  busy: boolean;
  onAnalyze: (question: string) => Promise<WriterGuidedWritingResponse | null>;
  onCancel: () => void;
  onClose: () => void;
  onView: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<WriterGuidedWritingResponse | null>(null);
  const [attempted, setAttempted] = useState(false);
  const stale = Boolean(currentDocumentHash && currentDocumentHash !== selection.documentHash);
  return <div className="writer-selection-analysis-backdrop" role="presentation">
    <section className="writer-selection-analysis" role="dialog" aria-modal="true" aria-labelledby="writer-selection-analysis-title">
      <header><div><small>GUÍA · SELECCIÓN</small><h2 id="writer-selection-analysis-title">Analizar selección</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar análisis">×</button></header>
      <blockquote>{selection.text.length > 520 ? `${selection.text.slice(0, 520)}…` : selection.text}</blockquote>
      <small>{selection.blockIds.length} {selection.blockIds.length === 1 ? "bloque" : "bloques"} · {selection.sceneIds.length} {selection.sceneIds.length === 1 ? "escena" : "escenas"} · revisión {selection.sourceRevision}</small>
      {stale && <p className="writer-guided-warning" role="status">El guion cambió desde esta selección. Vuelve a seleccionar el fragmento para evitar analizar el texto equivocado.</p>}
      {!result && <label>Pregunta opcional<textarea value={question} maxLength={1_200} rows={3} onChange={(event) => setQuestion(event.target.value)} placeholder="En blanco: lectura breve del fragmento" disabled={busy || stale} /></label>}
      {result && <div className="writer-selection-analysis-result"><h3>Lectura</h3><p>{result.summary}</p>{result.questions.length > 0 && <><h3>Preguntas útiles</h3><ul>{result.questions.map((item) => <li key={item.id}>{item.text}</li>)}</ul></>}</div>}
      {attempted && !busy && !result && !stale && <p className="writer-guided-warning">No se obtuvo un resultado válido. Puedes reintentar manualmente.</p>}
      <footer>{result ? <><button type="button" onClick={onView}>Ver en guion</button><button type="button" onClick={onClose}>Cerrar</button></> : busy ? <button type="button" onClick={onCancel}>Cancelar</button> : <><button type="button" onClick={onClose}>Cancelar</button><button className="writer-primary-button" type="button" disabled={stale} onClick={async () => { setAttempted(true); setResult(await onAnalyze(question)); }}><SmartFeatureIndicator label="Analizar selección" /></button></>}</footer>
    </section>
  </div>;
}
