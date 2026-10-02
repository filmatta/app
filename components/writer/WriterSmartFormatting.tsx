"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SCREENPLAY_KINDS, type ScreenplayKind } from "@/lib/writer/document";
import {
  canUseStructuredFeature,
  type WriterAutoFormatPlan,
  type WriterDocumentReadiness,
  type WriterStructuredFeature,
} from "@/lib/writer/smart-format";
import { WRITER_KIND_LABELS } from "./WriterWritingTools";

export function SmartFeatureIndicator({ label, compact = false }: { label: string; compact?: boolean }) {
  return <span className={`writer-smart-indicator${compact ? " is-compact" : ""}`}>
    <span aria-hidden="true">✦</span><span>{label}</span>
  </span>;
}

export function WriterReadinessNotice({
  feature,
  readiness,
  onFormat,
  onDismiss,
}: {
  feature: WriterStructuredFeature;
  readiness: WriterDocumentReadiness;
  onFormat: (scope: "document" | "partial") => void;
  onDismiss: () => void;
}) {
  const capability = canUseStructuredFeature(readiness, feature);
  if (
    readiness.state === "EMPTY" ||
    (readiness.state === "READY" && capability.available)
  ) return null;
  if (readiness.state === "PARTIALLY_FORMATTED" && capability.available) {
    return <aside className="writer-readiness-notice is-partial" role="status">
      <div><strong>Parte de este documento podría necesitar formato.</strong><p>La estructura disponible seguirá funcionando; puedes revisar sólo los bloques pendientes.</p></div>
      <div><button type="button" onClick={() => onFormat("partial")}><SmartFeatureIndicator label="REVISAR FORMATO" /></button><button type="button" onClick={onDismiss}>Ahora no</button></div>
    </aside>;
  }

  const copy = readinessCopy(feature);
  return <aside className="writer-readiness-notice" role="status">
    <div><strong>{copy.title}</strong><p>{copy.body}</p></div>
    <div><button type="button" onClick={() => onFormat("document")}><SmartFeatureIndicator label="FORMATO AUTOMÁTICO" /></button><button type="button" onClick={onDismiss}>Ahora no</button></div>
  </aside>;
}

