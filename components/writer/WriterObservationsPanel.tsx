"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  WriterCharacterObservation,
  WriterKnownCharacterIdentity,
} from "@/lib/writer/character-observations";
import type {
  WriterCharacterDecision,
  WriterCharacterDecisionState,
} from "@/lib/writer/character-observation-storage";
import type { WriterFormatObservation } from "@/lib/writer/import-analysis";

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

export default function WriterObservationsPanel({
  observations,
  knownIdentities,
  decisions,
  storagePersistent,
  importedAnalysisPersistent,
  formatObservations,
  selectedBlockId,
  onClose,
  onConfirm,
  onLink,
  onIgnore,
  onRestore,
  onAddManual,
  onView,
  onViewFormat,
}: {
  observations: WriterCharacterObservation[];
  knownIdentities: WriterKnownCharacterIdentity[];
  decisions: WriterCharacterDecisionState;
  storagePersistent: boolean;
  importedAnalysisPersistent: boolean;
  formatObservations: WriterFormatObservation[];
  selectedBlockId: string | null;
  onClose: () => void;
  onConfirm: (observation: WriterCharacterObservation, name: string) => void;
  onLink: (observation: WriterCharacterObservation, identityKey: string) => void;
  onIgnore: (observation: WriterCharacterObservation) => void;
  onRestore: (decision: WriterCharacterDecision) => void;
  onAddManual: (name: string) => void;
  onView: (observation: WriterCharacterObservation) => void;
  onViewFormat: (observation: WriterFormatObservation) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState<WriterCharacterObservation | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [linking, setLinking] = useState<WriterCharacterObservation | null>(null);
  const [linkKey, setLinkKey] = useState("");
  const [manualName, setManualName] = useState("");
  const decisionByFingerprint = useMemo(
    () => new Map(decisions.decisions.map((decision) => [decision.fingerprint, decision])),
    [decisions.decisions],
  );
  const pending = useMemo(
    () => observations.filter((observation) => !observation.known && !decisionByFingerprint.has(observation.fingerprint)),
    [decisionByFingerprint, observations],
  );
  const groups = useMemo(() => {
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

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <aside
      ref={panelRef}
      className="writer-observations-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="writer-observations-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ) ?? [])].filter((element) => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <header>
        <div>
          <p className="writer-eyebrow">Revisión local</p>
          <h2 id="writer-observations-title">Observaciones</h2>
        </div>
        <button ref={closeRef} type="button" onClick={onClose}>Cerrar</button>
      </header>

      <div className="writer-observations-scroll">
        <p className="writer-observations-local-note">
          {importedAnalysisPersistent
            ? "El análisis de importación se conserva con este guion. Las decisiones nuevas se sincronizan y también mantienen una copia local de respaldo."
            : storagePersistent
            ? "Los reconocimientos manuales de esta versión se guardan en este navegador. Aún no se sincronizan entre dispositivos ni se exportan."
            : "El almacenamiento local no está disponible. Las decisiones sólo durarán durante esta sesión."}
        </p>

        {formatObservations.length > 0 && (
          <section aria-labelledby="writer-observations-format-heading">
            <div className="writer-observations-section-heading">
              <h3 id="writer-observations-format-heading">Formato opcional</h3>
              <span>{formatObservations.length}</span>
            </div>
            {formatObservations.map((observation) => (
              <article key={observation.id} className={observation.blockId === selectedBlockId ? "is-selected" : ""}>
                <div className="writer-observation-title">
                  <strong>{observation.message}</strong>
                  <span>{observation.source === "ai" ? "IA" : "Regla local"}</span>
                </div>
                <p>Se aplicó {KIND_LABELS[observation.kind]}. Puedes cambiarlo directamente en Writer sin otra llamada.</p>
                <div className="writer-observation-actions"><button type="button" onClick={() => onViewFormat(observation)}>Ver y ajustar</button></div>
              </article>
            ))}
          </section>
        )}

        <section aria-labelledby="writer-observations-review-heading">
          <div className="writer-observations-section-heading">
            <h3 id="writer-observations-review-heading">Por revisar</h3>
            <span>{pending.length}</span>
          </div>
          {groups.length ? groups.map((group) => {
            const first = group[0];
            return (
              <article key={first.identityKey} className={group.some((item) => item.blockId === selectedBlockId) ? "is-selected" : ""}>
                <div className="writer-observation-title">
                  <strong>Identidad por revisar: {first.identity.toLocaleUpperCase("es-MX")}</strong>
                  {group.length > 1 && <span>{group.length} evidencias</span>}
                </div>
                {group.map((observation) => (
                  <div className="writer-observation-evidence" key={observation.id}>
                    <p>“{observation.excerpt}”</p>
                    <small>{EVIDENCE_LABELS[observation.evidence]} · {confidenceLabel(observation.confidence)}</small>
                    <details>
                      <summary>Por qué se señaló</summary>
                      <ul>{observation.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
                    </details>
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

        {ignored.length > 0 && (
          <details className="writer-observations-ignored">
            <summary>Ignoradas ({ignored.length})</summary>
            {ignored.map(({ decision, observation }) => (
              <div key={decision.fingerprint}>
                <span>{observation.identity} · {EVIDENCE_LABELS[observation.evidence]}</span>
                <button type="button" onClick={() => onRestore(decision)}>Restaurar</button>
              </div>
            ))}
          </details>
        )}

        <section aria-labelledby="writer-observations-known-heading">
          <div className="writer-observations-section-heading">
            <h3 id="writer-observations-known-heading">Personajes reconocidos</h3>
            <span>{knownIdentities.length}</span>
          </div>
          {knownIdentities.length ? (
            <ul className="writer-observations-known">{knownIdentities.map((identity) => {
              const references = observations.filter((observation) => observation.known && observation.identityKey === identity.key);
              return (
                <li key={`${identity.source}:${identity.key}`}>
                  <div><strong>{identity.name}</strong><span>{SOURCE_LABELS[identity.source]}</span></div>
                  <small>{references.length ? `${references.length} evidencias actuales` : "Sin evidencias actuales"}</small>
                </li>
              );
            })}</ul>
          ) : <p className="writer-observations-empty">Todavía no hay identidades reconocidas.</p>}
          <form className="writer-observations-manual" onSubmit={(event) => {
            event.preventDefault();
            if (!manualName.trim()) return;
            onAddManual(manualName);
            setManualName("");
          }}>
            <label>Reconocer manualmente<input value={manualName} onChange={(event) => setManualName(event.target.value)} maxLength={64} placeholder="Nombre o identidad" /></label>
            <button type="submit" disabled={!manualName.trim()}>Añadir</button>
          </form>
        </section>
      </div>

      {confirming && (
        <div className="writer-observation-decision" role="dialog" aria-modal="true" aria-labelledby="writer-observation-confirm-title">
          <h3 id="writer-observation-confirm-title">Confirmar personaje</h3>
          <label>Nombre reconocido<input autoFocus value={confirmName} onChange={(event) => setConfirmName(event.target.value)} maxLength={64} /></label>
          <div><button type="button" onClick={() => setConfirming(null)}>Cancelar</button><button type="button" onClick={() => { onConfirm(confirming, confirmName); setConfirming(null); }} disabled={!confirmName.trim()}>Confirmar</button></div>
        </div>
      )}

      {linking && (
        <div className="writer-observation-decision" role="dialog" aria-modal="true" aria-labelledby="writer-observation-link-title">
          <h3 id="writer-observation-link-title">Vincular evidencia</h3>
          <label>Personaje<select autoFocus value={linkKey} onChange={(event) => setLinkKey(event.target.value)}>
            {knownIdentities.map((identity) => <option key={`${identity.source}:${identity.key}`} value={identity.key}>{identity.name}</option>)}
          </select></label>
          <div><button type="button" onClick={() => setLinking(null)}>Cancelar</button><button type="button" onClick={() => { onLink(linking, linkKey); setLinking(null); }} disabled={!linkKey}>Vincular</button></div>
        </div>
      )}
    </aside>
  );
}

function confidenceLabel(value: WriterCharacterObservation["confidence"]) {
  if (value === "high") return "Alta";
  if (value === "medium") return "Media";
  return "Revisar";
}

const KIND_LABELS: Record<WriterFormatObservation["kind"], string> = {
  sceneHeading: "Encabezado de escena",
  action: "Acción",
  character: "Personaje — encabezado de diálogo",
  dialogue: "Diálogo",
  parenthetical: "Acotación",
  transition: "Transición",
  authorNote: "Nota del autor",
};
