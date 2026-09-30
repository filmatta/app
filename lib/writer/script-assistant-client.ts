"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WriterDocument } from "./document.ts";
import {
  WRITER_SCRIPT_ASSISTANT_VERSION,
  deriveWriterSceneSources,
  writerSceneCanonicalSource,
  writerSceneAnalysisStatus,
  writerSceneSourceHash,
  type WriterNarrativeObservation,
  type WriterSceneAnalysisRecord,
  type WriterSceneAssistantStatus,
  type WriterSceneOverride,
} from "./script-assistant.ts";

export type WriterAssistantDismissal = {
  sceneId: string;
  sourceHash: string;
  analysisVersion: string;
  observationId: string;
};

export type WriterAssistantMarker = {
  sceneId: string;
  blockId: string;
  observationId: string;
  state: WriterNarrativeObservation["state"];
};

export function useWriterScriptAssistant({
  scriptId,
  document,
  activeSceneId,
  saveStatus,
  focusMode,
}: {
  scriptId: string;
  document: WriterDocument;
  activeSceneId: string | null;
  saveStatus: string;
  focusMode: boolean;
}) {
  const [enabled, setEnabledState] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [analyses, setAnalyses] = useState<Map<string, WriterSceneAnalysisRecord>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, WriterSceneOverride>>(new Map());
  const [dismissals, setDismissals] = useState<WriterAssistantDismissal[]>([]);
  const [hashes, setHashes] = useState<Map<string, string>>(new Map());
  const [feedback, setFeedback] = useState<string | null>(null);
  const inFlightRef = useRef(new Set<string>());
  const hashEpochRef = useRef(0);
  const hashCacheRef = useRef(new Map<string, { canonical: string; hash: string }>());
  const mountedRef = useRef(true);

  const scenes = useMemo(() => deriveWriterSceneSources(document), [document]);
  const sceneById = useMemo(() => new Map(scenes.map((scene) => [scene.sceneId, scene])), [scenes]);

  const reload = useCallback(async () => {
    try {
      const response = await fetch(`/api/writer/scripts/${scriptId}/assistant`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "No pudimos cargar Script Assistant.");
      if (!mountedRef.current) return;
      setEnabledState(data.enabled === true);
      setAnalyses(new Map((data.analyses ?? []).map((item: WriterSceneAnalysisRecord) => [item.sceneId, item])));
      setOverrides(new Map((data.overrides ?? []).map((item: WriterSceneOverride) => [item.sceneId, item])));
      setDismissals(Array.isArray(data.dismissals) ? data.dismissals : []);
      setLoaded(true);
    } catch (cause) {
      if (!mountedRef.current) return;
      setFeedback(cause instanceof Error ? cause.message : "No pudimos cargar Script Assistant.");
      setLoaded(true);
    }
  }, [scriptId]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(() => void reload(), 0);
    return () => { window.clearTimeout(timer); mountedRef.current = false; };
  }, [reload]);

  useEffect(() => {
    const epoch = ++hashEpochRef.current;
    void Promise.all(scenes.map(async (scene) => {
      const canonical = writerSceneCanonicalSource(scene);
      const cached = hashCacheRef.current.get(scene.sceneId);
      const hash = cached?.canonical === canonical ? cached.hash : await writerSceneSourceHash(scene);
      return [scene.sceneId, canonical, hash] as const;
    })).then((entries) => {
      if (!mountedRef.current || epoch !== hashEpochRef.current) return;
      hashCacheRef.current = new Map(entries.map(([sceneId, canonical, hash]) => [sceneId, { canonical, hash }]));
      setHashes(new Map(entries.map(([sceneId, , hash]) => [sceneId, hash])));
    });
  }, [scenes]);

  const analyzeScene = useCallback(async (sceneId: string) => {
    const sourceHash = hashes.get(sceneId);
    if (!sourceHash || !sceneById.has(sceneId) || inFlightRef.current.has(`${sceneId}:${sourceHash}`)) return false;
    const key = `${sceneId}:${sourceHash}`;
    inFlightRef.current.add(key);
    setFeedback(null);
    setAnalyses((current) => {
      const next = new Map(current);
      const previous = next.get(sceneId);
      next.set(sceneId, {
        id: previous?.id ?? `pending:${key}`,
        scriptId,
        sceneId,
        sourceHash,
        analysisVersion: WRITER_SCRIPT_ASSISTANT_VERSION,
        model: "gpt-5.6-terra",
        status: "analyzing",
        payload: previous?.payload ?? null,
        updatedAt: new Date().toISOString(),
      });
      return next;
    });
    try {
      const response = await fetch(`/api/writer/scripts/${scriptId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId, sourceHash, operationId: crypto.randomUUID() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "No pudimos analizar esta escena ahora.");
      if (data.analysis) {
        setAnalyses((current) => new Map(current).set(sceneId, data.analysis as WriterSceneAnalysisRecord));
      } else if (data.pending) {
        window.setTimeout(() => void reload(), 3_000);
      }
      return true;
    } catch (cause) {
      setAnalyses((current) => {
        const next = new Map(current);
        const previous = next.get(sceneId);
        if (previous?.sourceHash === sourceHash) next.set(sceneId, { ...previous, status: "error", errorCode: "request_failed" });
        return next;
      });
      setFeedback(cause instanceof Error ? cause.message : "No pudimos analizar esta escena ahora.");
      return false;
    } finally {
      inFlightRef.current.delete(key);
    }
  }, [hashes, reload, sceneById, scriptId]);

  useEffect(() => {
    if (!loaded || !enabled || focusMode || saveStatus !== "cloud" || !activeSceneId) return;
    const sourceHash = hashes.get(activeSceneId);
    if (!sourceHash) return;
    const status = writerSceneAnalysisStatus(analyses.get(activeSceneId), sourceHash);
    if (status !== "UNANALYZED" && status !== "STALE") return;
    const timer = window.setTimeout(() => void analyzeScene(activeSceneId), 3_500);
    return () => window.clearTimeout(timer);
  }, [activeSceneId, analyses, analyzeScene, enabled, focusMode, hashes, loaded, saveStatus]);

  const setEnabled = useCallback(async (next: boolean) => {
    const previous = enabled;
    setEnabledState(next);
    try {
      await mutate(scriptId, { action: "enabled", enabled: next });
    } catch (cause) {
      setEnabledState(previous);
      setFeedback(cause instanceof Error ? cause.message : "No pudimos guardar este ajuste.");
    }
  }, [enabled, scriptId]);

  const saveOverride = useCallback(async (sceneId: string, field: "objective" | "obstacle" | "change", value: string | null) => {
    const clean = value?.trim().replace(/\s+/gu, " ") || null;
    const previous = overrides.get(sceneId) ?? { sceneId, objective: null, obstacle: null, change: null };
    const next = { ...previous, [field]: clean };
    setOverrides((current) => new Map(current).set(sceneId, next));
    try {
      await mutate(scriptId, { action: "override", sceneId, field, value: clean });
    } catch (cause) {
      setOverrides((current) => new Map(current).set(sceneId, previous));
      setFeedback(cause instanceof Error ? cause.message : "No pudimos guardar tu definición.");
    }
  }, [overrides, scriptId]);

  const dismissObservation = useCallback(async (sceneId: string, sourceHash: string, observationId: string, dismissed = true) => {
    const entry = { sceneId, sourceHash, analysisVersion: WRITER_SCRIPT_ASSISTANT_VERSION, observationId };
    setDismissals((current) => dismissed
      ? [...current.filter((item) => !sameDismissal(item, entry)), entry]
      : current.filter((item) => !sameDismissal(item, entry)));
    try {
      await mutate(scriptId, { action: "dismiss", sceneId, sourceHash, observationId, dismissed });
    } catch (cause) {
      setDismissals((current) => dismissed
        ? current.filter((item) => !sameDismissal(item, entry))
        : [...current, entry]);
      setFeedback(cause instanceof Error ? cause.message : "No pudimos guardar esta decisión.");
    }
  }, [scriptId]);

  const markers = useMemo(() => {
    if (!enabled || focusMode) return [];
    const result: WriterAssistantMarker[] = [];
    for (const [sceneId, analysis] of analyses) {
      const currentHash = hashes.get(sceneId);
      if (!currentHash || writerSceneAnalysisStatus(analysis, currentHash) !== "FRESH" || !analysis.payload) continue;
      const dismissed = new Set(dismissals.filter((item) => item.sceneId === sceneId && item.sourceHash === currentHash
        && item.analysisVersion === WRITER_SCRIPT_ASSISTANT_VERSION).map((item) => item.observationId));
      const seenBlocks = new Set<string>();
      for (const observation of analysis.payload.observations) {
        if (dismissed.has(observation.id)) continue;
        const blockId = observation.evidence[0]?.blockId ?? sceneId;
        if (seenBlocks.has(blockId)) continue;
        seenBlocks.add(blockId);
        result.push({ sceneId, blockId, observationId: observation.id, state: observation.state });
      }
    }
    return result;
  }, [analyses, dismissals, enabled, focusMode, hashes]);

  const activeAnalysis = activeSceneId ? analyses.get(activeSceneId) ?? null : null;
  const activeHash = activeSceneId ? hashes.get(activeSceneId) ?? null : null;
  const activeStatus: WriterSceneAssistantStatus = writerSceneAnalysisStatus(activeAnalysis, activeHash);
  const activeOverride = activeSceneId ? overrides.get(activeSceneId) ?? null : null;
  const activeDismissed = new Set(dismissals.filter((item) => item.sceneId === activeSceneId && item.sourceHash === activeHash
    && item.analysisVersion === WRITER_SCRIPT_ASSISTANT_VERSION).map((item) => item.observationId));

  return {
    enabled,
    loaded,
    feedback,
    setFeedback,
    hashes,
    analyses,
    overrides,
    dismissals,
    markers,
    activeAnalysis,
    activeHash,
    activeStatus,
    activeOverride,
    activeObservations: activeStatus === "FRESH" || activeStatus === "PARTIAL"
      ? activeAnalysis?.payload?.observations.filter((item) => !activeDismissed.has(item.id)) ?? []
      : [],
    setEnabled,
    analyzeScene,
    saveOverride,
    dismissObservation,
  };
}

async function mutate(scriptId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/writer/scripts/${scriptId}/assistant`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "No pudimos guardar este ajuste.");
}

function sameDismissal(left: WriterAssistantDismissal, right: WriterAssistantDismissal) {
  return left.sceneId === right.sceneId && left.sourceHash === right.sourceHash
    && left.analysisVersion === right.analysisVersion && left.observationId === right.observationId;
}
