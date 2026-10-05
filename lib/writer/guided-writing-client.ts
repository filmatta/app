"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WriterDocument } from "./document.ts";
import {
  type WriterGuidedWritingMessage,
  type WriterGuidedSelection,
  type WriterGuidedWritingResponse,
  type WriterGuidedWritingScope,
  type WriterGuidedWritingSession,
} from "./guided-writing.ts";
import { writerSetupPayoffSourceHash } from "./setup-payoff.ts";
import type { WriterIdeaContext } from "./ideas.ts";

async function postGuidedWriting(scriptId: string, body: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch(`/api/writer/scripts/${scriptId}/guided-writing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "No pudimos responder ahora.");
  return data;
}

export function useWriterGuidedWriting({
  scriptId,
  document,
  activeSceneId,
  enabled,
}: {
  scriptId: string;
  document: WriterDocument;
  activeSceneId: string | null;
  enabled: boolean;
}) {
  const [scope, setScopeState] = useState<WriterGuidedWritingScope>("scene");
  const [session, setSession] = useState<WriterGuidedWritingSession | null>(null);
  const [messages, setMessages] = useState<WriterGuidedWritingMessage[]>([]);
  const [documentHash, setDocumentHash] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const hashEpochRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    const epoch = ++hashEpochRef.current;
    void writerSetupPayoffSourceHash(document).then((hash) => {
      if (mountedRef.current && epoch === hashEpochRef.current) setDocumentHash(hash);
    });
  }, [document]);

  const reload = useCallback(async (requestedScope = scope, requestedSceneId = activeSceneId) => {
    if (requestedScope === "scene" && !requestedSceneId) {
      setSession(null);
      setMessages([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    try {
      const query = new URLSearchParams({ scope: requestedScope });
      if (requestedScope === "scene" && requestedSceneId) query.set("sceneId", requestedSceneId);
      const response = await fetch(`/api/writer/scripts/${scriptId}/guided-writing?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "No pudimos cargar Guided Writing.");
      if (!mountedRef.current) return;
      setSession(data.session ?? null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setFeedback(null);
    } catch (cause) {
      if (!mountedRef.current) return;
      setFeedback(cause instanceof Error ? cause.message : "No pudimos cargar Guided Writing.");
    } finally {
      if (mountedRef.current) setLoaded(true);
    }
  }, [activeSceneId, scope, scriptId]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => void reload(scope, activeSceneId), 0);
    return () => window.clearTimeout(timer);
  }, [activeSceneId, enabled, reload, scope]);

  const setScope = useCallback((next: WriterGuidedWritingScope) => {
    if (sending || next === scope) return;
    setScopeState(next);
    setSession(null);
    setMessages([]);
    setFeedback(null);
  }, [scope, sending]);

  const send = useCallback(async (
    question: string,
    selection?: WriterGuidedSelection | null,
    ideaContext?: WriterIdeaContext | null,
  ) => {
    const clean = question.trim();
    const sceneId = scope === "scene"
      ? (ideaContext?.scope === "scene" ? ideaContext.sceneId : activeSceneId)
      : null;
    if (!clean || !documentHash || (scope === "scene" && !sceneId) || sending) return false;
    const operationId = crypto.randomUUID();
    const optimistic: WriterGuidedWritingMessage = {
      id: `pending:${operationId}`,
      role: "user",
      content: clean,
      response: null,
      documentHash,
      sceneId,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setSending(true);
    setFeedback(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await postGuidedWriting(scriptId, {
          scope,
          sceneId,
          sessionId: session?.id ?? null,
          documentHash,
          question: clean,
          selection: selection?.text.trim() ? selection : null,
          ideaContext: ideaContext ?? null,
          operationId,
        }, controller.signal);
      if (!mountedRef.current) return false;
      setSession(data.session ?? null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      return true;
    } catch (cause) {
      if (!mountedRef.current) return false;
      setFeedback(controller.signal.aborted ? "Consulta cancelada." : cause instanceof Error ? cause.message : "No pudimos responder ahora.");
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      if (!controller.signal.aborted) void reload(scope, sceneId);
      return false;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (mountedRef.current) setSending(false);
    }
  }, [activeSceneId, documentHash, reload, scope, scriptId, sending, session]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
  }, []);

  const analyzeSelection = useCallback(async (
    selection: WriterGuidedSelection,
    question: string,
  ): Promise<WriterGuidedWritingResponse | null> => {
    if (sending || !documentHash || selection.documentHash !== documentHash) {
      setFeedback("La selección pertenece a una versión anterior del guion. Selecciona el fragmento de nuevo.");
      return null;
    }
    const selectionScope: WriterGuidedWritingScope = selection.sceneIds.length === 1 ? "scene" : "document";
    const sceneId = selectionScope === "scene" ? selection.sceneIds[0] ?? null : null;
    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);
    setFeedback(null);
    try {
      const data = await postGuidedWriting(scriptId, {
          scope: selectionScope,
          sceneId,
          sessionId: null,
          documentHash,
          question,
          selection,
          ideaContext: null,
          operationId: crypto.randomUUID(),
        }, controller.signal);
      const nextMessages = Array.isArray(data.messages) ? data.messages as WriterGuidedWritingMessage[] : [];
      setSession(data.session ?? null);
      setMessages(nextMessages);
      return [...nextMessages].reverse().find((message) => message.role === "assistant")?.response ?? null;
    } catch (cause) {
      setFeedback(controller.signal.aborted ? "Análisis cancelado." : cause instanceof Error ? cause.message : "No pudimos analizar la selección.");
      return null;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (mountedRef.current) setSending(false);
    }
  }, [documentHash, scriptId, sending]);

  return {
    scope,
    session,
    messages,
    documentHash,
    loaded,
    sending,
    feedback,
    setFeedback,
    setScope,
    send,
    analyzeSelection,
    cancel,
    reload,
  };
}
