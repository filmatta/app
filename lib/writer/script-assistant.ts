import type { ScreenplayKind, WriterBlock, WriterDocument } from "./document.ts";
import { blockText } from "./document.ts";

export const WRITER_SCRIPT_ASSISTANT_VERSION = "assistant-core-v1" as const;
export const WRITER_SCRIPT_ASSISTANT_MODEL = "gpt-5.6-terra" as const;

export type WriterSceneSourceBlock = {
  id: string;
  kind: Exclude<ScreenplayKind, "authorNote">;
  text: string;
};

export type WriterSceneSource = {
  sceneId: string;
  heading: string;
  blocks: WriterSceneSourceBlock[];
};

export type WriterAssistantEvidence = { blockId: string };
export type WriterAssistantOocField = {
  value: string | null;
  confidence: "high" | "medium" | "low";
  evidence: WriterAssistantEvidence[];
};

export type WriterNarrativeObservation = {
  id: string;
  category: "objective" | "obstacle" | "change" | "clarity" | "continuity" | "other_narrative";
  state: "QUESTION" | "INFO" | "REVIEW";
  title: string;
  question: string | null;
  observation: string | null;
  evidence: WriterAssistantEvidence[];
};

export type WriterSceneAnalysisPayload = {
  objective: WriterAssistantOocField;
  obstacle: WriterAssistantOocField;
  change: WriterAssistantOocField;
  observations: WriterNarrativeObservation[];
};

export type WriterSceneAnalysisRecord = {
  id: string;
  scriptId: string;
  sceneId: string;
  sourceHash: string;
  analysisVersion: string;
  model: string;
  status: "analyzing" | "fresh" | "partial" | "error" | "uncertain";
  payload: WriterSceneAnalysisPayload | null;
  errorCode?: string | null;
  updatedAt: string;
};

export type WriterSceneOverride = {
  sceneId: string;
  objective: string | null;
  obstacle: string | null;
  change: string | null;
};

export type WriterSceneAssistantStatus =
  | "UNANALYZED"
  | "ANALYZING"
  | "FRESH"
  | "STALE"
  | "PARTIAL"
  | "ERROR";

const EXPORTABLE_KINDS = new Set<ScreenplayKind>([
  "sceneHeading", "action", "character", "dialogue", "parenthetical", "transition",
]);
const CATEGORIES = new Set(["objective", "obstacle", "change", "clarity", "continuity", "other_narrative"]);
const STATES = new Set(["QUESTION", "INFO", "REVIEW"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);

export function deriveWriterSceneSources(document: WriterDocument): WriterSceneSource[] {
  const scenes: WriterSceneSource[] = [];
  let current: WriterSceneSource | null = null;
  for (const block of document.content) {
    if (block.attrs.kind === "sceneHeading") {
      current = {
        sceneId: block.attrs.id,
        heading: blockText(block),
        blocks: [sceneSourceBlock(block)],
      };
      scenes.push(current);
      continue;
    }
    if (!current || !EXPORTABLE_KINDS.has(block.attrs.kind) || block.attrs.kind === "authorNote") continue;
    current.blocks.push(sceneSourceBlock(block));
  }
  return scenes;
}

export function findWriterSceneSource(document: WriterDocument, sceneId: string) {
  return deriveWriterSceneSources(document).find((scene) => scene.sceneId === sceneId) ?? null;
}

export function writerSceneCanonicalSource(scene: WriterSceneSource) {
  return JSON.stringify({
    sceneId: scene.sceneId,
    blocks: scene.blocks.map((block) => ({ id: block.id, kind: block.kind, text: block.text })),
  });
}

export async function writerSceneSourceHash(scene: WriterSceneSource) {
  const bytes = new TextEncoder().encode(writerSceneCanonicalSource(scene));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function writerSceneAnalysisStatus(
  record: WriterSceneAnalysisRecord | null | undefined,
  currentHash: string | null | undefined,
): WriterSceneAssistantStatus {
  if (!record) return "UNANALYZED";
  if (!currentHash || record.sourceHash !== currentHash || record.analysisVersion !== WRITER_SCRIPT_ASSISTANT_VERSION) return "STALE";
  if (record.status === "analyzing") return "ANALYZING";
  if (record.status === "fresh") return "FRESH";
  if (record.status === "partial") return "PARTIAL";
  return "ERROR";
}

export function effectiveWriterSceneOoc(
  analysis: WriterSceneAnalysisPayload | null | undefined,
  override: WriterSceneOverride | null | undefined,
) {
  return {
    objective: override?.objective ?? analysis?.objective.value ?? null,
    obstacle: override?.obstacle ?? analysis?.obstacle.value ?? null,
    change: override?.change ?? analysis?.change.value ?? null,
    source: {
      objective: override?.objective != null ? "user" as const : "auto" as const,
      obstacle: override?.obstacle != null ? "user" as const : "auto" as const,
      change: override?.change != null ? "user" as const : "auto" as const,
    },
  };
}

export function validateWriterSceneAnalysisOutput(
  value: unknown,
  scene: WriterSceneSource,
  sourceHash: string,
): WriterSceneAnalysisPayload {
  if (!isRecord(value) || !hasExactKeys(value, ["objective", "obstacle", "change", "observations"])) {
    throw new Error("assistant_invalid_schema");
  }
  const allowedBlockIds = new Set(scene.blocks.map((block) => block.id));
  const objective = parseOoc(value.objective, allowedBlockIds);
  const obstacle = parseOoc(value.obstacle, allowedBlockIds);
  const change = parseOoc(value.change, allowedBlockIds);
  if (!Array.isArray(value.observations) || value.observations.length > 3) throw new Error("assistant_invalid_observations");
  const observations = value.observations.map((item, index) => parseObservation(item, allowedBlockIds, sourceHash, index));
  return { objective, obstacle, change, observations };
}

export function writerAssistantOutputSchema() {
  const evidence = {
    type: "array",
    maxItems: 4,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["blockId"],
      properties: { blockId: { type: "string" } },
    },
  } as const;
  const ooc = {
    type: "object",
    additionalProperties: false,
    required: ["value", "confidence", "evidence"],
    properties: {
      value: { anyOf: [{ type: "string", maxLength: 280 }, { type: "null" }] },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      evidence,
    },
  } as const;
  return {
    type: "object",
    additionalProperties: false,
    required: ["objective", "obstacle", "change", "observations"],
    properties: {
      objective: ooc,
      obstacle: ooc,
      change: ooc,
      observations: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "state", "title", "question", "observation", "evidence"],
          properties: {
            category: { type: "string", enum: [...CATEGORIES] },
            state: { type: "string", enum: [...STATES] },
            title: { type: "string", maxLength: 120 },
            question: { anyOf: [{ type: "string", maxLength: 320 }, { type: "null" }] },
            observation: { anyOf: [{ type: "string", maxLength: 320 }, { type: "null" }] },
            evidence,
          },
        },
      },
    },
  } as const;
}

