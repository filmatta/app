"use client";

import { useMemo, useState } from "react";
import { SCREENPLAY_KINDS, type ScreenplayKind } from "@/lib/writer/document";
import type { WriterCharacterObservation, WriterKnownCharacterIdentity } from "@/lib/writer/character-observations";
import type { WriterCharacterDecision, WriterCharacterDecisionState } from "@/lib/writer/character-observation-storage";
import {
  groupWriterFormatObservations,
  writerFormatObservationState,
  writerObservationExcerpt,
  type WriterFormatObservation,
} from "@/lib/writer/import-analysis";

const EVIDENCE_LABELS: Record<WriterCharacterObservation["evidence"], string> = {
  intervention: "Intervención / bloque Personaje",
  actionReference: "Referencia en Acción",
  mention: "Mención",
  indeterminate: "Relación indeterminada",
};

const SOURCE_LABELS: Record<WriterKnownCharacterIdentity["source"], string> = {
  characterBlock: "Bloque Personaje",
  confirmedAction: "Confirmado en Acción",
  manual: "Alta manual",
  imported: "Detectado al importar",
};

const FORMAT_LABELS: Record<ScreenplayKind, { plural: string; singular: string; item: string }> = {
  dialogue: { plural: "Diálogos", singular: "Diálogo", item: "fragmentos clasificados" },
  character: { plural: "Personajes", singular: "Personaje", item: "encabezados clasificados" },
  action: { plural: "Acciones", singular: "Acción", item: "fragmentos clasificados" },
  parenthetical: { plural: "Acotaciones", singular: "Acotación", item: "acotaciones clasificadas" },
  sceneHeading: { plural: "Encabezados de escena", singular: "Encabezado de escena", item: "encabezados clasificados" },
  transition: { plural: "Transiciones", singular: "Transición", item: "transiciones clasificadas" },
  authorNote: { plural: "Notas", singular: "Nota del autor", item: "notas clasificadas" },
};

