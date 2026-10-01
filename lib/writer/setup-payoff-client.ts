"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WriterDocument } from "./document";
import {
  WRITER_SETUP_PAYOFF_VERSION,
  writerSetupPayoffSourceHash,
  type WriterNarrativeElement,
  type WriterNarrativeElementStatus,
  type WriterNarrativeLink,
  type WriterNarrativeLinkStatus,
  type WriterSetupPayoffAnalysis,
} from "./setup-payoff";

export function useWriterSetupPayoff({ scriptId, document, focusMode }: { scriptId: string; document: WriterDocument; focusMode: boolean }) {
  const [elements, setElements] = useState<WriterNarrativeElement[]>([]);
  const [links, setLinks] = useState<WriterNarrativeLink[]>([]);
  const [analysis, setAnalysis] = useState<WriterSetupPayoffAnalysis>(null);
  const [sourceHash, setSourceHash] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    try {
      const response = await fetch(`/api/writer/scripts/${scriptId}/setup-payoff`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "No pudimos cargar Setup / Payoff.");
      if (!mounted.current) return;
      setElements(Array.isArray(data.elements) ? data.elements : []);
      setLinks(Array.isArray(data.links) ? data.links : []);
      setAnalysis(data.analysis ?? null);
      setLoaded(true);
    } catch (cause) {
      if (!mounted.current) return;
      setFeedback(cause instanceof Error ? cause.message : "No pudimos cargar Setup / Payoff.");
      setLoaded(true);
    }
  }, [scriptId]);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => void reload(), 0);
    return () => { mounted.current = false; window.clearTimeout(timer); };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    void writerSetupPayoffSourceHash(document).then((hash) => { if (!cancelled) setSourceHash(hash); });
    return () => { cancelled = true; };
  }, [document]);

  const analyze = useCallback(async () => {
    if (analyzing) return false;
    setAnalyzing(true);
    setFeedback(null);
    try {
      const requestSourceHash = await writerSetupPayoffSourceHash(document);
      const response = await fetch(`/api/writer/scripts/${scriptId}/setup-payoff`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceHash: requestSourceHash, operationId: crypto.randomUUID() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "No pudimos analizar Setup / Payoff ahora.");
      if (data.pending) window.setTimeout(() => void reload(), 3_000);
      else {
        setElements(Array.isArray(data.elements) ? data.elements : []);
        setLinks(Array.isArray(data.links) ? data.links : []);
        setAnalysis(data.analysis ?? null);
      }
      return true;
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "No pudimos analizar Setup / Payoff ahora.");
      return false;
    } finally { setAnalyzing(false); }
  }, [analyzing, document, reload, scriptId]);

  const setElementStatus = useCallback(async (elementId: string, status: Extract<WriterNarrativeElementStatus, "confirmed" | "dismissed" | "needs_review">) => {
    const previous = elements;
    setElements((current) => current.map((element) => element.id === elementId ? { ...element, status } : element));
    try { await mutate(scriptId, { action: "elementStatus", elementId, status }); }
    catch (cause) { setElements(previous); setFeedback(message(cause)); }
  }, [elements, scriptId]);

  const setLinkStatus = useCallback(async (linkId: string, status: Extract<WriterNarrativeLinkStatus, "confirmed" | "dismissed" | "needs_review">) => {
    const previousLinks = links;
    const previousElements = elements;
    const link = links.find((item) => item.id === linkId);
    setLinks((current) => current.map((item) => item.id === linkId ? { ...item, status } : item));
    if (status === "confirmed" && link) setElements((current) => current.map((element) =>
      element.id === link.setupElementId || element.id === link.payoffElementId ? { ...element, status: "confirmed" } : element));
    try { await mutate(scriptId, { action: "linkStatus", linkId, status }); }
    catch (cause) { setLinks(previousLinks); setElements(previousElements); setFeedback(message(cause)); }
  }, [elements, links, scriptId]);

  const createElement = useCallback(async (input: { sceneId: string; blockId: string | null; elementType: "setup" | "payoff"; label: string; excerpt: string }) => {
    try { await mutate(scriptId, { action: "createElement", ...input }); await reload(); return true; }
    catch (cause) { setFeedback(message(cause)); return false; }
  }, [reload, scriptId]);

  const createLink = useCallback(async (setupElementId: string, payoffElementId: string) => {
    try { await mutate(scriptId, { action: "createLink", setupElementId, payoffElementId }); await reload(); return true; }
    catch (cause) { setFeedback(message(cause)); return false; }
  }, [reload, scriptId]);

  const visibleElements = useMemo(() => focusMode ? [] : elements, [elements, focusMode]);
  const current = Boolean(analysis && sourceHash && analysis.sourceHash === sourceHash && analysis.analysisVersion === WRITER_SETUP_PAYOFF_VERSION && analysis.status === "fresh");
  return { elements: visibleElements, links: focusMode ? [] : links, analysis, sourceHash, loaded, analyzing, current, feedback, setFeedback, reload, analyze, setElementStatus, setLinkStatus, createElement, createLink };
}

async function mutate(scriptId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/writer/scripts/${scriptId}/setup-payoff`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "No pudimos guardar esta decisión.");
  return data;
}
function message(cause: unknown) { return cause instanceof Error ? cause.message : "No pudimos guardar esta decisión."; }
