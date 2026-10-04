"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WriterGuidedReference,
  WriterGuidedWritingMessage,
  WriterGuidedWritingScope,
} from "@/lib/writer/guided-writing";
import WriterAssistantSectionHeading from "./WriterAssistantSectionHeading";
import type { WriterIdeaContext } from "@/lib/writer/ideas";

const QUICK_STARTS = [
  "Siento que esta escena no avanza.",
  "No sé cuándo revelar esta información.",
  "¿Este cambio del personaje está preparado?",
];

export default function WriterGuidedWriting({
  scope,
  sceneNumber,
  sceneTitle,
  messages,
  documentHash,
  loaded,
  sending,
  feedback,
  onScopeChange,
  onSend,
  onCancel,
  onReference,
  ideaContext,
  onClearIdeaContext,
}: {
  scope: WriterGuidedWritingScope;
  sceneNumber: number | null;
  sceneTitle: string | null;
  messages: WriterGuidedWritingMessage[];
  documentHash: string | null;
  loaded: boolean;
  sending: boolean;
  feedback: string | null;
  onScopeChange: (scope: WriterGuidedWritingScope) => void;
  onSend: (question: string) => Promise<boolean>;
  onCancel: () => void;
  onReference: (reference: WriterGuidedReference) => void;
  ideaContext: WriterIdeaContext | null;
  onClearIdeaContext: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [pendingResponseId, setPendingResponseId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const knownAssistantIdsRef = useRef<Set<string> | null>(null);
  const waitingForResponseRef = useRef(false);
  const userMovedDuringWaitRef = useRef(false);

  useEffect(() => {
    if (!sending) return;
    waitingForResponseRef.current = true;
    userMovedDuringWaitRef.current = false;
    const scroller = rootRef.current?.closest<HTMLElement>(".writer-observations-scroll");
    if (!scroller) return;
    const markManual = () => { userMovedDuringWaitRef.current = true; };
    scroller.addEventListener("wheel", markManual, { passive: true });
    scroller.addEventListener("touchmove", markManual, { passive: true });
    scroller.addEventListener("scroll", markManual, { passive: true });
    return () => {
      scroller.removeEventListener("wheel", markManual);
      scroller.removeEventListener("touchmove", markManual);
      scroller.removeEventListener("scroll", markManual);
    };
  }, [sending]);

  const revealResponse = useCallback((messageId: string) => {
    const root = rootRef.current;
    const scroller = root?.closest<HTMLElement>(".writer-observations-scroll");
    const response = root?.querySelector<HTMLElement>(`[data-guided-message-id="${CSS.escape(messageId)}"]`);
    if (!scroller || !response) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const responseRect = response.getBoundingClientRect();
    scroller.scrollTo({
      top: Math.max(0, scroller.scrollTop + responseRect.top - scrollerRect.top - 12),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    setPendingResponseId(null);
  }, []);

  useEffect(() => {
    const assistantIds = messages.filter((message) => message.role === "assistant" && message.response).map((message) => message.id);
    if (knownAssistantIdsRef.current === null) {
      knownAssistantIdsRef.current = new Set(assistantIds);
      return;
    }
    const nextId = assistantIds.findLast((id) => !knownAssistantIdsRef.current!.has(id));
    knownAssistantIdsRef.current = new Set(assistantIds);
    if (!nextId || !waitingForResponseRef.current) return;
    waitingForResponseRef.current = false;
    if (userMovedDuringWaitRef.current) setPendingResponseId(nextId);
    else revealResponse(nextId);
  }, [messages, revealResponse]);

  async function submit() {
    const value = question.trim();
    if (!value || sending || !documentHash || (scope === "scene" && !sceneTitle)) return;
    setQuestion("");
    const sent = await onSend(value);
    if (!sent) setQuestion(value);
  }

  return (
    <div ref={rootRef} className="writer-guided-writing" aria-busy={sending}>
      <header className="writer-guided-heading">
        <WriterAssistantSectionHeading title="GUÍA · PENSARLO JUNTOS" help="Piensa opciones sobre una escena o el guion completo. Te ayuda a decidir sin reescribir el documento automáticamente." />
        <h3>¿Qué estás intentando resolver?</h3>
        <p>Puedo ayudarte a pensar escenas, personajes y estructura sin escribir el guion por ti.</p>
      </header>

      <div className="writer-guided-scope" role="group" aria-label="Contexto de Guided Writing">
        <button type="button" aria-pressed={scope === "scene"} disabled={!sceneTitle || sending} onClick={() => onScopeChange("scene")}>Esta escena</button>
        <button type="button" aria-pressed={scope === "document"} disabled={sending} onClick={() => onScopeChange("document")}>Todo el guion</button>
      </div>

      <p className="writer-guided-context">
        <strong>Contexto:</strong> {scope === "scene"
          ? sceneTitle ? `${sceneNumber ? `Escena ${sceneNumber} · ` : ""}${sceneTitle}` : "Coloca el cursor dentro de una escena."
          : "Todo el guion · estructura y relaciones guardadas"}
      </p>

      {ideaContext && <aside className="writer-guided-idea-context">
        <div><small>IDEA ELEGIDA · {ideaContext.category}</small><strong>{ideaContext.title}</strong><span>{ideaContext.scope === "scene" ? "Escena elegida" : "Todo el guion"} · revisión {ideaContext.sourceRevision}</span></div>
        <button type="button" onClick={onClearIdeaContext}>Retirar contexto</button>
        <details><summary>Ver dirección</summary><p>{ideaContext.direction}</p><p><strong>Efecto esperado:</strong> {ideaContext.consequence}</p></details>
      </aside>}

      <div className="writer-guided-conversation" aria-live="polite">
        {!loaded && <p className="writer-observations-empty">Cargando conversación…</p>}
        {loaded && !messages.length && <div className="writer-guided-empty">
          <span>Empieza con una decisión concreta.</span>
          <div>{QUICK_STARTS.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)}>{item}</button>)}</div>
        </div>}
        {messages.map((message) => message.role === "user"
          ? <div key={message.id} className="writer-guided-message is-user"><small>TÚ</small><p>{message.content}</p></div>
          : message.response && <GuidedResponse
              key={message.id}
              message={message}
              changed={Boolean(documentHash && message.documentHash !== documentHash)}
              onReference={onReference}
            />)}
        {sending && <div className="writer-guided-thinking" role="status"><span aria-hidden="true" />Pensando con el contexto actual…</div>}
      </div>

      {pendingResponseId && <button className="writer-guided-new-response" type="button" onClick={() => revealResponse(pendingResponseId)}>Ver nueva respuesta</button>}

      <form className="writer-guided-composer" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label htmlFor="writer-guided-question">Cuéntame qué decisión estás intentando tomar.</label>
        <textarea
          id="writer-guided-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void submit();
          }}
          rows={3}
          maxLength={1_200}
          placeholder={ideaContext ? "¿Qué quieres explorar de esta idea?" : "Estoy atorado con esta escena…"}
          disabled={sending || (scope === "scene" && !sceneTitle)}
        />
        <div><small>Enter envía · Shift+Enter añade una línea</small>{sending
          ? <button type="button" onClick={onCancel}>Cancelar</button>
          : <button type="submit" disabled={!question.trim() || !documentHash || (scope === "scene" && !sceneTitle)}>Pensarlo juntos</button>}
        </div>
      </form>
      {feedback && <p className="writer-assistant-feedback" role="status">{feedback}</p>}
    </div>
  );
}

