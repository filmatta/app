"use client";

import { useMemo, useState } from "react";
import type { WriterNarrativeElement, WriterNarrativeLink } from "@/lib/writer/setup-payoff";

type SceneOption = { id: string; order: number; title: string };

export default function WriterSetupPayoff({
  elements, links, scenes, activeSceneId, current, loaded, analyzing, feedback,
  onAnalyze, onView, onViewPulse, onElementStatus, onLinkStatus, onCreateElement, onCreateLink,
}: {
  elements: WriterNarrativeElement[];
  links: WriterNarrativeLink[];
  scenes: SceneOption[];
  activeSceneId: string | null;
  current: boolean;
  loaded: boolean;
  analyzing: boolean;
  feedback: string | null;
  onAnalyze: () => void;
  onView: (element: WriterNarrativeElement) => void;
  onViewPulse?: (sceneId: string) => void;
  onElementStatus: (element: WriterNarrativeElement, status: "confirmed" | "dismissed") => void;
  onLinkStatus: (link: WriterNarrativeLink, status: "confirmed" | "dismissed") => void;
  onCreateElement: (input: { sceneId: string; blockId: string | null; elementType: "setup" | "payoff"; label: string; excerpt: string }) => Promise<boolean>;
  onCreateLink: (setupElementId: string, payoffElementId: string) => Promise<boolean>;
}) {
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualType, setManualType] = useState<"setup" | "payoff">("setup");
  const [manualLabel, setManualLabel] = useState("");
  const [manualExcerpt, setManualExcerpt] = useState("");
  const [linkSetup, setLinkSetup] = useState("");
  const [linkPayoff, setLinkPayoff] = useState("");
  const [changingLinkId, setChangingLinkId] = useState<string | null>(null);
  const sceneById = useMemo(() => new Map(scenes.map((scene) => [scene.id, scene])), [scenes]);
  const elementById = useMemo(() => new Map(elements.map((element) => [element.id, element])), [elements]);
  const activeElements = elements.filter((element) => element.status !== "dismissed");
  const activeLinks = links.filter((link) => link.status !== "dismissed"
    && elementById.has(link.setupElementId) && elementById.has(link.payoffElementId));
  const setups = activeElements.filter((element) => element.type === "setup");
  const payoffs = activeElements.filter((element) => element.type === "payoff");
  const resolvedSetupIds = new Set(activeLinks.map((link) => link.setupElementId));
  const confirmed = activeLinks.filter((link) => link.status === "confirmed").length;
  const unresolved = setups.filter((element) => !resolvedSetupIds.has(element.id) || element.status === "unresolved").length;
  const review = activeLinks.filter((link) => link.status === "suggested" || link.status === "needs_review").length
    + activeElements.filter((element) => element.status === "needs_review" || element.status === "orphan").length;
  const selectedLink = activeLinks.find((link) => link.id === selectedLinkId) ?? null;
  const selectedElement = activeElements.find((element) => element.id === selectedElementId) ?? null;

  function sceneLabel(sceneId: string) {
    const scene = sceneById.get(sceneId);
    return scene ? `Escena ${scene.order} · ${scene.title}` : "Escena eliminada";
  }

  async function createManualElement() {
    if (!activeSceneId || !manualLabel.trim() || !manualExcerpt.trim()) return;
    const saved = await onCreateElement({ sceneId: activeSceneId, blockId: activeSceneId, elementType: manualType, label: manualLabel, excerpt: manualExcerpt });
    if (saved) { setManualOpen(false); setManualLabel(""); setManualExcerpt(""); }
  }

  async function createManualLink() {
    if (!linkSetup || !linkPayoff) return;
    if (await onCreateLink(linkSetup, linkPayoff)) {
      const previousLink = links.find((link) => link.id === changingLinkId);
      if (previousLink) onLinkStatus(previousLink, "dismissed");
      setChangingLinkId(null);
      setLinkSetup("");
      setLinkPayoff("");
      setSelectedElementId(null);
      setSelectedLinkId(null);
    }
  }

  function changeLink(link: WriterNarrativeLink) {
    setChangingLinkId(link.id);
    setLinkSetup(link.setupElementId);
    setLinkPayoff("");
  }

  return (
    <div className="writer-setup-payoff" aria-busy={analyzing}>
      <header className="writer-setup-payoff-heading">
        <div><p className="writer-eyebrow">Análisis narrativo</p><h3>Setup / Payoff</h3><small>FILMATTA propone relaciones; tú decides cuáles existen.</small></div>
        <span>{activeElements.length}</span>
      </header>
      <div className="writer-setup-payoff-summary" aria-label="Resumen Setup / Payoff">
        <div><strong>{setups.length}</strong><span>setups</span></div>
        <div><strong>{confirmed}</strong><span>confirmados</span></div>
        <div><strong>{unresolved}</strong><span>sin payoff</span></div>
        <div><strong>{review}</strong><span>por revisar</span></div>
      </div>
      <div className="writer-assistant-analyze-row">
        <button type="button" onClick={onAnalyze} disabled={analyzing || scenes.length < 2}>{analyzing ? "Analizando setups y payoffs…" : current ? "Actualizar análisis" : "Analizar Setup / Payoff"}</button>
        <small>{current ? "Actualizado" : loaded ? "Análisis explícito · Terra" : "Cargando…"}</small>
      </div>
      {scenes.length < 2 && <p className="writer-observations-empty">Añade al menos dos escenas para buscar relaciones narrativas.</p>}

      <section aria-labelledby="writer-setup-payoff-relations">
        <div className="writer-observations-section-heading"><h3 id="writer-setup-payoff-relations">Relaciones</h3><span>{activeLinks.length}</span></div>
        <div className="writer-setup-payoff-list">
          {activeLinks.map((link) => {
            const setup = elementById.get(link.setupElementId)!;
            const payoff = elementById.get(link.payoffElementId)!;
            return <button key={link.id} type="button" className={selectedLink?.id === link.id ? "is-selected" : ""} onClick={() => { setSelectedLinkId(link.id); setSelectedElementId(null); }}>
              <span data-status={link.status}>{statusSymbol(link.status)}</span><strong>{setup.label}</strong><small>→ {sceneLabel(payoff.sceneId)}</small>
            </button>;
          })}
          {!activeLinks.length && <p className="writer-observations-empty">Todavía no hay relaciones. Puedes analizar el guion o vincular elementos manualmente.</p>}
        </div>
      </section>

      <section aria-labelledby="writer-setup-payoff-elements">
        <div className="writer-observations-section-heading"><h3 id="writer-setup-payoff-elements">Elementos sin relación confirmada</h3><span>{activeElements.length}</span></div>
        <div className="writer-setup-payoff-list">
          {activeElements.filter((element) => !activeLinks.some((link) => link.setupElementId === element.id || link.payoffElementId === element.id)
            || ["unresolved", "orphan", "needs_review"].includes(element.status)).map((element) => (
            <button key={element.id} type="button" className={selectedElement?.id === element.id ? "is-selected" : ""} onClick={() => { setSelectedElementId(element.id); setSelectedLinkId(null); }}>
              <span data-status={element.status}>{element.type === "setup" ? "S" : "P"}</span><strong>{element.label}</strong><small>{element.status === "unresolved" ? "Sin payoff encontrado" : element.status === "orphan" ? "Posible payoff sin setup" : sceneLabel(element.sceneId)}</small>
            </button>
          ))}
        </div>
      </section>

      {selectedLink && <RelationDetail link={selectedLink} setup={elementById.get(selectedLink.setupElementId)!} payoff={elementById.get(selectedLink.payoffElementId)!}
        sceneLabel={sceneLabel} sceneExists={(id) => sceneById.has(id)} onView={onView} onViewPulse={onViewPulse} onStatus={onLinkStatus} onChange={changeLink} />}
      {selectedElement && <ElementDetail element={selectedElement} sceneLabel={sceneLabel} sceneExists={sceneById.has(selectedElement.sceneId)}
        onView={onView} onViewPulse={onViewPulse} onStatus={onElementStatus} />}

      <section className="writer-setup-payoff-manual" aria-labelledby="writer-setup-payoff-manual-heading">
        <div className="writer-observations-section-heading"><h3 id="writer-setup-payoff-manual-heading">Decisión manual</h3><span>Sin IA</span></div>
        <button type="button" onClick={() => setManualOpen((open) => !open)} disabled={!activeSceneId}>Marcar elemento en la escena activa</button>
        {manualOpen && <div className="writer-setup-payoff-form">
          <label>Tipo<select value={manualType} onChange={(event) => setManualType(event.target.value as "setup" | "payoff")}><option value="setup">Setup</option><option value="payoff">Payoff</option></select></label>
          <label>Nombre breve<input value={manualLabel} maxLength={160} onChange={(event) => setManualLabel(event.target.value)} placeholder="Llave bajo el piano" /></label>
          <label>Fragmento<textarea value={manualExcerpt} maxLength={360} rows={3} onChange={(event) => setManualExcerpt(event.target.value)} /></label>
          <button type="button" onClick={() => void createManualElement()} disabled={!manualLabel.trim() || !manualExcerpt.trim()}>Guardar elemento</button>
        </div>}
        <div className="writer-setup-payoff-form">
          {changingLinkId && <p>Selecciona un nuevo payoff. La relación anterior se descartará sólo después de guardar la nueva.</p>}
          <label>Setup<select value={linkSetup} onChange={(event) => setLinkSetup(event.target.value)}><option value="">Selecciona…</option>{setups.map((element) => <option key={element.id} value={element.id}>{element.label} · {sceneLabel(element.sceneId)}</option>)}</select></label>
          <label>Payoff<select value={linkPayoff} onChange={(event) => setLinkPayoff(event.target.value)}><option value="">Selecciona…</option>{payoffs.map((element) => <option key={element.id} value={element.id}>{element.label} · {sceneLabel(element.sceneId)}</option>)}</select></label>
          <button type="button" onClick={() => void createManualLink()} disabled={!linkSetup || !linkPayoff}>Vincular payoff</button>
        </div>
      </section>
      {feedback && <p className="writer-assistant-feedback" role="status">{feedback}</p>}
    </div>
  );
}

