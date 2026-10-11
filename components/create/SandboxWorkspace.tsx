"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CreateProjectContext } from "@/lib/create/project";
import { isIdeationSynthesis } from "@/lib/create/ideation/contract";
import type { SandboxGuide } from "@/lib/create/sandbox/context";
import type { SandboxMessage, SandboxMode, SandboxPossibility, SandboxQuota, SandboxSession, SandboxTurn } from "@/lib/create/sandbox/types";
import { acceptWriterContextAction, sendSandboxMessageAction, setSandboxModeAction, setSandboxPossibilityAction, sandboxUpgradeIntentAction } from "@/app/create/projects/[id]/sandbox/actions";
import type { ActiveWriterContext } from "@/lib/create/sandbox/writer-context-server";
import { applySandboxHandoffAction } from "@/app/create/projects/[id]/sandbox/handoff-actions";

type Props = {
  project: CreateProjectContext;
  session: SandboxSession | null;
  guide: SandboxGuide | null;
  writerContext: ActiveWriterContext | null;
  brief: string;
  entryPrompts: string[];
  turns: SandboxTurn[];
  messages: SandboxMessage[];
  possibilities: SandboxPossibility[];
  quota: SandboxQuota;
};
type Pending = { id: string; content: string; mode: SandboxMode };
type Conflict = { possibilityId: string; canonId: string; canonContent: string };