export function WriterAutoFormatFlow({
  plan,
  resolving = false,
  fallbackNotice = null,
  onApply,
  onClose,
}: {
  plan: WriterAutoFormatPlan;
  resolving?: boolean;
  fallbackNotice?: string | null;
  onApply: (choices: Readonly<Record<string, ScreenplayKind>>, reviewAll: boolean) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"detecting" | "summary" | "review">("detecting");
  const [choices, setChoices] = useState<Record<string, ScreenplayKind>>({});
  useEffect(() => {
    if (resolving) return;
    const timer = window.setTimeout(() => setPhase("summary"), 180);
    return () => window.clearTimeout(timer);
  }, [plan, resolving]);
  const displayedPhase = resolving ? "detecting" : phase;
  const reviewItems = useMemo(() => plan.changes.filter((item) => item.confidence !== "high").sort((left, right) => {
    const rank = { review: 0, medium: 1, high: 2 } as const;
    return rank[left.confidence] - rank[right.confidence] || left.sourceLine - right.sourceLine;
  }), [plan.changes]);
  const detected = plan.summary.byKind;

  return <div className="writer-auto-format-backdrop" role="presentation">
    <section className="writer-auto-format-dialog" role="dialog" aria-modal="true" aria-labelledby="writer-auto-format-title">
      <header><div><SmartFeatureIndicator label="FORMATO AUTOMÁTICO" /><h2 id="writer-auto-format-title">{displayedPhase === "detecting" ? "Detectando estructura…" : displayedPhase === "review" ? "Revisar formato detectado" : "Estructura detectada"}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar Formato Automático">Cerrar</button></header>
      {displayedPhase === "detecting" && <div className="writer-auto-format-detecting" role="status"><span aria-hidden="true" />El parser organiza lo evidente y revisa sólo las ambigüedades de contexto…</div>}
      {displayedPhase === "summary" && <>
        {fallbackNotice && <p className="writer-auto-format-fallback" role="status">{fallbackNotice}</p>}
        {plan.alreadyFormatted ? <div className="writer-auto-format-ready"><strong>Este documento ya parece estar correctamente formateado como guion.</strong><p>No se regeneraron IDs ni se modificó el contenido.</p></div> : <>
          <p>Detectamos:</p>
          <dl className="writer-auto-format-summary">
            <div><dt>Escenas</dt><dd>{detected.sceneHeading}</dd></div>
            <div><dt>Personajes</dt><dd>{plan.summary.distinctCharacterNames}</dd></div>
            <div><dt>Diálogos</dt><dd>{detected.dialogue}</dd></div>
            <div><dt>Acción</dt><dd>{detected.action}</dd></div>
            <div><dt>Espacios redundantes</dt><dd>{plan.redundantBlankBlocks}</dd></div>
            <div><dt>Por revisar</dt><dd>{plan.summary.needsReview}</dd></div>
          </dl>
          <p className="writer-auto-format-free">Formato Automático incluido · el parser resuelve lo evidente y la clasificación contextual sólo revisa ambigüedades · 0 AI Credits.</p>
        </>}
        <footer>{!plan.alreadyFormatted && <>{plan.changes.length > 0 && <button type="button" onClick={() => setPhase("review")}>Revisar</button>}<button type="button" className="is-primary" onClick={() => onApply({}, false)}>Aplicar formato</button></>}<button type="button" onClick={onClose}>{plan.alreadyFormatted ? "Cerrar" : "Cancelar"}</button></footer>
      </>}
      {displayedPhase === "review" && <>
        <p>Confirma únicamente los bloques que necesitan atención. Los cambios de alta confianza se aplicarán sin pedirte revisar páginas ya claras. El texto no se reescribe.</p>
        <div className="writer-auto-format-review">
          {reviewItems.map((item) => <label key={item.blockId} data-confidence={item.confidence}>
            <span><b>{item.confidence === "high" ? "Alta" : item.confidence === "medium" ? "Media" : "Revisar"}</b><code>{item.text}</code><small>{item.signals.join(" ")}</small></span>
            <select value={choices[item.blockId] ?? item.proposedKind ?? "action"} onChange={(event) => setChoices((current) => ({ ...current, [item.blockId]: event.target.value as ScreenplayKind }))} aria-label={`Tipo para ${item.text}`}>
              {SCREENPLAY_KINDS.map((kind) => <option key={kind} value={kind}>{WRITER_KIND_LABELS[kind]}</option>)}
            </select>
          </label>)}
        </div>
        <footer><button type="button" onClick={() => setPhase("summary")}>Volver</button><button type="button" className="is-primary" onClick={() => onApply(choices, true)}>Aplicar formato revisado</button><button type="button" onClick={onClose}>Cancelar</button></footer>
      </>}
    </section>
  </div>;
}

export function WriterPasteFormatPrompt({
  step,
  onFormat,
  onContinue,
  onBack,
  onClose,
}: {
  step: "offer" | "consequence";
  onFormat: () => void;
  onContinue: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const title = step === "offer" ? "✦ Formatear este guion" : "¿Continuar sin identificar la estructura?";
  const closeRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { closeRef.current?.focus(); }, []);
  return <div className="writer-auto-format-backdrop writer-paste-format-backdrop" role="presentation">
    <section className="writer-auto-format-dialog writer-paste-format-dialog" role="dialog" aria-modal="true" aria-labelledby="writer-paste-format-title" onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }}>
      <header><div><h2 id="writer-paste-format-title">{title}</h2></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar">×</button></header>
      {step === "offer" ? <div className="writer-paste-format-copy">
        <p>Este texto parece contener un guion.</p>
        <p>Para que FILMATTA pueda identificar escenas, personajes, diálogos y acciones —y utilizar correctamente Timeline, Narrative Pulse y las herramientas de análisis— necesitamos organizar su formato.</p>
        <strong>No cambiaremos lo que escribiste.</strong>
      </div> : <div className="writer-paste-format-copy">
        <p>FILMATTA no podrá reconocer correctamente escenas, personajes, diálogos y acciones. Algunas herramientas pueden quedar limitadas hasta que formatees el documento.</p>
      </div>}
      <footer>{step === "offer" ? <>
        <button type="button" className="is-primary" onClick={onFormat}>FORMATEAR GUION</button>
        <button type="button" onClick={onContinue}>CONTINUAR SIN FORMATO</button>
      </> : <>
        <button type="button" className="is-primary" onClick={onBack}>VOLVER Y FORMATEAR</button>
        <button type="button" onClick={onContinue}>CONTINUAR SIN FORMATO</button>
      </>}</footer>
    </section>
  </div>;
}

function readinessCopy(feature: WriterStructuredFeature) {
  const copies: Record<WriterStructuredFeature, { title: string; body: string }> = {
    review: { title: "Las herramientas de revisión necesitan identificar la estructura del guion.", body: "Podemos reconocer escenas, personajes, diálogos y acciones sin cambiar lo que escribiste." },
    assistant: { title: "El Assistant necesita escenas y bloques identificados.", body: "La estructura permite utilizar correctamente el contexto del guion." },
    setupPayoff: { title: "Setup / Payoff necesita estructura narrativa.", body: "Primero necesitamos identificar escenas y bloques para relacionar referencias." },
    guided: { title: "Guided Writing necesita contexto estructurado.", body: "Identifica las escenas para pensar con el contexto correcto." },
    timeline: { title: "Timeline necesita escenas identificadas.", body: "No encontramos una estructura de escenas en este documento." },
    pulse: { title: "Narrative Pulse necesita un guion estructurado.", body: "Primero necesitamos identificar las escenas del documento." },
    ooc: { title: "O-O-C necesita personajes y diálogos identificados.", body: "Timeline y Pulse pueden seguir disponibles con las escenas actuales." },
  };
  return copies[feature];
}
