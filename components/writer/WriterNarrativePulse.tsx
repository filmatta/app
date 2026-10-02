"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { PULSE_DIMENSIONS, WRITER_NARRATIVE_PULSE_MIN_SCENES, writerPulseDisplaySeries, writerPulseMilestoneLabel, writerPulsePath, type WriterPulseMilestone, type WriterPulseMilestoneType } from "@/lib/writer/narrative-pulse";
import { useWriterNarrativePulse } from "@/lib/writer/narrative-pulse-client";
import type { TimelineScene } from "@/lib/writer/timeline";
import { SmartFeatureIndicator } from "./WriterSmartFormatting";

const TYPES: WriterPulseMilestoneType[] = ["inciting_incident", "first_turning_point", "midpoint", "crisis", "climax", "resolution", "custom"];

export default function WriterNarrativePulse({ scriptId, scenes, active, expanded = false, analysisEnabled = true, selectedSceneId, columnWidth, scrollRef, onSelectScene, onMilestonesChange, onEnsureCurrentSaved }: {
  scriptId: string; scenes: TimelineScene[]; active: boolean; analysisEnabled?: boolean; selectedSceneId: string | null; columnWidth: number;
  expanded?: boolean;
  scrollRef: RefObject<HTMLDivElement | null>; onSelectScene: (scene: TimelineScene) => void; onMilestonesChange?: (milestones: WriterPulseMilestone[]) => void;
  onEnsureCurrentSaved?: () => Promise<void>;
}) {
  const pulse = useWriterNarrativePulse({ scriptId, enabled: active });
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [selectedPulseSceneId, setSelectedPulseSceneId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualScene, setManualScene] = useState(selectedSceneId ?? scenes[0]?.sourceId ?? "");
  const [manualType, setManualType] = useState<WriterPulseMilestoneType>("custom");
  const [manualLabel, setManualLabel] = useState("");
  const [moveScene, setMoveScene] = useState("");
  const [renameLabel, setRenameLabel] = useState("");
  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "error">("idle");
  const orderedPoints = useMemo(() => scenes.flatMap((scene) => {
    const point = pulse.points.find((item) => item.sceneId === scene.sourceId);
    return point ? [{ scene, point }] : [];
  }), [pulse.points, scenes]);
  const selected = scenes.find((scene) => scene.sourceId === selectedPulseSceneId) ?? null;
  const selectedPoint = pulse.points.find((point) => point.sceneId === selected?.sourceId) ?? null;
  const visibleMilestones = pulse.milestones.filter((item) => item.status !== "dismissed");
  const selectedMilestone = visibleMilestones.find((item) => item.id === selectedMilestoneId) ?? null;
  const current = Boolean(pulse.analysis && pulse.currentSourceHash === pulse.analysis.sourceHash && pulse.analysis.status === "fresh");
  const graphWidth = Math.max(320, scenes.length * columnWidth);
  const graphHeight = expanded ? 320 : 230;
  const displayPoints = useMemo(() => writerPulseDisplaySeries(orderedPoints.map((item) => item.point)), [orderedPoints]);
  const path = writerPulsePath(displayPoints, graphWidth, graphHeight, 24);
  const areaPath = path ? `${path} L${graphWidth - 24},${graphHeight - 24} L24,${graphHeight - 24} Z` : "";

  useEffect(() => { onMilestonesChange?.(pulse.milestones); }, [onMilestonesChange, pulse.milestones]);
  useEffect(() => {
    if (!active || !selectedPulseSceneId) return;
    const clear = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || window.document.querySelector('[role="dialog"]')) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      event.preventDefault(); event.stopPropagation(); setSelectedPulseSceneId(null); setSelectedMilestoneId(null);
    };
    window.addEventListener("keydown", clear, true);
    return () => window.removeEventListener("keydown", clear, true);
  }, [active, selectedPulseSceneId]);
  useEffect(() => {
    if (!active || !selectedSceneId) return;
    const frame = requestAnimationFrame(() => {
      const container = scrollRef.current;
      const target = container?.querySelector<HTMLElement>(`[data-pulse-scene-id="${CSS.escape(selectedSceneId)}"]`);
      if (container && target) container.scrollTo({ left: Math.max(0, target.offsetLeft - container.clientWidth / 2), behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, scrollRef, selectedSceneId]);

  async function createManual() {
    if (!manualScene || !manualLabel.trim()) return;
    if (await pulse.create(manualScene, manualType, manualLabel.trim())) { setManualLabel(""); setManualOpen(false); }
  }

  function selectMilestone(milestone: WriterPulseMilestone) {
    setSelectedMilestoneId(milestone.id);
    setRenameLabel(milestone.label);
  }

  function selectPoint(scene: TimelineScene) {
    setSelectedPulseSceneId(scene.sourceId ?? null);
    onSelectScene(scene);
  }

  async function saveThenAnalyze() {
    if (savePhase === "saving" || pulse.analyzing) return;
    setSavePhase("saving");
    pulse.setFeedback(null);
    try {
      await onEnsureCurrentSaved?.();
      const latest = await pulse.reload();
      if (!latest?.currentSourceHash) throw new Error("missing_hash");
      setSavePhase("idle");
      await pulse.analyze(latest.currentSourceHash);
    } catch {
      setSavePhase("error");
      pulse.setFeedback(null);
    }
  }

  return <div className="writer-pulse" aria-busy={pulse.analyzing || savePhase === "saving"}>
    <section className="writer-pulse-intro">
      <div><p className="timeline-eyebrow">Lectura descriptiva</p><h1>Intensidad narrativa</h1><p>Compara cambios dentro de este guion. No es una puntuación de calidad, ritmo ni estructura.</p></div>
      <div className="writer-pulse-actions">
        {selectedPulseSceneId && <button type="button" onClick={() => { setSelectedPulseSceneId(null); setSelectedMilestoneId(null); }}>Ver todos los hitos</button>}
        {pulse.analyzing ? <button type="button" onClick={pulse.cancel}>Cancelar</button> : <button type="button" disabled={!analysisEnabled || savePhase === "saving" || scenes.length < WRITER_NARRATIVE_PULSE_MIN_SCENES} onClick={() => void saveThenAnalyze()}><SmartFeatureIndicator label={pulse.analysis ? "Actualizar Narrative Pulse" : "Analizar Narrative Pulse"} /></button>}
      </div>
    </section>
    {scenes.length < WRITER_NARRATIVE_PULSE_MIN_SCENES && <p className="writer-pulse-empty">Narrative Pulse necesita más escenas para producir una lectura útil.</p>}
    {pulse.analysis && !current && <p className="writer-pulse-stale">El guion cambió desde este análisis. Los hitos humanos se conservan.</p>}
    {savePhase === "saving" && <p className="writer-pulse-loading" role="status">Guardando cambios…</p>}
    {savePhase === "error" && <div className="timeline-notice" role="alert"><span>No pudimos guardar los últimos cambios.</span><button type="button" onClick={() => void saveThenAnalyze()}>Reintentar guardado</button></div>}
    {pulse.analyzing && <p className="writer-pulse-loading" role="status">Analizando estructura narrativa… Puedes seguir escribiendo.</p>}
    {pulse.feedback && <p className="timeline-notice" role="status">{pulse.feedback}</p>}
    {!pulse.analysis && scenes.length >= WRITER_NARRATIVE_PULSE_MIN_SCENES && pulse.loaded && <div className="writer-pulse-empty"><strong>Todavía no hay lectura narrativa.</strong><span>El análisis sólo se ejecuta cuando eliges “Analizar Narrative Pulse”.</span></div>}
    {pulse.analysis && <>
      <div ref={scrollRef} className="writer-pulse-scroll" tabIndex={0} aria-label="Narrative Pulse con desplazamiento horizontal">
        <div className="writer-pulse-canvas" style={{ width: graphWidth, height: graphHeight }} onClick={(event) => {
          if (event.target !== event.currentTarget && event.target instanceof Element && event.target.closest("button")) return;
          setSelectedPulseSceneId(null); setSelectedMilestoneId(null);
        }}>
          <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} role="img" aria-label="Curva comparativa de intensidad narrativa por escena" preserveAspectRatio="none">
            <path className="writer-pulse-baseline" d={`M0,${graphHeight - 24} L${graphWidth},${graphHeight - 24}`} />
            <path className="writer-pulse-area" d={areaPath} />
            <path className="writer-pulse-curve" d={path} />
          </svg>
          {orderedPoints.map(({ scene, point }, index) => {
            const x = 24 + (index / Math.max(1, orderedPoints.length - 1)) * Math.max(0, graphWidth - 48);
            const displayIntensity = displayPoints[index]?.displayIntensity ?? point.intensity;
            const y = 24 + (1 - displayIntensity / 100) * Math.max(0, graphHeight - 48);
            return <button key={scene.key} type="button" data-pulse-scene-id={scene.sourceId ?? undefined} data-raw-intensity={point.intensity} data-display-intensity={displayIntensity.toFixed(2)} className={`writer-pulse-point${selectedPulseSceneId === scene.sourceId ? " is-selected" : ""}`} style={{ left: x, top: y }} onClick={() => selectPoint(scene)} aria-label={`Escena ${scene.order}: ${scene.heading}. ${point.note}`}><span aria-hidden="true" /></button>;
          })}
          {visibleMilestones.map((milestone) => {
            const index = scenes.findIndex((scene) => scene.sourceId === milestone.sceneId); if (index < 0) return null;
            const x = 24 + (index / Math.max(1, scenes.length - 1)) * Math.max(0, graphWidth - 48);
            return <button key={milestone.id} type="button" className={`writer-pulse-milestone${milestone.status === "needs_review" ? " needs-review" : ""}`} style={{ left: x }} onClick={() => { selectMilestone(milestone); const scene = scenes[index]; if (scene) selectPoint(scene); }} title={`${milestone.label} · Escena ${index + 1}`}><span aria-hidden="true" />{milestone.label}</button>;
          })}
          <div className="writer-pulse-scene-axis" style={{ gridTemplateColumns: `repeat(${Math.max(1, scenes.length)}, ${columnWidth}px)` }}>{scenes.map((scene) => <button key={scene.key} type="button" onClick={() => selectPoint(scene)} aria-current={selectedPulseSceneId === scene.sourceId ? "true" : undefined}>{scene.order}</button>)}</div>
        </div>
      </div>
      <div className="writer-pulse-lower">
        <section className="writer-pulse-detail" aria-live="polite">
          {selected && selectedPoint ? <><p className="timeline-eyebrow">Escena {selected.order} · intensidad original {selectedPoint.intensity}/100</p><h2>{selected.heading}</h2><p>{selectedPoint.note}</p><div className="writer-pulse-signals" aria-label="Señales narrativas">{selectedPoint.signals.map((signal) => <span key={signal}>{signalLabel(signal)}</span>)}</div>{selectedPoint.dimensions && <dl className="writer-pulse-dimensions">{PULSE_DIMENSIONS.map((dimension) => <div key={dimension}><dt>{dimensionLabel(dimension)}</dt><dd>{selectedPoint.dimensions?.[dimension] ?? 0}</dd></div>)}</dl>}{selectedPoint.evidence?.length ? <ul className="writer-pulse-evidence">{selectedPoint.evidence.map((item, index) => <li key={`${index}:${item}`}>“{item}”</li>)}</ul> : null}<button type="button" onClick={() => onSelectScene(selected)}>Ir a escena</button></> : <p>Selecciona un punto para ver su contexto narrativo. La escena activa del editor se mantiene independiente.</p>}
        </section>
        <section className="writer-pulse-milestone-list" aria-labelledby="writer-pulse-milestones">
          <div><h2 id="writer-pulse-milestones">Hitos</h2><button type="button" onClick={() => { setManualScene(selectedSceneId ?? scenes[0]?.sourceId ?? ""); setManualOpen((value) => !value); }}>+ Añadir hito</button></div>
          {manualOpen && <div className="writer-pulse-form"><label>Escena<select value={manualScene} onChange={(event) => setManualScene(event.target.value)}>{scenes.map((scene) => <option key={scene.key} value={scene.sourceId ?? ""}>Escena {scene.order} · {scene.heading}</option>)}</select></label><label>Tipo<select value={manualType} onChange={(event) => setManualType(event.target.value as WriterPulseMilestoneType)}>{TYPES.map((type) => <option key={type} value={type}>{writerPulseMilestoneLabel(type)}</option>)}</select></label><label>Nombre<input value={manualLabel} maxLength={100} onChange={(event) => setManualLabel(event.target.value)} /></label><button type="button" onClick={() => void createManual()} disabled={!manualLabel.trim() || !manualScene}>Guardar hito</button></div>}
          <ul>{visibleMilestones.map((milestone) => <li key={milestone.id}><button type="button" onClick={() => selectMilestone(milestone)} aria-pressed={selectedMilestoneId === milestone.id}><span>{milestone.status === "confirmed" || milestone.status === "manual" ? "✓" : milestone.status === "needs_review" ? "!" : "?"}</span><strong>{milestone.label}</strong><small>{sceneName(scenes, milestone.sceneId)}</small></button></li>)}</ul>
        </section>
      </div>
      {pulse.zones.length > 0 && <section className="writer-pulse-zones" aria-labelledby="writer-pulse-zones-title"><h2 id="writer-pulse-zones-title">Tramos narrativos</h2><ul>{pulse.zones.map((zone) => <li key={zone.id}><strong>{zoneLabel(zone.type)}</strong><span>{sceneName(scenes, zone.startSceneId)} → {sceneName(scenes, zone.endSceneId)}</span><p>{zone.note}</p></li>)}</ul></section>}
      {selectedMilestone && <aside className="writer-pulse-milestone-detail"><div><p className="timeline-eyebrow">{writerPulseMilestoneLabel(selectedMilestone.type)}</p><h2>{selectedMilestone.label}</h2><span>{sceneName(scenes, selectedMilestone.sceneId)}</span></div>{selectedMilestone.explanation && <p>{selectedMilestone.explanation}</p>}{selectedMilestone.status === "needs_review" && <p>La escena vinculada ya no existe o cambió de forma relevante. El hito no se movió automáticamente.</p>}<div>{selectedMilestone.status === "suggested" && <button type="button" onClick={() => void pulse.setStatus(selectedMilestone.id, "confirmed")}>Confirmar</button>}<button type="button" onClick={() => void pulse.setStatus(selectedMilestone.id, "dismissed")}>Descartar</button><label>Título revisado<input value={renameLabel} maxLength={100} onChange={(event) => setRenameLabel(event.target.value)} /></label><button type="button" disabled={!renameLabel.trim() || renameLabel.trim() === selectedMilestone.label} onClick={() => void pulse.rename(selectedMilestone.id, renameLabel.trim())}>Renombrar</button><label>Mover a<select value={moveScene} onChange={(event) => setMoveScene(event.target.value)}><option value="">Selecciona escena…</option>{scenes.map((scene) => <option key={scene.key} value={scene.sourceId ?? ""}>Escena {scene.order} · {scene.heading}</option>)}</select></label><button type="button" disabled={!moveScene} onClick={() => void pulse.move(selectedMilestone.id, moveScene)}>Mover</button></div></aside>}
      <details className="writer-pulse-accessible"><summary>Lista accesible de escenas y zonas</summary><ol>{orderedPoints.map(({ scene, point }) => <li key={scene.key}><button type="button" onClick={() => onSelectScene(scene)}><strong>Escena {scene.order}: {scene.heading}</strong><span>{point.note}</span></button></li>)}</ol>{pulse.zones.length > 0 && <ul>{pulse.zones.map((zone) => <li key={zone.id}><strong>{zoneLabel(zone.type)}</strong>: {zone.note}</li>)}</ul>}</details>
    </>}
  </div>;
}

function sceneName(scenes: TimelineScene[], sceneId: string) { const scene = scenes.find((item) => item.sourceId === sceneId); return scene ? `Escena ${scene.order} · ${scene.heading}` : "Escena eliminada"; }
function signalLabel(value: string) { return ({ conflict: "Conflicto", change: "Cambio", pressure: "Presión", turn: "Giro", risk: "Riesgo", revelation: "Revelación", consequence: "Consecuencia", activity: "Actividad narrativa" } as Record<string, string>)[value] ?? value; }
function dimensionLabel(value: string) { return ({ threat: "Amenaza", pressure: "Conflicto / presión", stakes: "Stakes", emotion: "Emoción", revelation: "Revelación", urgency: "Urgencia" } as Record<string, string>)[value] ?? value; }
function zoneLabel(value: string) { return ({ stable: "Tramo relativamente estable", build: "Construcción", release: "Descenso relativo", peak: "Pico local" } as Record<string, string>)[value] ?? value; }