function GuidedResponse({
  message,
  changed,
  onReference,
}: {
  message: WriterGuidedWritingMessage;
  changed: boolean;
  onReference: (reference: WriterGuidedReference) => void;
}) {
  const response = message.response!;
  return <article className="writer-guided-response" data-guided-message-id={message.id}>
    <div className="writer-guided-response-heading"><small>FILMATTA · LECTOR NARRATIVO</small>{changed && <span>El guion cambió desde esta respuesta.</span>}</div>
    <section><h4>Lo que parece estar ocurriendo</h4><p>{response.summary}</p></section>
    <section><h4>Preguntas que vale la pena responder</h4><ol>{response.questions.map((question) => <li key={question.id}>{question.text}</li>)}</ol></section>
    {response.options.length > 0 && <section><h4>Decisiones posibles</h4><div className="writer-guided-options">{response.options.map((option) => <div key={option.id}><strong>{option.title}</strong><p>{option.change}</p><small>{option.consequence}</small></div>)}</div></section>}
    {response.references.length > 0 && <section><h4>Conexiones del guion</h4><div className="writer-guided-references">{response.references.map((reference) => <button key={reference.referenceId} type="button" onClick={() => onReference(reference)}><span>{reference.label}</span><small>{reference.note}</small><b aria-hidden="true">→</b></button>)}</div></section>}
    {response.redirectedFromWritingRequest && <p className="writer-guided-redirect">Esta respuesta conserva el foco en decisiones narrativas; no escribió la escena por ti.</p>}
    {response.warnings.map((warning) => <p key={`${warning.code}:${warning.message}`} className="writer-guided-warning">{warning.message}</p>)}
  </article>;
}