function sceneSourceBlock(block: WriterBlock): WriterSceneSourceBlock {
  return { id: block.attrs.id, kind: block.attrs.kind as WriterSceneSourceBlock["kind"], text: blockText(block) };
}

function parseOoc(value: unknown, allowedBlockIds: ReadonlySet<string>): WriterAssistantOocField {
  if (!isRecord(value) || !hasExactKeys(value, ["value", "confidence", "evidence"])) throw new Error("assistant_invalid_ooc");
  const text = value.value === null ? null : cleanText(value.value, 280);
  if (!CONFIDENCES.has(String(value.confidence))) throw new Error("assistant_invalid_confidence");
  return {
    value: text,
    confidence: value.confidence as WriterAssistantOocField["confidence"],
    evidence: parseEvidence(value.evidence, allowedBlockIds),
  };
}

function parseObservation(
  value: unknown,
  allowedBlockIds: ReadonlySet<string>,
  sourceHash: string,
  index: number,
): WriterNarrativeObservation {
  if (!isRecord(value) || !hasExactKeys(value, ["category", "state", "title", "question", "observation", "evidence"])) {
    throw new Error("assistant_invalid_observation");
  }
  if (!CATEGORIES.has(String(value.category)) || !STATES.has(String(value.state))) throw new Error("assistant_invalid_observation");
  const question = value.question === null ? null : cleanText(value.question, 320);
  const observation = value.observation === null ? null : cleanText(value.observation, 320);
  if (!question && !observation) throw new Error("assistant_empty_observation");
  return {
    id: `${sourceHash.slice(0, 16)}:${index + 1}`,
    category: value.category as WriterNarrativeObservation["category"],
    state: value.state as WriterNarrativeObservation["state"],
    title: cleanText(value.title, 120),
    question,
    observation,
    evidence: parseEvidence(value.evidence, allowedBlockIds),
  };
}

function parseEvidence(value: unknown, allowedBlockIds: ReadonlySet<string>) {
  if (!Array.isArray(value) || value.length > 4) throw new Error("assistant_invalid_evidence");
  const seen = new Set<string>();
  return value.map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["blockId"]) || typeof item.blockId !== "string"
      || !allowedBlockIds.has(item.blockId) || seen.has(item.blockId)) throw new Error("assistant_invalid_evidence");
    seen.add(item.blockId);
    return { blockId: item.blockId };
  });
}

function cleanText(value: unknown, limit: number) {
  if (typeof value !== "string") throw new Error("assistant_invalid_text");
  const text = value.trim().replace(/\s+/gu, " ");
  if (!text || text.length > limit) throw new Error("assistant_invalid_text");
  return text;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => actual[index] === key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
