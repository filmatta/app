"use client";

import { useState } from "react";
import {
  effectiveWriterSceneOoc,
  type WriterNarrativeObservation,
  type WriterSceneAnalysisRecord,
  type WriterSceneAssistantStatus,
  type WriterSceneOverride,
} from "@/lib/writer/script-assistant";

const FIELD_LABELS = { objective: "Objetivo", obstacle: "Obstáculo", change: "Cambio" } as const;
const STATUS_LABELS: Record<WriterSceneAssistantStatus, string> = {
  UNANALYZED: "Sin analizar",
  ANALYZING: "Analizando…",
  FRESH: "Actualizado",
  STALE: "La escena cambió desde el último análisis.",
  PARTIAL: "Análisis parcial",
  ERROR: "No pudimos analizar esta escena ahora.",
};

export default function WriterAssistantNarrative({
  enabled,
  sceneNumber,
  sceneTitle,
  status,
  analysis,
  override,
  observations,
  selectedObservationId,
  feedback,
  onToggle,
  onAnalyze,
  onSaveOverride,
  onDismiss,
  onViewObservation,
}: {
  enabled: boolean;
  sceneNumber: number | null;
  sceneTitle: string | null;
  status: WriterSceneAssistantStatus;
  analysis: WriterSceneAnalysisRecord | null;
  override: WriterSceneOverride | null;
  observations: WriterNarrativeObservation[];
  selectedObservationId: string | null;
  feedback: string | null;
  onToggle: (enabled: boolean) => void;
  onAnalyze: () => void;
  onSaveOverride: (field: keyof typeof FIELD_LABELS, value: string | null) => void;
  onDismiss: (observation: WriterNarrativeObservation) => void;
  onViewObservation: (observation: WriterNarrativeObservation) => void;
}) {
  const [editing, setEditing] = useState<keyof typeof FIELD_LABELS | null>(null);
  const effective = effectiveWriterSceneOoc(analysis?.payload, override);

  return (
    <div className="writer-assistant-narrative">
      <label className="writer-assistant-toggle">
        <span><strong>O-O-C · Por escena</strong><small>Objective, Obstacle y Change de la escena activa guardada.</small></span>
        <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
        <b>{enabled ? "ON" : "OFF"}</b>
      </label>

      {!sceneTitle ? (
        <p className="writer-observations-empty">Coloca el cursor dentro de una escena para ver su análisis.</p>
      ) : (
        <>
          <header className="writer-assistant-scene-heading">
            <div><small>{sceneNumber ? `Escena ${sceneNumber}` : "Escena"}</small><strong>{sceneTitle}</strong></div>
            <span data-status={status.toLocaleLowerCase("en-US")}>{STATUS_LABELS[status]}</span>
          </header>

          {(status === "STALE" || status === "ERROR") && analysis?.payload && (
            <p className="writer-assistant-stale">El análisis anterior se muestra atenuado y no se presenta como vigente.</p>
          )}

          <div className={status === "STALE" ? "writer-assistant-ooc is-stale" : "writer-assistant-ooc"}>
            {(Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).map((field) => {
              const value = effective[field];
              const userDefined = effective.source[field] === "user";
              return (
                <section key={field}>
                  <div><strong>{FIELD_LABELS[field]}</strong><span>{userDefined ? "Definido por ti" : "FILMATTA"}</span></div>
                  {editing === field ? (
                    <OverrideEditor
                      initialValue={value ?? ""}
                      onCancel={() => setEditing(null)}
                      onSave={(next) => { onSaveOverride(field, next); setEditing(null); }}
                    />
                  ) : (
                    <>
                      <p>{value ?? "No está claro."}</p>
                      <div className="writer-assistant-field-actions">
                        <button type="button" onClick={() => setEditing(field)}>{value ? "Editar" : "Definir"}</button>
                        {userDefined && <button type="button" onClick={() => onSaveOverride(field, null)}>Usar FILMATTA</button>}
                      </div>
                    </>
                  )}
                </section>
              );
            })}
          </div>

          <div className="writer-assistant-analyze-row">
            <button type="button" onClick={onAnalyze} disabled={status === "ANALYZING"}>
              {status === "ANALYZING" ? "Analizando…" : status === "UNANALYZED" ? "Analizar escena" : "Actualizar análisis"}
            </button>
            <small>Terra · análisis por escena</small>
          </div>

          <section className="writer-assistant-observations" aria-labelledby="writer-assistant-observations-heading">
            <div className="writer-observations-section-heading"><h3 id="writer-assistant-observations-heading">Observaciones narrativas</h3><span>{observations.length}</span></div>
            {observations.length ? observations.map((observation) => (
              <article
                key={observation.id}
                className={observation.id === selectedObservationId ? "is-selected" : ""}
                data-state={observation.state.toLocaleLowerCase("en-US")}
              >
                <div className="writer-observation-title"><strong>{observation.title}</strong><span>{observation.state === "QUESTION" ? "Pregunta" : observation.state === "INFO" ? "Información" : "Revisar"}</span></div>
                {observation.observation && <p>{observation.observation}</p>}
                {observation.question && <blockquote>{observation.question}</blockquote>}
                <div className="writer-observation-actions">
                  <button type="button" onClick={() => onViewObservation(observation)}>Ver evidencia</button>
                  <button type="button" onClick={() => onDismiss(observation)}>Ignorar</button>
                </div>
              </article>
            )) : <p className="writer-observations-empty">{status === "FRESH" ? "No hay preguntas narrativas para esta escena." : "Analiza la escena para obtener observaciones."}</p>}
          </section>
        </>
      )}
      {feedback && <p className="writer-assistant-feedback" role="status">{feedback}</p>}
    </div>
  );
}

function OverrideEditor({ initialValue, onSave, onCancel }: { initialValue: string; onSave: (value: string | null) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initialValue);
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSave(value.trim() || null); }}>
      <textarea autoFocus value={value} onChange={(event) => setValue(event.target.value)} maxLength={500} rows={3} />
      <div><button type="button" onClick={onCancel}>Cancelar</button><button type="submit">Guardar</button></div>
    </form>
  );
}