export default function SandboxWorkspace({ project, session, guide, writerContext, brief, entryPrompts, turns, messages, possibilities, quota }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<SandboxMode>(session?.mode ?? "divergence");
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [writerContextBusy, setWriterContextBusy] = useState(false);
  const [writerContextError, setWriterContextError] = useState("");
  const [selectedWriterId, setSelectedWriterId] = useState(project.writers[0]?.id ?? "");
  const [contextOpen, setContextOpen] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffError, setHandoffError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(possibilities.filter((item) => item.state === "canon").map((item) => item.id));
  const [newDecision, setNewDecision] = useState("");
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const handoffOperation = useRef<string | null>(null);
  const canon = possibilities.filter((item) => item.state === "canon");
  const maybe = possibilities.filter((item) => item.state === "maybe");
  const proposed = possibilities.filter((item) => item.state === "proposed");
  const discarded = possibilities.filter((item) => item.state === "discarded");
  const synthesis = guide && isIdeationSynthesis(guide.synthesis) ? guide.synthesis : null;
  const openQuestions = [
    ...(synthesis?.sections.openQuestions.text.trim() ? [synthesis.sections.openQuestions.text.trim()] : []),
    ...turns.flatMap((turn) => turn.response?.questions ?? []),
  ].filter((value, index, all) => all.indexOf(value) === index).slice(-10);
  const writerHref = project.writers.length === 1
    ? `/writer/${project.writers[0].id}?project=${project.id}`
    : `/create/projects/${project.id}#writer`;
  const reachedLimit = quota.plan === "free" && quota.used >= quota.limit;
  const messageByTurn = new Map(messages.filter((item) => item.role === "user").map((item) => [item.turn_id, item]));
  const answerByTurn = new Map(messages.filter((item) => item.role === "assistant").map((item) => [item.turn_id, item]));

  useEffect(() => {
    if (!turns.some((turn) => turn.status === "pending")) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [turns]);

  async function changeMode(next: SandboxMode) {
    if (busy || next === mode) return;
    const previous = mode; setMode(next); setError("");
    if (!session) return;
    try {
      const result = await setSandboxModeAction(project.id, session.id, next);
      if (!result.ok) { setMode(previous); setError(result.message); }
      else router.refresh();
    } catch { setMode(previous); setError("No pudimos guardar el modo. Inténtalo de nuevo."); }
  }

  async function applyWriterContext() {
    if (writerContextBusy || !selectedWriterId) return;
    setWriterContextBusy(true); setWriterContextError("");
    try {
      const result = await acceptWriterContextAction(project.id, selectedWriterId);
      if (!result.ok) setWriterContextError(result.message);
      else router.refresh();
    } catch { setWriterContextError("No pudimos preparar el contexto. Inténtalo de nuevo."); }
    finally { setWriterContextBusy(false); }
  }

  async function send(turn: Pending) {
    if (busy) return;
    setBusy(true); setPending(turn); setError("");
    try {
      const result = await sendSandboxMessageAction({ projectId: project.id, sessionId: session?.id ?? null,
        turnId: turn.id, content: turn.content, mode: turn.mode });
      if (!result.ok) {
        if (!result.turnId || result.kind === "limit" || result.kind === "invalid") {
          setPending(null); setComposer(turn.content);
        }
        setError(result.message);
        router.refresh();
        return;
      }
      setComposer(""); setError(""); router.refresh();
    } catch {
      // Keep the exact operation ID: retrying after an interrupted request is idempotent.
      setError("No pudimos confirmar la respuesta. Inténtalo de nuevo con el mismo mensaje.");
    } finally { setBusy(false); }
  }

  function onSend(event: FormEvent) {
    event.preventDefault();
    const content = composer.trim();
    if (!content || busy || reachedLimit) return;
    const turn = { id: crypto.randomUUID(), content, mode };
    setComposer("");
    void send(turn);
  }

  async function decide(item: SandboxPossibility, state: "proposed" | "maybe" | "canon" | "discarded",
    resolution?: "replace" | "coexist" | "maybe" | "cancel") {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await setSandboxPossibilityAction(project.id, item.id, state, resolution);
      if (!result.ok) {
        if (result.kind === "conflict" && result.conflict)
          setConflict({ possibilityId: item.id, canonId: result.conflict.id, canonContent: result.conflict.content });
        else setError(result.message);
        return;
      }
      setConflict(null); router.refresh();
    } catch { setError("No pudimos guardar la decisión. Inténtalo de nuevo."); }
    finally { setBusy(false); }
  }

  function openHandoff() {
    setSelectedIds(possibilities.filter((item) => item.state === "canon").map((item) => item.id));
    setSelectedQuestions([]); setNewDecision(""); setHandoffError("");
    handoffOperation.current = crypto.randomUUID();
    setHandoffOpen(true);
  }

  async function applyHandoff() {
    if (handoffBusy) return;
    setHandoffBusy(true); setHandoffError("");
    handoffOperation.current ??= crypto.randomUUID();
    try {
      const result = await applySandboxHandoffAction({
        projectId: project.id, operationId: handoffOperation.current,
        selectedPossibilityIds: selectedIds, questions: selectedQuestions,
        newDecisions: newDecision.trim() ? [newDecision.trim()] : [],
      });
      if (!result.ok) { setHandoffError(result.message); return; }
      router.push(result.href);
    } catch { setHandoffError("No pudimos confirmar la guía. Puedes reintentar sin duplicarla."); }
    finally { setHandoffBusy(false); }
  }

  return <main className="sandbox">
    <header className="sandbox-heading">
      <div><p className="sandbox-eyebrow">FILMATTA · ESPACIO PARA EXPLORAR IDEAS</p>
        <h1>Sandbox</h1><span>{project.name}</span></div>
      <div className="sandbox-heading-actions">
        <button type="button" className="sandbox-context-desktop-toggle" aria-expanded={!contextCollapsed}
          onClick={() => setContextCollapsed((value) => !value)}>{contextCollapsed ? "Mostrar contexto" : "Ocultar contexto"}</button>
        <button type="button" className="sandbox-context-toggle" onClick={() => setContextOpen(true)}>Contexto y decisiones</button>
        <button type="button" onClick={openHandoff}>Llevar a Writer</button>
      </div>
    </header>
    <div className={`sandbox-layout ${contextCollapsed ? "is-collapsed" : ""}`}>
      <section className="sandbox-conversation" aria-label="Conversación creativa">
        <div className="sandbox-mode" role="group" aria-label="Modo creativo">
          <button type="button" aria-pressed={mode === "divergence"} onClick={() => void changeMode("divergence")}>Explorar</button>
          <button type="button" aria-pressed={mode === "convergence"} onClick={() => void changeMode("convergence")}>Aterrizar</button>
          <span>{mode === "divergence" ? "Abrir caminos" : "Comparar y decidir"}</span>
        </div>
        <div className="sandbox-thread" aria-live="polite">
          <article className="sandbox-brief"><small>CONTEXTO DEL PROJECT</small><p>{brief}</p></article>
          {!guide && project.writers.length > 0 && <section className="sandbox-writer-context" aria-label="Contexto de Writer">
            <small>WRITER → SANDBOX</small>
            {writerContext ? <p>Usando un resumen narrativo de Writer (revisión {writerContext.writerRevision}).</p> : <>
              <p>Si quieres, Sandbox puede usar tu guion como contexto. Al aceptarlo, se enviarán a la IA fragmentos narrativos seleccionados (máximo 8.000 caracteres) para crear un resumen breve. El guion no cambiará.</p>
              {project.writers.length > 1 && <label>Guion
                <select value={selectedWriterId} onChange={(event) => setSelectedWriterId(event.target.value)}>
                  {project.writers.map((writer) => <option key={writer.id} value={writer.id}>{writer.title}</option>)}
                </select></label>}
              <button type="button" disabled={writerContextBusy} onClick={() => void applyWriterContext()}>
                {writerContextBusy ? "Preparando contexto…" : "Usar guion como contexto"}
              </button>
            </>}
            {writerContextError && <p className="sandbox-error" role="alert">{writerContextError}</p>}
          </section>}
          {turns.length === 0 && <div className="sandbox-entry"><p>¿Por dónde quieres empezar?</p>
            <div>{entryPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => setComposer(prompt)}>{prompt}</button>)}</div>
          </div>}
          {turns.map((turn) => {
            const user = messageByTurn.get(turn.id);
            const assistant = answerByTurn.get(turn.id);
            const turnPossibilities = possibilities.filter((item) => item.source_turn_id === turn.id);
            return <div className="sandbox-turn" key={turn.id}>
              {user && <article className="sandbox-user-message"><small>TÚ · {turn.mode === "divergence" ? "Explorar" : "Aterrizar"}</small><p>{user.content}</p></article>}
              {assistant && <article className="sandbox-assistant-message"><small>FILMATTA</small><p>{assistant.content}</p>
                {turn.response?.contradictions?.length ? <div className="sandbox-notes"><strong>Tensiones</strong><ul>{turn.response.contradictions.map((text, index) => <li key={index}>{text}</li>)}</ul></div> : null}
                {turnPossibilities.length > 0 && <div className="sandbox-suggestions"><strong>Posibilidades</strong>
                  {turnPossibilities.map((item) => <PossibilityRow key={item.id} item={item} onDecide={decide} />)}</div>}
              </article>}
              {turn.status === "failed" && user && !busy && <div className="sandbox-retry" role="alert">
                <span>Esta respuesta falló. Tu mensaje está guardado.</span>
                <button type="button" onClick={() => void send({ id: turn.id, content: user.content, mode: turn.mode })}>Intentar de nuevo</button>
              </div>}
              {turn.status === "pending" && !assistant && (now - Date.parse(turn.updated_at) > 185_000
                ? <div className="sandbox-retry" role="alert"><span>Esta respuesta se interrumpió. Tu mensaje está guardado.</span>
                    {user && <button type="button" disabled={busy} onClick={() => void send({ id: turn.id, content: user.content, mode: turn.mode })}>Intentar de nuevo</button>}</div>
                : <p className="sandbox-thinking">FILMATTA está pensando…</p>)}
            </div>;
          })}
          {pending && !messageByTurn.has(pending.id) && <article className="sandbox-user-message"><small>TÚ</small><p>{pending.content}</p></article>}
          {pending && !busy && !messageByTurn.has(pending.id) && <div className="sandbox-retry" role="alert">
            <span>No pudimos confirmar el envío.</span>
            <button type="button" onClick={() => void send(pending)}>Intentar de nuevo</button>
          </div>}
          {busy && <p className="sandbox-thinking">FILMATTA está pensando…</p>}
        </div>
        {error && <p className="sandbox-error" role="alert">{error}</p>}
        {reachedLimit && <section className="sandbox-limit" aria-label="Límite de Sandbox">
          <h2>Sigue explorando con Sandbox</h2>
          <p>Sandbox conserva el contexto de tu historia, abre variantes y te ayuda a aterrizarlas. El desbloqueo se conectará con Billing.</p>
          <div><Link href="/planes" onClick={() => void sandboxUpgradeIntentAction(project.id)}>Desbloquear Sandbox</Link>
            <button type="button" onClick={openHandoff}>Preparar guion</button>
            <Link href={writerHref}>Abrir Writer</Link><Link href={`/create/projects/${project.id}`}>Volver al Project</Link></div>
        </section>}
        <form className="sandbox-composer" onSubmit={onSend}>
          <label htmlFor="sandbox-composer-input">Tu mensaje</label>
          <textarea id="sandbox-composer-input" value={composer} onChange={(event) => setComposer(event.target.value.slice(0,4000))}
            placeholder="¿Qué posibilidad quieres explorar?" maxLength={4000} disabled={busy || reachedLimit} rows={3} />
          <div><small>{quota.plan === "free" ? `${Math.max(0, quota.limit - quota.used)} respuestas incluidas disponibles` : "Sandbox desbloqueado"}</small>
            <button type="submit" disabled={!composer.trim() || busy || reachedLimit}>{busy ? "Respondiendo…" : "Enviar"}</button></div>
        </form>
      </section>
      <aside className={`sandbox-context ${contextOpen ? "is-open" : ""}`} aria-label="Contexto y decisiones">
        <div className="sandbox-context-head"><div><small>ESTRUCTURA VIVA</small><h2>Tu historia</h2></div>
          <button type="button" onClick={() => setContextOpen(false)} aria-label="Cerrar contexto">×</button></div>
        <section><h3>Lo que sabemos</h3><p>{synthesis?.sections.premise.text || writerContext?.summary.premise || project.summary || "Premisa aún abierta."}</p>
          {synthesis?.sections.protagonists.text && <p><strong>Protagonista:</strong> {synthesis.sections.protagonists.text}</p>}</section>
        <DecisionSection title="Canon" items={canon} onDecide={decide} />
        <DecisionSection title="Maybe" items={maybe} onDecide={decide} />
        <section><h3>Preguntas abiertas</h3>{openQuestions.length ?
          <ul>{openQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul> : <p>Las preguntas aparecerán al explorar.</p>}</section>
        {proposed.length > 0 && <DecisionSection title="Por decidir" items={proposed} onDecide={decide} />}
        {discarded.length > 0 && <details><summary>Descartadas ({discarded.length})</summary>
          <DecisionSection title="" items={discarded} onDecide={decide} /></details>}
      </aside>
    </div>
    {contextOpen && <button className="sandbox-context-backdrop" type="button" aria-label="Cerrar contexto" onClick={() => setContextOpen(false)} />}
    {conflict && <div className="sandbox-dialog-backdrop" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="sandbox-conflict-title">
      <h2 id="sandbox-conflict-title">Esta decisión contradice un Canon vigente.</h2><p>{conflict.canonContent}</p>
      <div><button type="button" onClick={() => { const item = possibilities.find((entry) => entry.id === conflict.possibilityId); if (item) void decide(item,"canon","replace"); }}>Reemplazar Canon anterior</button>
        <button type="button" onClick={() => { const item = possibilities.find((entry) => entry.id === conflict.possibilityId); if (item) void decide(item,"canon","coexist"); }}>Conservar ambos</button>
        <button type="button" onClick={() => { const item = possibilities.find((entry) => entry.id === conflict.possibilityId); if (item) void decide(item,"canon","maybe"); }}>Mantener como Maybe</button>
        <button type="button" onClick={() => setConflict(null)}>Cancelar</button></div>
    </section></div>}
    {handoffOpen && <div className="sandbox-dialog-backdrop" role="presentation"><section className="sandbox-handoff" role="dialog" aria-modal="true" aria-labelledby="sandbox-handoff-title">
      <header><div><small>SANDBOX → WRITER</small><h2 id="sandbox-handoff-title">Revisa qué llevar al guion</h2></div>
        <button type="button" onClick={() => setHandoffOpen(false)} aria-label="Cerrar">×</button></header>
      <p>Prepararemos una guía. El texto del guion no cambiará.</p>
      <div className="sandbox-handoff-list"><strong>Decisiones y posibilidades</strong>
        {[...canon, ...maybe].length ? [...canon, ...maybe].map((item) => <label key={item.id}>
          <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) =>
            event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
          <span><small>{item.state === "canon" ? "CANON" : "MAYBE"}</small>{item.content}</span></label>) : <p>Aún no hay decisiones. Puedes conservar preguntas o añadir una decisión ahora.</p>}
      </div>
      {openQuestions.length > 0 && <div className="sandbox-handoff-list"><strong>Preguntas para conservar</strong>
        {openQuestions.map((question, index) => <label key={index}><input type="checkbox" checked={selectedQuestions.includes(question)}
          onChange={(event) => setSelectedQuestions((current) => event.target.checked ? [...current, question] : current.filter((text) => text !== question))} />
          <span>{question}</span></label>)}</div>}
      <label className="sandbox-handoff-new">Nueva decisión para la guía
        <textarea value={newDecision} onChange={(event) => setNewDecision(event.target.value.slice(0,300))}
          placeholder="Opcional: una decisión que acabas de tomar…" rows={2} /></label>
      <div className="sandbox-handoff-preview"><strong>Vista previa</strong><p>{selectedIds.length} elementos · {selectedQuestions.length} preguntas
        {newDecision.trim() ? " · 1 decisión nueva" : ""}</p><small>Se agregarán cues cuando haya espacio; conservaremos los anteriores y guardaremos una versión de la guía.</small></div>
      {handoffError && <p className="sandbox-error" role="alert">{handoffError}</p>}
      <footer><button type="button" onClick={() => setHandoffOpen(false)}>Volver</button>
        <button type="button" disabled={handoffBusy} onClick={() => void applyHandoff()}>{handoffBusy ? "Preparando…" : "Confirmar y abrir Writer"}</button></footer>
    </section></div>}
  </main>;
}

