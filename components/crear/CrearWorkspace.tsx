"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import CrearSessionRail from "./CrearSessionRail";
import CrearStructurePanel from "./CrearStructurePanel";
import {
  CrearApiError,
  crearJson,
  itemFromPayload,
  sessionFromPayload,
  sessionsFromPayload,
  shortText,
  type CrearItem,
  type CrearItemState,
  type CrearItemType,
  type CrearMessage,
  type CrearReaction,
  type CrearSession,
  type CrearSessionDetail,
} from "./model";

const REACTIONS = ["🔥", "❤️", "💡", "🤔", "😂", "🧠", "❌"] as const;

export default function CrearWorkspace({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<CrearSessionDetail | null>(null);
  const [sessions, setSessions] = useState<CrearSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [replyTo, setReplyTo] = useState<CrearMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const sessionsDialog = useRef<HTMLDialogElement>(null);
  const structureDialog = useRef<HTMLDialogElement>(null);
  const sessionsTrigger = useRef<HTMLButtonElement>(null);
  const structureTrigger = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  const loadDetail = useCallback(async (withLoading = false) => {
    if (withLoading) setLoading(true);
    setPageError(null);
    try {
      const next = await crearJson<CrearSessionDetail>(`/api/crear/sessions/${sessionId}`);
      setDetail(next);
      setTitleDraft(next.session.title);
      return next;
    } catch (cause) {
      const message = apiMessage(cause, "No pudimos abrir esta idea.");
      if (withLoading) setPageError(message);
      else setFeedback(message);
      return null;
    } finally {
      if (withLoading) setLoading(false);
    }
  }, [sessionId]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const payload = await crearJson<{ sessions?: CrearSession[] } | CrearSession[]>("/api/crear/sessions");
      setSessions(sessionsFromPayload(payload));
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      crearJson<CrearSessionDetail>(`/api/crear/sessions/${sessionId}`),
      crearJson<{ sessions?: CrearSession[] } | CrearSession[]>("/api/crear/sessions"),
    ]).then(([detailResult, sessionsResult]) => {
      if (!active) return;
      if (detailResult.status === "fulfilled") {
        setDetail(detailResult.value);
        setTitleDraft(detailResult.value.session.title);
        setPageError(null);
      } else {
        setPageError(apiMessage(detailResult.reason, "No pudimos abrir esta idea."));
      }
      if (sessionsResult.status === "fulfilled") setSessions(sessionsFromPayload(sessionsResult.value));
      setLoading(false);
      setSessionsLoading(false);
    });
    return () => { active = false; };
  }, [sessionId]);

  useEffect(() => {
    if (!detail?.messages.length) return;
    logEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [detail?.messages.length]);

  function closeDialog(dialog: RefObject<HTMLDialogElement | null>, trigger: RefObject<HTMLButtonElement | null>) {
    dialog.current?.close();
    trigger.current?.focus();
  }

  async function createSession() {
    if (creating) return;
    setCreating(true);
    setFeedback(null);
    try {
      const payload = await crearJson<{ session?: CrearSession } | CrearSession>("/api/crear/sessions", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const session = sessionFromPayload(payload);
      if (!session?.id) throw new CrearApiError("La sesión se creó sin un identificador válido.");
      router.push(`/crear/${session.id}`);
    } catch (cause) {
      setFeedback(apiMessage(cause, "No pudimos crear otra idea."));
      setCreating(false);
    }
  }

  async function saveTitle(event: FormEvent) {
    event.preventDefault();
    if (!detail || !titleDraft.trim()) return;
    const previous = detail.session;
    const title = titleDraft.trim();
    setDetail({ ...detail, session: { ...detail.session, title } });
    setEditingTitle(false);
    setFeedback(null);
    try {
      const payload = await crearJson<{ session?: CrearSession } | CrearSession>(`/api/crear/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      const session = sessionFromPayload(payload);
      if (session) setDetail((current) => current ? { ...current, session } : current);
      void loadSessions();
    } catch (cause) {
      setDetail((current) => current ? { ...current, session: previous } : current);
      setTitleDraft(previous.title);
      setFeedback(apiMessage(cause, "No pudimos cambiar el título."));
    }
  }

  async function sendMessage(event?: FormEvent, retry?: CrearMessage) {
    event?.preventDefault();
    const content = retry?.content ?? composer.trim();
    if (!detail || !content || sending) return;
    const parentMessageId = retry?.parentMessageId ?? replyTo?.id ?? null;
    const originalReply = replyTo;
    if (!retry) {
      const optimistic: CrearMessage = {
        id: `local-${crypto.randomUUID()}`,
        sessionId,
        role: "user",
        content,
        parentMessageId,
        metadata: {},
        createdAt: new Date().toISOString(),
      };
      setDetail({ ...detail, messages: [...detail.messages, optimistic] });
      setComposer("");
      setReplyTo(null);
    }
    setSending(true);
    setFeedback(null);
    try {
      const result = await crearJson<{ messages: CrearMessage[]; items: CrearItem[] }>(`/api/crear/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, parentMessageId }),
      });
      setDetail((current) => current ? { ...current, messages: result.messages, items: result.items } : current);
      void loadSessions();
    } catch (cause) {
      const message = apiMessage(cause, "No pudimos continuar la conversación.");
      setFeedback(cause instanceof CrearApiError && cause.code === "provider_unavailable"
        ? `${message} Tu mensaje quedó visible; puedes continuar cuando el servicio vuelva.`
        : message);
      const saved = await loadDetail(false);
      if (!retry && !saved?.messages.some((entry) => entry.role === "user" && entry.content === content
        && entry.parentMessageId === parentMessageId && entry.metadata.awaitingAssistant === true)) {
        setComposer(content);
        setReplyTo(originalReply);
      }
    } finally {
      setSending(false);
      composerRef.current?.focus();
    }
  }

  function composerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendMessage();
  }

  async function toggleReaction(messageId: string, emoji: CrearReaction["emoji"]) {
    if (!detail) return;
    const current = detail.reactions.find((reaction) => reaction.messageId === messageId && reaction.emoji === emoji)?.active === true;
    const previous = detail.reactions;
    const next = previous.filter((reaction) => !(reaction.messageId === messageId && reaction.emoji === emoji));
    if (!current) next.push({ messageId, emoji, active: true });
    setDetail({ ...detail, reactions: next });
    try {
      await crearJson(`/api/crear/sessions/${sessionId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ messageId, emoji, active: !current }),
      });
    } catch (cause) {
      setDetail((value) => value ? { ...value, reactions: previous } : value);
      setFeedback(apiMessage(cause, "No pudimos guardar la reacción."));
    }
  }

  async function saveMessageAs(message: CrearMessage, state: Extract<CrearItemState, "canon" | "maybe" | "discarded">) {
    if (!detail || busyMessageId) return;
    setBusyMessageId(message.id);
    setFeedback(null);
    try {
      const existing = detail.items.find((entry) => entry.sourceMessageId === message.id && entry.content === message.content);
      const payload = existing
        ? await crearJson<{ item?: CrearItem } | CrearItem>(`/api/crear/sessions/${sessionId}/items/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({ state }),
          })
        : await crearJson<{ item?: CrearItem } | CrearItem>(`/api/crear/sessions/${sessionId}/items`, {
            method: "POST",
            body: JSON.stringify({
              sourceMessageId: message.id,
              type: suggestedItemType(message.metadata),
              state,
              content: message.content,
            }),
          });
      const item = itemFromPayload(payload);
      if (item) setDetail({ ...detail, items: [...detail.items.filter((entry) => entry.id !== item.id), item] });
      else await loadDetail(false);
      setFeedback(state === "canon" ? "Guardado como Canon." : state === "maybe" ? "Guardado en Maybe." : "Idea descartada.");
    } catch (cause) {
      setFeedback(apiMessage(cause, "No pudimos guardar esta decisión."));
    } finally {
      setBusyMessageId(null);
    }
  }

  async function updateItem(itemId: string, patch: Partial<Pick<CrearItem, "title" | "content" | "state">>) {
    if (!detail || busyItemId) return;
    setBusyItemId(itemId);
    setFeedback(null);
    try {
      const result = await crearJson<{ item?: CrearItem } | CrearItem>(`/api/crear/sessions/${sessionId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      const item = itemFromPayload(result);
      if (item) setDetail({ ...detail, items: detail.items.map((entry) => entry.id === itemId ? item : entry) });
      else await loadDetail(false);
    } catch (cause) {
      setFeedback(apiMessage(cause, "No pudimos actualizar este elemento."));
      throw cause;
    } finally {
      setBusyItemId(null);
    }
  }

  async function deleteItem(itemId: string) {
    if (!detail || busyItemId) return;
    setBusyItemId(itemId);
    setFeedback(null);
    try {
      await crearJson(`/api/crear/sessions/${sessionId}/items/${itemId}`, { method: "DELETE" });
      setDetail({ ...detail, items: detail.items.filter((item) => item.id !== itemId) });
    } catch (cause) {
      setFeedback(apiMessage(cause, "No pudimos quitar este elemento."));
    } finally {
      setBusyItemId(null);
    }
  }

  async function convertToProject() {
    if (!detail || converting) return;
    setConverting(true);
    setFeedback(null);
    try {
      const result = await crearJson<{ projectId: string; writerId: string }>(`/api/crear/sessions/${sessionId}/convert`, { method: "POST" });
      router.push(`/writer/${result.writerId}?project=${result.projectId}`);
    } catch (cause) {
      setFeedback(apiMessage(cause, "No pudimos convertir esta idea en proyecto."));
      setConverting(false);
    }
  }

  if (loading) return <CrearWorkspaceLoading />;
  if (pageError || !detail) return <CrearWorkspaceError message={pageError ?? "No encontramos esta idea."} onRetry={() => void loadDetail(true)} />;
  const pendingMessage = detail.messages.findLast((message) => message.role === "user" && message.metadata.awaitingAssistant === true) ?? null;

  return (
    <main className="crear-workspace">
      <aside className="crear-session-rail">
        <CrearSessionRail sessions={sessions} activeSessionId={sessionId} loading={sessionsLoading} creating={creating} onCreate={() => void createSession()} />
      </aside>

      <section className="crear-chat-shell">
        <header className="crear-chat-header">
          <button ref={sessionsTrigger} className="crear-mobile-control crear-mobile-sessions" type="button" onClick={() => sessionsDialog.current?.showModal()} aria-label="Abrir conversaciones">☰</button>
          <div className="crear-title-wrap">
            {editingTitle ? <form className="crear-title-form" onSubmit={saveTitle}>
              <label className="sr-only" htmlFor="crear-session-title">Título de la idea</label>
              <input id="crear-session-title" autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} maxLength={120} />
              <button type="submit" disabled={!titleDraft.trim()}>Guardar</button>
              <button type="button" onClick={() => { setTitleDraft(detail.session.title); setEditingTitle(false); }}>Cancelar</button>
            </form> : <button className="crear-title-button" type="button" onClick={() => setEditingTitle(true)} title="Editar título">
              <span>{detail.session.title || "Idea sin título"}</span><i aria-hidden="true">✎</i>
            </button>}
            <span className="crear-save-state"><i aria-hidden="true" /> Guardado</span>
          </div>
          <div className="crear-header-actions">
            <button ref={structureTrigger} className="crear-structure-trigger" type="button" onClick={() => structureDialog.current?.showModal()}>Estructura <span>{detail.items.filter((item) => item.state !== "discarded").length}</span></button>
            <button className="crear-convert" type="button"
              disabled={converting || (!detail.session.premise && !detail.items.some((item) => item.state === "canon" || (item.state === "active" && item.type !== "pending")))}
              title="Guarda una premisa o una decisión para convertir esta idea"
              onClick={() => void convertToProject()}>{converting ? "Convirtiendo…" : "Convertir en proyecto"}<span aria-hidden="true">↗</span></button>
          </div>
        </header>

        <div className="crear-chat-scroll" role="log" aria-label="Conversación creativa" aria-live="polite" aria-busy={sending}>
          <div className="crear-chat-column">
            {!detail.messages.length && <CrearEmptyConversation onPrompt={(prompt) => { setComposer(prompt); composerRef.current?.focus(); }} />}
            {detail.messages.map((message) => (
              <MessageBlock
                key={message.id}
                message={message}
                parent={message.parentMessageId ? detail.messages.find((entry) => entry.id === message.parentMessageId) ?? null : null}
                reactions={detail.reactions.filter((reaction) => reaction.messageId === message.id && reaction.active)}
                busy={busyMessageId === message.id}
                onReply={() => { setReplyTo(message); composerRef.current?.focus(); }}
                onReaction={(emoji) => void toggleReaction(message.id, emoji)}
                onState={(state) => void saveMessageAs(message, state)}
              />
            ))}
            {sending && <div className="crear-thinking" role="status"><span aria-hidden="true"><i /><i /><i /></span><p>FILMATTA está pensando contigo…</p></div>}
            <div ref={logEnd} />
          </div>
        </div>

        <div className="crear-composer-zone">
          {feedback && <div className="crear-feedback" role="status"><span>{feedback}</span><button type="button" onClick={() => setFeedback(null)} aria-label="Cerrar aviso">×</button></div>}
          {pendingMessage && !sending && <div className="crear-feedback" role="status"><span>Tu mensaje está guardado y espera respuesta.</span><button className="crear-retry" type="button" onClick={() => void sendMessage(undefined, pendingMessage)}>Intentar de nuevo</button></div>}
          <form className="crear-composer" onSubmit={(event) => void sendMessage(event)}>
            {replyTo && <div className="crear-composer-reply"><span>Respondiendo a {replyTo.role === "assistant" ? "FILMATTA" : "tu mensaje"}</span><p>{shortText(replyTo.content, 130)}</p><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar respuesta">×</button></div>}
            <label className="sr-only" htmlFor="crear-message">Mensaje</label>
            <textarea ref={composerRef} id="crear-message" value={composer} onChange={(event) => setComposer(event.target.value)} onKeyDown={composerKeyDown} maxLength={6000} rows={2} disabled={sending} placeholder="Cuéntame qué tienes en mente…" />
            <div className="crear-composer-actions"><span>Enter para enviar · Shift + Enter para nueva línea</span><button type="submit" disabled={sending || !composer.trim()} aria-label="Enviar mensaje">↑</button></div>
          </form>
          <p className="crear-privacy">Tus ideas son tuyas. FILMATTA no reclama propiedad sobre tu proyecto.</p>
        </div>
      </section>

      <aside className="crear-structure-rail">
        <CrearStructurePanel session={detail.session} items={detail.items} busyItemId={busyItemId} onUpdate={updateItem} onDelete={deleteItem} />
      </aside>

      <dialog ref={sessionsDialog} className="crear-mobile-dialog crear-sessions-dialog" aria-label="Conversaciones" onClose={() => sessionsTrigger.current?.focus()} onClick={(event) => { if (event.target === event.currentTarget) closeDialog(sessionsDialog, sessionsTrigger); }}>
        <div className="crear-mobile-dialog-head"><strong>Conversaciones</strong><button type="button" onClick={() => closeDialog(sessionsDialog, sessionsTrigger)}>Cerrar ×</button></div>
        <CrearSessionRail sessions={sessions} activeSessionId={sessionId} loading={sessionsLoading} creating={creating} onCreate={() => void createSession()} />
      </dialog>

      <dialog ref={structureDialog} className="crear-mobile-dialog crear-structure-dialog" aria-label="Estructura de la idea" onClose={() => structureTrigger.current?.focus()} onClick={(event) => { if (event.target === event.currentTarget) closeDialog(structureDialog, structureTrigger); }}>
        <div className="crear-mobile-dialog-head"><strong>Estructura de la idea</strong><button type="button" onClick={() => closeDialog(structureDialog, structureTrigger)}>Cerrar ×</button></div>
        <CrearStructurePanel session={detail.session} items={detail.items} busyItemId={busyItemId} onUpdate={updateItem} onDelete={deleteItem} />
      </dialog>
    </main>
  );
}

function MessageBlock({ message, parent, reactions, busy, onReply, onReaction, onState }: {
  message: CrearMessage;
  parent: CrearMessage | null;
  reactions: CrearReaction[];
  busy: boolean;
  onReply: () => void;
  onReaction: (emoji: CrearReaction["emoji"]) => void;
  onState: (state: Extract<CrearItemState, "canon" | "maybe" | "discarded">) => void;
}) {
  const paragraphs = message.content.split(/\n{2,}/u).map((paragraph) => paragraph.trim()).filter(Boolean);
  const label = message.role === "assistant" ? "FILMATTA" : "TÚ";
  return (
    <article className={`crear-message crear-message--${message.role}${message.id.startsWith("local-") ? " is-local" : ""}`}>
      <header><span>{label}</span><time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time></header>
      <div className="crear-message-body">
        {parent && <blockquote><span>↳ {parent.role === "assistant" ? "FILMATTA" : "Tú"}</span>{shortText(parent.content, 150)}</blockquote>}
        {paragraphs.map((paragraph, index) => <p key={`${message.id}-${index}`}>{paragraph}</p>)}
      </div>
      <div className="crear-message-footer">
        <div className="crear-message-actions">
          <details className="crear-reaction-picker">
            <summary aria-label="Añadir una reacción"><span aria-hidden="true">☺</span>{reactions.length > 0 && <i>{reactions.map((reaction) => reaction.emoji).join(" ")}</i>}</summary>
            <div aria-label="Reacciones">
              {REACTIONS.map((emoji) => <button key={emoji} type="button" aria-label={`Reaccionar con ${emoji}`} aria-pressed={reactions.some((reaction) => reaction.emoji === emoji)} onClick={() => onReaction(emoji)}>{emoji}</button>)}
            </div>
          </details>
          <button type="button" onClick={onReply}>Responder</button>
          <button type="button" disabled={busy || message.id.startsWith("local-")} onClick={() => onState("canon")}>Canon</button>
          <button type="button" disabled={busy || message.id.startsWith("local-")} onClick={() => onState("maybe")}>Maybe</button>
          <button type="button" disabled={busy || message.id.startsWith("local-")} onClick={() => onState("discarded")}>Descartar</button>
        </div>
      </div>
    </article>
  );
}

function CrearEmptyConversation({ onPrompt }: { onPrompt: (value: string) => void }) {
  return (
    <section className="crear-chat-empty">
      <span aria-hidden="true">✦</span>
      <p className="crear-kicker">UNA CONVERSACIÓN PARA EMPEZAR</p>
      <h1>Tienes una idea.<br />Empieza aquí.</h1>
      <p>Puede ser una escena, una premisa, un personaje o algo que todavía no sabes cómo nombrar.</p>
      <div>
        <button type="button" onClick={() => onPrompt("Tengo una premisa para una película: ")}>Tengo una premisa</button>
        <button type="button" onClick={() => onPrompt("Hay un personaje que no puedo dejar de pensar: ")}>Tengo un personaje</button>
        <button type="button" onClick={() => onPrompt("Sólo tengo una imagen o una escena: ")}>Tengo una escena</button>
      </div>
    </section>
  );
}

function CrearWorkspaceLoading() {
  return <main className="crear-workspace-state" aria-busy="true"><span aria-hidden="true">✦</span><h1>Abriendo tu idea…</h1><p>Recuperando conversación y estructura.</p></main>;
}

function CrearWorkspaceError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="crear-workspace-state"><span aria-hidden="true">!</span><h1>No pudimos abrir esta idea.</h1><p>{message}</p><button type="button" onClick={onRetry}>Reintentar</button></main>;
}

function suggestedItemType(metadata: CrearMessage["metadata"]): CrearItemType {
  const suggested = Array.isArray(metadata.suggestions) ? metadata.suggestions[0]?.type : undefined;
  const value = suggested ?? metadata.suggestedType ?? metadata.type;
  return value === "premise" || value === "character" || value === "world" || value === "theme" || value === "pending" ? value : "pending";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function apiMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
