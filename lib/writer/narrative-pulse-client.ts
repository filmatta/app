"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WriterNarrativePulseState, WriterPulseMilestoneStatus, WriterPulseMilestoneType } from "./narrative-pulse";

const EMPTY: WriterNarrativePulseState = { analysis: null, points: [], milestones: [], zones: [], currentSourceHash: null };

export function useWriterNarrativePulse({ scriptId, enabled }: { scriptId: string; enabled: boolean }) {
  const [state, setState] = useState<WriterNarrativePulseState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    try {
      const response = await fetch(`/api/writer/scripts/${scriptId}/narrative-pulse`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "No pudimos cargar Narrative Pulse.");
      const next = normalize(data);
      setState(next);
      return next;
    } catch (cause) { setFeedback(message(cause)); return null; }
    finally { setLoaded(true); }
  }, [scriptId]);

  useEffect(() => { if (!enabled) return; const timer = window.setTimeout(() => void reload(), 0); return () => window.clearTimeout(timer); }, [enabled, reload]);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const analyze = useCallback(async (sourceHashOverride?: string) => {
    const sourceHash = sourceHashOverride ?? state.currentSourceHash;
    if (analyzing || !sourceHash) return false;
    const controller = new AbortController(); controllerRef.current = controller; setAnalyzing(true); setFeedback(null);
    try {
      const response = await fetch(`/api/writer/scripts/${scriptId}/narrative-pulse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceHash, operationId: crypto.randomUUID() }), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "No pudimos analizar Narrative Pulse ahora.");
      if (data.pending) window.setTimeout(() => void reload(), 3_000); else setState(normalize(data));
      return true;
    } catch (cause) { if (!controller.signal.aborted) setFeedback(message(cause)); return false; }
    finally { if (controllerRef.current === controller) controllerRef.current = null; setAnalyzing(false); }
  }, [analyzing, reload, scriptId, state.currentSourceHash]);

  const mutate = useCallback(async (body: Record<string, unknown>) => {
    try {
      const response = await fetch(`/api/writer/scripts/${scriptId}/narrative-pulse`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "No pudimos guardar esta decisión."); await reload(); return true;
    } catch (cause) { setFeedback(message(cause)); return false; }
  }, [reload, scriptId]);

  return {
    ...state, loaded, analyzing, feedback, setFeedback, reload, analyze,
    cancel: () => controllerRef.current?.abort(),
    setStatus: (milestoneId: string, status: Extract<WriterPulseMilestoneStatus, "confirmed" | "dismissed">) => mutate({ action: "status", milestoneId, status }),
    move: (milestoneId: string, sceneId: string) => mutate({ action: "move", milestoneId, sceneId }),
    rename: (milestoneId: string, label: string) => mutate({ action: "rename", milestoneId, label }),
    create: (sceneId: string, type: WriterPulseMilestoneType, label: string) => mutate({ action: "create", sceneId, type, label }),
  };
}

function normalize(data: Record<string, unknown>): WriterNarrativePulseState { return { analysis: data.analysis as WriterNarrativePulseState["analysis"] ?? null, points: Array.isArray(data.points) ? data.points as never : [], milestones: Array.isArray(data.milestones) ? data.milestones as never : [], zones: Array.isArray(data.zones) ? data.zones as never : [], currentSourceHash: typeof data.currentSourceHash === "string" ? data.currentSourceHash : null }; }
function message(cause: unknown) { return cause instanceof Error ? cause.message : "No pudimos guardar esta decisión."; }