function RelationDetail({ link, setup, payoff, sceneLabel, sceneExists, onView, onViewPulse, onStatus, onChange }: { link: WriterNarrativeLink; setup: WriterNarrativeElement; payoff: WriterNarrativeElement; sceneLabel: (id: string) => string; sceneExists: (id: string) => boolean; onView: (element: WriterNarrativeElement) => void; onViewPulse?: (sceneId: string) => void; onStatus: (link: WriterNarrativeLink, status: "confirmed" | "dismissed") => void; onChange: (link: WriterNarrativeLink) => void }) {
  return <article className="writer-setup-payoff-detail" data-status={link.status}>
    <div><small>SETUP</small><strong>{sceneLabel(setup.sceneId)}</strong><blockquote>“{setup.excerpt}”</blockquote></div>
    <span aria-hidden="true">↓</span>
    <div><small>POSIBLE PAYOFF</small><strong>{sceneLabel(payoff.sceneId)}</strong><blockquote>“{payoff.excerpt}”</blockquote></div>
    {link.explanation && <p>{link.explanation}</p>}
    <p>Estado: {statusLabel(link.status)}</p>
    <div className="writer-observation-actions">
      {link.status !== "confirmed" && <button type="button" onClick={() => onStatus(link, "confirmed")}>Confirmar relación</button>}
      <button type="button" onClick={() => onStatus(link, "dismissed")}>Descartar</button>
      <button type="button" onClick={() => onChange(link)}>Cambiar vínculo</button>
      <button type="button" onClick={() => onView(setup)} disabled={!sceneExists(setup.sceneId)}>Ir a Setup</button>
      <button type="button" onClick={() => onView(payoff)} disabled={!sceneExists(payoff.sceneId)}>Ir a Payoff</button>
      {onViewPulse && <button type="button" onClick={() => onViewPulse(payoff.sceneId)} disabled={!sceneExists(payoff.sceneId)}>Ver en Narrative Pulse →</button>}
    </div>
  </article>;
}

