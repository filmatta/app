"use client";

import { useEffect, useRef, useState } from "react";
import type {
  WriterGuidedReference,
  WriterGuidedWritingMessage,
  WriterGuidedWritingScope,
} from "@/lib/writer/guided-writing";

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
}) {
  const [question, setQuestion] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, sending]);

  async function submit() {
    const value = question.trim();
    if (!value || sending || !documentHash || (scope === "scene" && !sceneTitle)) return;
    setQuestion("");
    const sent = await onSend(value);
    if (!sent) setQuestion(value);
  }

  return (
    <div className="writer-guided-writing" aria-busy={sending}>
      <header className="writer-guided-heading">
        <p className="writer-eyebrow">Guided Writing</p>
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
        <div ref={endRef} />
      </div>

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
          placeholder="Estoy atorado con esta escena…"
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
  return <article className="writer-guided-response">
    <div className="writer-guided-response-heading"><small>FILMATTA · LECTOR NARRATIVO</small>{changed && <span>El guion cambió desde esta respuesta.</span>}</div>
    <section><h4>Lo que parece estar ocurriendo</h4><p>{response.summary}</p></section>
    <section><h4>Preguntas que vale la pena responder</h4><ol>{response.questions.map((question) => <li key={question.id}>{question.text}</li>)}</ol></section>
    {response.options.length > 0 && <section><h4>Decisiones posibles</h4><div className="writer-guided-options">{response.options.map((option) => <div key={option.id}><strong>{option.title}</strong><p>{option.change}</p><small>{option.consequence}</small></div>)}</div></section>}
    {response.references.length > 0 && <section><h4>Conexiones del guion</h4><div className="writer-guided-references">{response.references.map((reference) => <button key={reference.referenceId} type="button" onClick={() => onReference(reference)}><span>{reference.label}</span><small>{reference.note}</small><b aria-hidden="true">→</b></button>)}</div></section>}
    {response.redirectedFromWritingRequest && <p className="writer-guided-redirect">Esta respuesta conserva el foco en decisiones narrativas; no escribió la escena por ti.</p>}
    {response.warnings.map((warning) => <p key={`${warning.code}:${warning.message}`} className="writer-guided-warning">{warning.message}</p>)}
  </article>;
}