function DecisionSection({ title, items, onDecide }: {
  title: string; items: SandboxPossibility[];
  onDecide: (item: SandboxPossibility, state: "proposed" | "maybe" | "canon" | "discarded") => Promise<void>;
}) {
  return <section className="sandbox-decision-section">{title && <h3>{title} <span>{items.length}</span></h3>}
    {items.length ? <ul>{items.map((item) => <li key={item.id}><p>{item.content}</p>
      <div>{item.state !== "canon" && <button type="button" onClick={() => void onDecide(item,"canon")}>Canon</button>}
        {item.state !== "maybe" && <button type="button" onClick={() => void onDecide(item,"maybe")}>Maybe</button>}
        {item.state !== "discarded" && <button type="button" onClick={() => void onDecide(item,"discarded")}>Descartar</button>}
        {item.state === "discarded" && <button type="button" onClick={() => void onDecide(item,"proposed")}>Recuperar</button>}</div>
    </li>)}</ul> : <p>Aún no hay elementos.</p>}</section>;
}

function PossibilityRow({ item, onDecide }: {
  item: SandboxPossibility;
  onDecide: (item: SandboxPossibility, state: "proposed" | "maybe" | "canon" | "discarded") => Promise<void>;
}) {
  return <div className="sandbox-suggestion"><p>{item.content}</p><div>
    <button type="button" onClick={() => void onDecide(item,"maybe")}>Guardar como Maybe</button>
    <button type="button" onClick={() => void onDecide(item,"canon")}>Canon</button>
    <button type="button" onClick={() => void onDecide(item,"discarded")}>Descartar</button>
  </div></div>;
}