function ElementDetail({ element, sceneLabel, sceneExists, onView, onViewPulse, onStatus }: { element: WriterNarrativeElement; sceneLabel: (id: string) => string; sceneExists: boolean; onView: (element: WriterNarrativeElement) => void; onViewPulse?: (sceneId: string) => void; onStatus: (element: WriterNarrativeElement, status: "confirmed" | "dismissed") => void }) {
  return <article className="writer-setup-payoff-detail" data-status={element.status}>
    <div><small>{element.type.toLocaleUpperCase("es-MX")}</small><strong>{sceneLabel(element.sceneId)}</strong><blockquote>“{element.excerpt}”</blockquote></div>
    {element.explanation && <p>{element.explanation}</p>}
    {element.status === "unresolved" && <><p>Este elemento se introduce aquí y no encontramos una resolución posterior.</p><ul><li>¿Debe resolverse?</li><li>¿Es deliberado que permanezca abierto?</li><li>¿Su función es atmosférica?</li></ul></>}
    {element.status === "orphan" && <><p>Este momento parece funcionar como payoff, pero no encontramos una preparación clara anteriormente.</p><ul><li>¿La sorpresa es deliberada?</li><li>¿Existe un setup implícito?</li></ul></>}
    {!sceneExists && <p>La escena vinculada ya no existe. La decisión se conserva para revisión.</p>}
    <div className="writer-observation-actions">
      {element.status !== "confirmed" && <button type="button" onClick={() => onStatus(element, "confirmed")}>Confirmar</button>}
      <button type="button" onClick={() => onStatus(element, "dismissed")}>Descartar</button>
      <button type="button" onClick={() => onView(element)} disabled={!sceneExists}>Ir a escena</button>
      {onViewPulse && <button type="button" onClick={() => onViewPulse(element.sceneId)} disabled={!sceneExists}>Ver en Narrative Pulse →</button>}
    </div>
  </article>;
}

function statusSymbol(status: WriterNarrativeLink["status"]) { return status === "confirmed" ? "✓" : status === "needs_review" ? "!" : "?"; }
function statusLabel(status: WriterNarrativeLink["status"]) { return status === "confirmed" ? "Confirmado" : status === "dismissed" ? "Descartado" : status === "needs_review" ? "Necesita revisión" : "Sugerido"; }
