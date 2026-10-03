import type { WriterDocument } from "./document.ts";
import { deriveWriterSceneSources, writerSceneCanonicalSource, type WriterSceneSource } from "./script-assistant.ts";

export const WRITER_NARRATIVE_PULSE_VERSION = "narrative-pulse-v3" as const;
export const WRITER_NARRATIVE_PULSE_MODEL = "gpt-5.6-terra" as const;
export const WRITER_NARRATIVE_PULSE_MIN_SCENES = 4;

export type WriterPulseSignal = "conflict" | "change" | "pressure" | "turn" | "risk" | "revelation" | "consequence" | "activity";
export type WriterPulseZoneType = "stable" | "build" | "release" | "peak";
export type WriterPulseMilestoneType = "inciting_incident" | "first_turning_point" | "midpoint" | "crisis" | "climax" | "resolution" | "custom";
export type WriterPulseMilestoneStatus = "suggested" | "confirmed" | "manual" | "dismissed" | "needs_review";

export type WriterPulseDimension = "threat" | "pressure" | "stakes" | "emotion" | "revelation" | "urgency";
export type WriterPulsePointCandidate = { sceneId: string; intensity: number; signals: WriterPulseSignal[]; note: string; dimensions?: Partial<Record<WriterPulseDimension, number>>; evidence?: string[] };
export type WriterPulseMilestoneCandidate = { sceneId: string; type: Exclude<WriterPulseMilestoneType, "custom">; label: string; explanation: string };
export type WriterPulseZoneCandidate = { startSceneId: string; endSceneId: string; type: WriterPulseZoneType; note: string };
export type WriterNarrativePulsePayload = { scenes: WriterPulsePointCandidate[]; milestones: WriterPulseMilestoneCandidate[]; zones: WriterPulseZoneCandidate[] };

export type WriterPulseAnalysis = { id: string; sourceHash: string; analysisVersion: string; model: string; status: "analyzing" | "fresh" | "error" | "uncertain"; errorCode: string | null; updatedAt: string } | null;
export type WriterPulsePoint = WriterPulsePointCandidate & { id: string; analysisId: string };
export type WriterPulseDisplayPoint = { rawIntensity: number; displayIntensity: number };
export type WriterPulsePlotPoint = WriterPulseDisplayPoint & { x: number; y: number };
export type WriterPulseDisplayStats = {
  rawMin: number;
  rawMax: number;
  rawMedian: number;
  rawVariance: number;
  displayMin: number;
  displayMax: number;
};
export type WriterPulseMilestone = {
  id: string; scriptId: string; sceneId: string; type: WriterPulseMilestoneType; label: string; explanation: string | null;
  status: WriterPulseMilestoneStatus; source: "ai" | "user"; sourceHash: string | null; fingerprint: string; movedByUser: boolean; updatedAt: string;
};
export type WriterPulseZone = WriterPulseZoneCandidate & { id: string; analysisId: string };
export type WriterNarrativePulseState = { analysis: WriterPulseAnalysis; points: WriterPulsePoint[]; milestones: WriterPulseMilestone[]; zones: WriterPulseZone[]; currentSourceHash: string | null };

export type WriterPulseContext = {
  scenes: Array<{ sceneId: string; sceneNumber: number; heading: string; characters: string[]; summary: string; setupPayoff: string[]; changes: string[] }>;
};