export default function WriterObservationsPanel({
  observations, knownIdentities, decisions, storagePersistent, importedAnalysisPersistent,
  formatObservations, reviewedFormatIds, activeFormatObservationId, showHighlights, formatReviewPersistent,
  sceneCount, selectedBlockId, hidden, onClose, onConfirm, onLink, onIgnore,
  onRestore, onAddManual, onView, onViewFormat, onReviewFormat, onChangeFormat, onToggleHighlights,
}: {
  observations: WriterCharacterObservation[];
  knownIdentities: WriterKnownCharacterIdentity[];
  decisions: WriterCharacterDecisionState;
  storagePersistent: boolean;
  importedAnalysisPersistent: boolean;
  formatObservations: WriterFormatObservation[];
  reviewedFormatIds: ReadonlySet<string>;
  activeFormatObservationId: string | null;
  showHighlights: boolean;
  formatReviewPersistent: boolean;
  sceneCount: number;
  selectedBlockId: string | null;
  hidden: boolean;
  onClose: () => void;
  onConfirm: (observation: WriterCharacterObservation, name: string) => void;
  onLink: (observation: WriterCharacterObservation, identityKey: string) => void;
  onIgnore: (observation: WriterCharacterObservation) => void;
  onRestore: (decision: WriterCharacterDecision) => void;
  onAddManual: (name: string) => void;
  onView: (observation: WriterCharacterObservation) => void;
  onViewFormat: (observation: WriterFormatObservation) => void;
  onReviewFormat: (observation: WriterFormatObservation) => void;
  onChangeFormat: (observation: WriterFormatObservation, kind: ScreenplayKind) => void;
  onToggleHighlights: (visible: boolean) => void;
}) {
  const [confirming, setConfirming] = useState<WriterCharacterObservation | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [linking, setLinking] = useState<WriterCharacterObservation | null>(null);
  const [linkKey, setLinkKey] = useState("");
  const [manualName, setManualName] = useState("");
  const [activeKind, setActiveKind] = useState<ScreenplayKind | null>(null);
  const [indexByKind, setIndexByKind] = useState<Partial<Record<ScreenplayKind, number>>>({});
  const decisionByFingerprint = useMemo(
    () => new Map(decisions.decisions.map((decision) => [decision.fingerprint, decision])),
    [decisions.decisions],
  );
  const pending = useMemo(
    () => observations.filter((observation) => !observation.known && !decisionByFingerprint.has(observation.fingerprint)),
    [decisionByFingerprint, observations],
  );
  const characterGroups = useMemo(() => {
    const byIdentity = new Map<string, WriterCharacterObservation[]>();
    for (const observation of pending) {
      const group = byIdentity.get(observation.identityKey) ?? [];
      group.push(observation);
      byIdentity.set(observation.identityKey, group);
    }
    return [...byIdentity.values()].sort((a, b) => {
      const aSelected = a.some((item) => item.blockId === selectedBlockId) ? 1 : 0;
      const bSelected = b.some((item) => item.blockId === selectedBlockId) ? 1 : 0;
      return bSelected - aSelected || a[0].identity.localeCompare(b[0].identity, "es", { sensitivity: "base" });
    });
  }, [pending, selectedBlockId]);
  const ignored = useMemo(() => decisions.decisions
    .filter((decision) => decision.state === "ignored")
    .flatMap((decision) => {
      const observation = observations.find((item) => item.fingerprint === decision.fingerprint);
      return observation ? [{ decision, observation }] : [];
    }), [decisions.decisions, observations]);
  const formatGroups = useMemo(
    () => groupWriterFormatObservations(formatObservations, reviewedFormatIds),
    [formatObservations, reviewedFormatIds],
  );
  const requestedActiveGroup = activeFormatObservationId
    ? formatGroups.find((group) => group.observations.some((item) => item.id === activeFormatObservationId)) ?? null
    : null;
  const activeGroup = requestedActiveGroup ?? formatGroups.find((group) => group.kind === activeKind) ?? null;
  const activeIndex = activeGroup
    ? Math.min(
      requestedActiveGroup
        ? Math.max(0, requestedActiveGroup.observations.findIndex((item) => item.id === activeFormatObservationId))
        : indexByKind[activeGroup.kind] ?? 0,
      activeGroup.observations.length - 1,
    )
    : 0;
  const activeFormat = activeGroup?.observations[activeIndex] ?? null;

  function openFormatGroup(kind: ScreenplayKind) {
    const group = formatGroups.find((candidate) => candidate.kind === kind);
    if (!group) return;
    const index = Math.min(indexByKind[kind] ?? 0, group.observations.length - 1);
    setActiveKind(kind);
    onViewFormat(group.observations[index]);
  }

  function moveFormat(delta: number) {
    if (!activeGroup) return;
    const next = Math.max(0, Math.min(activeGroup.observations.length - 1, activeIndex + delta));
    setIndexByKind((current) => ({ ...current, [activeGroup.kind]: next }));
    onViewFormat(activeGroup.observations[next]);
  }

  function markFormatCorrect() {
    if (!activeFormat) return;
    onReviewFormat(activeFormat);
    if (!activeGroup) return;
    const nextIndex = activeGroup.observations.findIndex((item, index) => index > activeIndex && !reviewedFormatIds.has(item.id));
    const fallbackIndex = activeGroup.observations.findIndex((item, index) => index < activeIndex && !reviewedFormatIds.has(item.id));
    const targetIndex = nextIndex >= 0 ? nextIndex : fallbackIndex;
    if (targetIndex < 0) return;
    setIndexByKind((current) => ({ ...current, [activeGroup.kind]: targetIndex }));
    onViewFormat(activeGroup.observations[targetIndex]);
  }

  return (
    <aside hidden={hidden} className="writer-observations-panel" aria-labelledby="writer-observations-title" onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }}>
      <header>
        <div>
          <p className="writer-eyebrow">Revisión</p>
          <h2 id="writer-observations-title">Observaciones</h2>
          <p>{sceneCount} escenas · {knownIdentities.length} personajes · {formatObservations.length} clasificaciones de formato</p>
        </div>
        <button type="button" onClick={onClose}>Cerrar</button>
      </header>

      <div className="writer-observations-scroll">
        <p className="writer-observations-local-note">
          {importedAnalysisPersistent
            ? "El análisis de importación se conserva con este guion. Revisar formato no ejecuta IA ni bloquea la escritura."
            : storagePersistent
            ? "Las decisiones manuales se guardan en este navegador y no modifican el texto hasta que eliges un cambio."
            : "El almacenamiento local no está disponible. Las decisiones sólo durarán durante esta sesión."}
        </p>

        {formatObservations.length > 0 && <label className="writer-observations-highlight-toggle">
          <input type="checkbox" checked={showHighlights} onChange={(event) => onToggleHighlights(event.target.checked)} />
          <span><strong>Mostrar ajustes en documento</strong><small>{formatReviewPersistent ? "Los revisados no reaparecen al recargar en este navegador." : "La revisión durará sólo durante esta sesión."}</small></span>
        </label>}

        {formatGroups.length > 0 && (
          <section aria-labelledby="writer-observations-format-heading">
            <div className="writer-observations-section-heading"><h3 id="writer-observations-format-heading">Formato</h3><span>{formatObservations.length}</span></div>
            <div className="writer-format-summaries">
              {formatGroups.map((group) => {
                const labels = FORMAT_LABELS[group.kind];
                return (
                  <article key={group.kind} className="writer-format-summary" data-category={group.kind}>
                    <div className="writer-observation-title"><strong>{labels.plural}</strong><span>{group.observations.length}</span></div>
                    <p>{group.observations.length} {labels.item}{group.doubtCount ? ` · ${group.doubtCount} ${group.doubtCount === 1 ? "duda" : "dudas"}` : ""}</p>
                    <blockquote>“{writerObservationExcerpt(group.observations[0].excerpt)}”</blockquote>
                    <div className="writer-format-summary-footer"><small>{group.reviewedCount} revisados</small><button type="button" onClick={() => openFormatGroup(group.kind)}>Revisar</button></div>
                  </article>
                );
              })}
            </div>

            {activeGroup && activeFormat && (
              <article
                className="writer-format-review"
                data-category={activeGroup.kind}
                data-state={writerFormatObservationState(activeFormat)}
                aria-label={`${FORMAT_LABELS[activeGroup.kind].singular}. ${writerFormatObservationState(activeFormat) === "question" ? "Duda" : "Clasificación"}. Elemento ${activeIndex + 1} de ${activeGroup.observations.length}.`}
              >
                <div className="writer-format-review-heading"><strong>{FORMAT_LABELS[activeGroup.kind].plural} · {activeIndex + 1} de {activeGroup.observations.length}</strong><span>{writerFormatObservationState(activeFormat) === "question" ? "Duda" : "Clasificación"}</span></div>
                <blockquote>“{writerObservationExcerpt(activeFormat.excerpt, 240)}”</blockquote>
                <p>{activeFormat.message}</p>
                {writerFormatObservationState(activeFormat) === "question" && <p>FILMATTA no está segura de esta clasificación.</p>}
                <dl><div><dt>Clasificado como</dt><dd>{FORMAT_LABELS[activeFormat.kind].singular}</dd></div></dl>
                <div className="writer-format-review-actions">
                  <button type="button" onClick={markFormatCorrect} aria-pressed={reviewedFormatIds.has(activeFormat.id)}>Correcto</button>
                  <label>Cambiar a<select value={activeFormat.kind} onChange={(event) => {
                    const kind = event.target.value as ScreenplayKind;
                    if (kind === activeFormat.kind) return;
                    onReviewFormat(activeFormat);
                    onChangeFormat(activeFormat, kind);
                  }}>{SCREENPLAY_KINDS.map((kind) => <option key={kind} value={kind}>{FORMAT_LABELS[kind].singular}</option>)}</select></label>
                </div>
                <div className="writer-format-review-navigation"><button type="button" onClick={() => moveFormat(-1)} disabled={activeIndex === 0}>← Anterior</button><button type="button" onClick={() => moveFormat(1)} disabled={activeIndex >= activeGroup.observations.length - 1}>Ver siguiente →</button></div>
              </article>
            )}
          </section>
        )}

        <section aria-labelledby="writer-observations-review-heading">
          <div className="writer-observations-section-heading"><h3 id="writer-observations-review-heading">Personajes por revisar</h3><span>{pending.length}</span></div>
          {characterGroups.length ? characterGroups.map((group) => {
            const first = group[0];
            return (
              <article key={first.identityKey} className={group.some((item) => item.blockId === selectedBlockId) ? "is-selected" : ""} data-state="question">
                <div className="writer-observation-title"><strong>Identidad por revisar: {first.identity.toLocaleUpperCase("es-MX")}</strong><span>Duda</span></div>
                {group.map((observation) => (
                  <div className="writer-observation-evidence" key={observation.id}>
                    <p>“{observation.excerpt}”</p><small>{EVIDENCE_LABELS[observation.evidence]} · {confidenceLabel(observation.confidence)}</small>
                    <details><summary>Por qué se señaló</summary><ul>{observation.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul></details>
                    <button type="button" onClick={() => onView(observation)}>Ver fragmento</button>
                  </div>
                ))}
                <p>La relación puede ser intervención, acción, mención o incierta. Reconocerla no cambia el texto ni crea diálogo.</p>
                <div className="writer-observation-actions">
                  <button type="button" onClick={() => { setConfirming(first); setConfirmName(first.identity); }}>Confirmar personaje</button>
                  <button type="button" onClick={() => { setLinking(first); setLinkKey(knownIdentities[0]?.key ?? ""); }} disabled={!knownIdentities.length}>Vincular a existente</button>
                  <button type="button" onClick={() => onIgnore(first)}>Ignorar</button>
                </div>
              </article>
            );
          }) : <p className="writer-observations-empty">No hay posibles personajes pendientes en el texto actual.</p>}
        </section>

        {ignored.length > 0 && <details className="writer-observations-ignored"><summary>Ignoradas ({ignored.length})</summary>{ignored.map(({ decision, observation }) => <div key={decision.fingerprint}><span>{observation.identity} · {EVIDENCE_LABELS[observation.evidence]}</span><button type="button" onClick={() => onRestore(decision)}>Restaurar</button></div>)}</details>}

        <section aria-labelledby="writer-observations-known-heading">
          <div className="writer-observations-section-heading"><h3 id="writer-observations-known-heading">Personajes reconocidos</h3><span>{knownIdentities.length}</span></div>
          {knownIdentities.length ? <ul className="writer-observations-known">{knownIdentities.map((identity) => {
            const references = observations.filter((observation) => observation.identityKey === identity.key);
            return <li key={`${identity.source}:${identity.key}`}><div><strong>{identity.name}</strong><span>{SOURCE_LABELS[identity.source]}</span></div><small>{references.length ? `${references.length} evidencias actuales` : "Sin evidencias actuales"}</small></li>;
          })}</ul> : <p className="writer-observations-empty">Todavía no hay identidades reconocidas.</p>}
          <form className="writer-observations-manual" onSubmit={(event) => { event.preventDefault(); if (!manualName.trim()) return; onAddManual(manualName); setManualName(""); }}>
            <label>Reconocer manualmente<input value={manualName} onChange={(event) => setManualName(event.target.value)} maxLength={64} placeholder="Nombre o identidad" /></label><button type="submit" disabled={!manualName.trim()}>Añadir</button>
          </form>
        </section>
      </div>

      {confirming && <div className="writer-observation-decision" role="dialog" aria-modal="true" aria-labelledby="writer-observation-confirm-title"><h3 id="writer-observation-confirm-title">Confirmar personaje</h3><label>Nombre reconocido<input autoFocus value={confirmName} onChange={(event) => setConfirmName(event.target.value)} maxLength={64} /></label><div><button type="button" onClick={() => setConfirming(null)}>Cancelar</button><button type="button" onClick={() => { onConfirm(confirming, confirmName); setConfirming(null); }} disabled={!confirmName.trim()}>Confirmar</button></div></div>}
      {linking && <div className="writer-observation-decision" role="dialog" aria-modal="true" aria-labelledby="writer-observation-link-title"><h3 id="writer-observation-link-title">Vincular evidencia</h3><label>Personaje<select autoFocus value={linkKey} onChange={(event) => setLinkKey(event.target.value)}>{knownIdentities.map((identity) => <option key={`${identity.source}:${identity.key}`} value={identity.key}>{identity.name}</option>)}</select></label><div><button type="button" onClick={() => setLinking(null)}>Cancelar</button><button type="button" onClick={() => { onLink(linking, linkKey); setLinking(null); }} disabled={!linkKey}>Vincular</button></div></div>}
    </aside>
  );
}

function confidenceLabel(value: WriterCharacterObservation["confidence"]) {
  if (value === "high") return "Alta";
  if (value === "medium") return "Media";
  return "Revisar";
}