export async function writerNarrativePulseSourceHash(document: WriterDocument) {
  const canonical = deriveWriterSceneSources(document).map(writerSceneCanonicalSource).join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function buildWriterPulseContext(
  scenes: WriterSceneSource[],
  options: { setupPayoff?: ReadonlyArray<{ sceneId: string; label: string; status: string }>; changes?: ReadonlyArray<{ sceneId: string; change: string }> } = {},
): WriterPulseContext {
  if (scenes.length > 160) throw new Error("narrative_pulse_too_many_scenes");
  const relationships = groupByScene(options.setupPayoff ?? [], (item) => item.sceneId, (item) => item.label);
  const changes = groupByScene(options.changes ?? [], (item) => item.sceneId, (item) => item.change);
  return {
    scenes: scenes.map((scene, index) => ({
      sceneId: scene.sceneId,
      sceneNumber: index + 1,
      heading: cleanInline(scene.heading, 180),
      characters: [...new Set(scene.blocks.filter((block) => block.kind === "character").map((block) => cleanInline(block.text, 64)).filter(Boolean))].slice(0, 12),
      summary: sceneSummary(scene),
      setupPayoff: (relationships.get(scene.sceneId) ?? []).slice(0, 8),
      changes: (changes.get(scene.sceneId) ?? []).slice(0, 4),
    })),
  };
}

export function writerPulseProviderInput(context: WriterPulseContext) { return JSON.stringify(context); }

export function validateWriterPulseOutput(value: unknown, scenes: WriterSceneSource[]): WriterNarrativePulsePayload {
  if (!isRecord(value) || !hasExactKeys(value, ["scenes", "milestones", "zones"]) || !Array.isArray(value.scenes) || !Array.isArray(value.milestones) || !Array.isArray(value.zones)) {
    throw new Error("narrative_pulse_invalid_schema");
  }
  if (value.scenes.length !== scenes.length || value.milestones.length > 18 || value.zones.length > 24) throw new Error("narrative_pulse_invalid_count");
  const validSceneIds = new Set(scenes.map((scene) => scene.sceneId));
  const sceneOrder = new Map(scenes.map((scene, index) => [scene.sceneId, index]));
  const seen = new Set<string>();
  const points = value.scenes.map((entry) => {
    if (!isRecord(entry) || !hasExactKeys(entry, ["sceneId", "intensity", "signals", "note", "dimensions", "evidence"]) || !validSceneIds.has(String(entry.sceneId)) || seen.has(String(entry.sceneId))) throw new Error("narrative_pulse_invalid_scene");
    if (!Number.isInteger(entry.intensity) || Number(entry.intensity) < 0 || Number(entry.intensity) > 100 || !Array.isArray(entry.signals) || entry.signals.length > 5) throw new Error("narrative_pulse_invalid_point");
    const signals = [...new Set(entry.signals.map(String))];
    if (signals.some((signal) => !PULSE_SIGNALS.includes(signal as WriterPulseSignal))) throw new Error("narrative_pulse_invalid_signal");
    if (!isRecord(entry.dimensions) || !hasExactKeys(entry.dimensions, PULSE_DIMENSIONS) || !Array.isArray(entry.evidence) || entry.evidence.length > 4) throw new Error("narrative_pulse_invalid_explanation");
    const rawDimensions = entry.dimensions as Record<string, unknown>;
    const dimensions = Object.fromEntries(PULSE_DIMENSIONS.map((dimension) => {
      const score = rawDimensions[dimension];
      if (!Number.isInteger(score) || Number(score) < 0 || Number(score) > 100) throw new Error("narrative_pulse_invalid_dimension");
      return [dimension, Number(score)];
    })) as Record<WriterPulseDimension, number>;
    const evidence = entry.evidence.map((item) => cleanText(item, 180));
    seen.add(String(entry.sceneId));
    return { sceneId: String(entry.sceneId), intensity: Number(entry.intensity), signals: signals as WriterPulseSignal[], note: cleanText(entry.note, 360), dimensions, evidence };
  });
  const milestones = value.milestones.map((entry) => {
    if (!isRecord(entry) || !hasExactKeys(entry, ["sceneId", "type", "label", "explanation"]) || !validSceneIds.has(String(entry.sceneId)) || !STANDARD_MILESTONES.includes(entry.type as never)) throw new Error("narrative_pulse_invalid_milestone");
    return { sceneId: String(entry.sceneId), type: entry.type as WriterPulseMilestoneCandidate["type"], label: cleanText(entry.label, 100), explanation: cleanText(entry.explanation, 360) };
  });
  const zones = value.zones.map((entry) => {
    if (!isRecord(entry) || !hasExactKeys(entry, ["startSceneId", "endSceneId", "type", "note"]) || !validSceneIds.has(String(entry.startSceneId)) || !validSceneIds.has(String(entry.endSceneId)) || !ZONE_TYPES.includes(entry.type as never)) throw new Error("narrative_pulse_invalid_zone");
    if ((sceneOrder.get(String(entry.startSceneId)) ?? 0) > (sceneOrder.get(String(entry.endSceneId)) ?? 0)) throw new Error("narrative_pulse_invalid_zone_order");
    return { startSceneId: String(entry.startSceneId), endSceneId: String(entry.endSceneId), type: entry.type as WriterPulseZoneType, note: cleanText(entry.note, 360) };
  });
  return { scenes: points, milestones, zones };
}

export function writerPulseOutputSchema() {
  return { type: "object", additionalProperties: false, required: ["scenes", "milestones", "zones"], properties: {
    scenes: { type: "array", maxItems: 160, items: { type: "object", additionalProperties: false, required: ["sceneId", "intensity", "signals", "note", "dimensions", "evidence"], properties: {
      sceneId: { type: "string" }, intensity: { type: "integer", minimum: 0, maximum: 100 }, signals: { type: "array", maxItems: 5, items: { type: "string", enum: PULSE_SIGNALS } }, note: { type: "string", maxLength: 360 },
      dimensions: { type: "object", additionalProperties: false, required: PULSE_DIMENSIONS, properties: Object.fromEntries(PULSE_DIMENSIONS.map((dimension) => [dimension, { type: "integer", minimum: 0, maximum: 100 }])) },
      evidence: { type: "array", maxItems: 4, items: { type: "string", maxLength: 180 } },
    } } },
    milestones: { type: "array", maxItems: 18, items: { type: "object", additionalProperties: false, required: ["sceneId", "type", "label", "explanation"], properties: {
      sceneId: { type: "string" }, type: { type: "string", enum: STANDARD_MILESTONES }, label: { type: "string", maxLength: 100 }, explanation: { type: "string", maxLength: 360 },
    } } },
    zones: { type: "array", maxItems: 24, items: { type: "object", additionalProperties: false, required: ["startSceneId", "endSceneId", "type", "note"], properties: {
      startSceneId: { type: "string" }, endSceneId: { type: "string" }, type: { type: "string", enum: ZONE_TYPES }, note: { type: "string", maxLength: 360 },
    } } },
  } } as const;
}

export function writerPulseDisplaySeries(points: ReadonlyArray<{ intensity: number }>): WriterPulseDisplayPoint[] {
  if (!points.length) return [];
  const raw = points.map((point) => Math.max(0, Math.min(100, point.intensity)));
  const minimum = Math.min(...raw);
  const maximum = Math.max(...raw);
  const range = maximum - minimum;
  if (range === 0) return raw.map((rawIntensity) => ({ rawIntensity, displayIntensity: 50 }));

  const targetSpan = range <= 4
    ? Math.max(2, range)
    : range < 12
      ? Math.min(18, range * 1.5)
      : Math.min(80, Math.max(65, range * 2.2));
  const lowerBound = (100 - targetSpan) / 2;
  const gamma = range >= 12 ? 0.92 : 1;
  return raw.map((rawIntensity) => {
    const normalized = (rawIntensity - minimum) / range;
    const displayIntensity = lowerBound + targetSpan * Math.pow(normalized, gamma);
    return { rawIntensity, displayIntensity: Math.max(0, Math.min(100, displayIntensity)) };
  });
}

export function writerPulseDisplayStats(points: ReadonlyArray<{ intensity: number }>): WriterPulseDisplayStats {
  const series = writerPulseDisplaySeries(points);
  if (!series.length) return { rawMin: 0, rawMax: 0, rawMedian: 0, rawVariance: 0, displayMin: 0, displayMax: 0 };
  const raw = series.map((point) => point.rawIntensity).sort((left, right) => left - right);
  const middle = Math.floor(raw.length / 2);
  const rawMedian = raw.length % 2 ? raw[middle] : (raw[middle - 1] + raw[middle]) / 2;
  const mean = raw.reduce((sum, value) => sum + value, 0) / raw.length;
  const rawVariance = raw.reduce((sum, value) => sum + (value - mean) ** 2, 0) / raw.length;
  return {
    rawMin: raw[0],
    rawMax: raw[raw.length - 1],
    rawMedian,
    rawVariance,
    displayMin: Math.min(...series.map((point) => point.displayIntensity)),
    displayMax: Math.max(...series.map((point) => point.displayIntensity)),
  };
}

export function writerPulsePath(points: ReadonlyArray<{ displayIntensity: number }>, width: number, height: number, inset = 20) {
  return writerPulsePlotPoints(points, width, height, inset)
    .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

export function writerPulsePlotPoints(
  points: ReadonlyArray<WriterPulseDisplayPoint | { displayIntensity: number; rawIntensity?: number }>,
  width: number,
  height: number,
  inset = 20,
): WriterPulsePlotPoint[] {
  if (!points.length) return [];
  const span = Math.max(1, points.length - 1);
  return points.map((point, index) => ({
    rawIntensity: "rawIntensity" in point && typeof point.rawIntensity === "number" ? point.rawIntensity : point.displayIntensity,
    displayIntensity: point.displayIntensity,
    x: inset + (index / span) * Math.max(0, width - inset * 2),
    y: inset + (1 - point.displayIntensity / 100) * Math.max(0, height - inset * 2),
  }));
}

export function writerPulseMilestoneLabel(type: WriterPulseMilestoneType) {
  return ({ inciting_incident: "Incidente incitador", first_turning_point: "Primer giro", midpoint: "Midpoint", crisis: "Crisis / punto bajo", climax: "Clímax", resolution: "Resolución", custom: "Hito personalizado" } as const)[type];
}

const PULSE_SIGNALS: WriterPulseSignal[] = ["conflict", "change", "pressure", "turn", "risk", "revelation", "consequence", "activity"];
export const PULSE_DIMENSIONS: WriterPulseDimension[] = ["threat", "pressure", "stakes", "emotion", "revelation", "urgency"];
const ZONE_TYPES: WriterPulseZoneType[] = ["stable", "build", "release", "peak"];
const STANDARD_MILESTONES: Array<Exclude<WriterPulseMilestoneType, "custom">> = ["inciting_incident", "first_turning_point", "midpoint", "crisis", "climax", "resolution"];

function cleanText(value: unknown, limit: number) { if (typeof value !== "string") throw new Error("narrative_pulse_invalid_text"); const text = value.trim().replace(/\s+/gu, " "); if (!text || text.length > limit) throw new Error("narrative_pulse_invalid_text"); return text; }
function cleanInline(value: string, limit: number) { return value.trim().replace(/\s+/gu, " ").slice(0, limit); }
function sceneSummary(scene: WriterSceneSource) {
  const text = scene.blocks.filter((block) => block.kind !== "sceneHeading").map((block) => block.text).join(" ").trim().replace(/\s+/gu, " ");
  if (text.length <= 1_400) return text;
  return `${text.slice(0, 680)} … [momento final] … ${text.slice(-680)}`;
}
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) { const actual = Object.keys(value).sort(); return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function groupByScene<T>(items: ReadonlyArray<T>, scene: (item: T) => string, value: (item: T) => string) { const result = new Map<string, string[]>(); for (const item of items) result.set(scene(item), [...(result.get(scene(item)) ?? []), cleanInline(value(item), 180)]); return result; }
