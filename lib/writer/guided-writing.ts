import type { WriterDocument } from "./document.ts";
import {
  deriveWriterSceneSources,
  effectiveWriterSceneOoc,
  writerSceneAnalysisStatus,
  writerSceneSourceHash,
  type WriterNarrativeObservation,
  type WriterSceneAnalysisRecord,
  type WriterSceneOverride,
} from "./script-assistant.ts";
import {
  writerSetupPayoffSourceHash,
  type WriterNarrativeElement,
  type WriterNarrativeLink,
} from "./setup-payoff.ts";
import type { WriterPulseMilestone, WriterPulseZone } from "./narrative-pulse.ts";
import type { WriterIdeaContext } from "./ideas.ts";

export const WRITER_GUIDED_WRITING_VERSION = "guided-writing-v1" as const;
export const WRITER_GUIDED_WRITING_MODEL = "gpt-5.6-terra" as const;

export type WriterGuidedWritingScope = "scene" | "document";
export type WriterGuidedSelection = {
  blockIds: string[];
  sceneIds: string[];
  text: string;
  from: number;
  to: number;
  sourceRevision: number;
  documentHash: string;
};
type WriterGuidedSelectionInput = WriterGuidedSelection | { blockId: string; text: string };
export type WriterGuidedReferenceType = "scene" | "observation" | "ooc" | "setup" | "payoff" | "pulse";

export type WriterGuidedReference = {
  referenceId: string;
  type: WriterGuidedReferenceType;
  targetId: string;
  sceneId: string;
  blockId: string | null;
  label: string;
  status: string | null;
  note?: string;
};

export type WriterGuidedWritingResponse = {
  summary: string;
  questions: Array<{ id: string; text: string; referenceIds: string[] }>;
  options: Array<{
    id: string;
    title: string;
    change: string;
    consequence: string;
    referenceIds: string[];
  }>;
  references: WriterGuidedReference[];
  warnings: Array<{ code: "context_stale" | "limited_context" | "ambiguous" | "writing_request_redirected" | "other"; message: string }>;
  redirectedFromWritingRequest: boolean;
};

export type WriterGuidedWritingMessage = {
  id: string;
  role: "user" | "assistant";
  content: string | null;
  response: WriterGuidedWritingResponse | null;
  documentHash: string;
  sceneId: string | null;
  createdAt: string;
};

export type WriterGuidedWritingSession = {
  id: string;
  scriptId: string;
  scope: WriterGuidedWritingScope;
  sceneId: string | null;
  updatedAt: string;
};

export type WriterGuidedContextScene = {
  sceneId: string;
  sceneNumber: number;
  heading: string;
  role: "focus" | "adjacent" | "outline";
  characters: string[];
  excerpt: string;
  blocks: Array<{ blockId: string; type: string; text: string }>;
};

export type WriterGuidedWritingContext = {
  scope: WriterGuidedWritingScope;
  documentHash: string;
  focusSceneId: string | null;
  scenes: WriterGuidedContextScene[];
  ooc: Array<{
    sceneId: string;
    field: "objective" | "obstacle" | "change";
    value: string;
    authority: "user" | "suggestion";
    referenceId: string;
  }>;
  observations: Array<{
    id: string;
    sceneId: string;
    state: WriterNarrativeObservation["state"];
    title: string;
    text: string;
    blockIds: string[];
    referenceId: string;
  }>;
  narrativeElements: Array<{
    id: string;
    type: "setup" | "payoff";
    sceneId: string;
    blockId: string | null;
    label: string;
    excerpt: string;
    status: string;
    authority: "user" | "confirmed" | "suggestion";
    referenceId: string;
  }>;
  narrativeLinks: Array<{
    id: string;
    setupElementId: string;
    payoffElementId: string;
    status: string;
    authority: "user" | "confirmed" | "suggestion";
  }>;
  pulse: {
    milestones: Array<{ id: string; sceneId: string; label: string; type: string; status: string; referenceId: string }>;
    zones: Array<{ startSceneId: string; endSceneId: string; type: string; note: string }>;
  };
  references: WriterGuidedReference[];
};

export type WriterGuidedContextInput = {
  document: WriterDocument;
  scope: WriterGuidedWritingScope;
  sceneId: string | null;
  analyses?: WriterSceneAnalysisRecord[];
  overrides?: WriterSceneOverride[];
  dismissals?: Array<{ sceneId: string; sourceHash: string; analysisVersion: string; observationId: string }>;
  elements?: WriterNarrativeElement[];
  links?: WriterNarrativeLink[];
  pulseMilestones?: WriterPulseMilestone[];
  pulseZones?: WriterPulseZone[];
};

export async function buildGuidedWritingContext(input: WriterGuidedContextInput): Promise<WriterGuidedWritingContext> {
  const scenes = deriveWriterSceneSources(input.document);
  if (!scenes.length) throw new Error("guided_writing_empty_document");
  const focusIndex = input.scope === "scene" ? scenes.findIndex((scene) => scene.sceneId === input.sceneId) : -1;
  if (input.scope === "scene" && focusIndex < 0) throw new Error("guided_writing_scene_not_found");
  const documentHash = await writerSetupPayoffSourceHash(input.document);
  const hashes = new Map(await Promise.all(scenes.map(async (scene) => [scene.sceneId, await writerSceneSourceHash(scene)] as const)));
  const analysisByScene = new Map((input.analyses ?? []).map((analysis) => [analysis.sceneId, analysis]));
  const overrideByScene = new Map((input.overrides ?? []).map((override) => [override.sceneId, override]));
  const dismissed = new Set((input.dismissals ?? []).map((item) => `${item.sceneId}:${item.sourceHash}:${item.analysisVersion}:${item.observationId}`));

  const includedIndexes = input.scope === "scene"
    ? [focusIndex - 1, focusIndex, focusIndex + 1].filter((index) => index >= 0 && index < scenes.length)
    : scenes.map((_, index) => index).slice(0, 160);
  const contextScenes = includedIndexes.map((index): WriterGuidedContextScene => {
    const scene = scenes[index];
    const isFocus = input.scope === "scene" && index === focusIndex;
    const textBlocks = scene.blocks.filter((block) => block.kind !== "sceneHeading" && block.text.trim());
    const excerpt = textBlocks.slice(0, input.scope === "document" ? 4 : 8).map((block) => block.text).join(" ").slice(0, input.scope === "document" ? 480 : 1_400);
    return {
      sceneId: scene.sceneId,
      sceneNumber: index + 1,
      heading: scene.heading,
      role: isFocus ? "focus" : input.scope === "scene" ? "adjacent" : "outline",
      characters: [...new Set(scene.blocks.filter((block) => block.kind === "character").map((block) => block.text.trim()).filter(Boolean))].slice(0, 20),
      excerpt,
      blocks: isFocus ? scene.blocks.map((block) => ({ blockId: block.id, type: block.kind, text: block.text })) : [],
    };
  });

  const includedSceneIds = new Set(contextScenes.map((scene) => scene.sceneId));
  const ooc: WriterGuidedWritingContext["ooc"] = [];
  const observations: WriterGuidedWritingContext["observations"] = [];
  for (const scene of scenes) {
    if (!includedSceneIds.has(scene.sceneId)) continue;
    const analysis = analysisByScene.get(scene.sceneId);
    const currentHash = hashes.get(scene.sceneId)!;
    if (!analysis || !analysis.payload || !["FRESH", "PARTIAL"].includes(writerSceneAnalysisStatus(analysis, currentHash))) continue;
    const effective = effectiveWriterSceneOoc(analysis.payload, overrideByScene.get(scene.sceneId));
    for (const field of ["objective", "obstacle", "change"] as const) {
      const value = effective[field];
      if (!value) continue;
      ooc.push({
        sceneId: scene.sceneId,
        field,
        value,
        authority: effective.source[field] === "user" ? "user" : "suggestion",
        referenceId: `ooc:${scene.sceneId}:${field}`,
      });
    }
    for (const observation of analysis.payload.observations) {
      const dismissalKey = `${scene.sceneId}:${analysis.sourceHash}:${analysis.analysisVersion}:${observation.id}`;
      if (dismissed.has(dismissalKey)) continue;
      observations.push({
        id: observation.id,
        sceneId: scene.sceneId,
        state: observation.state,
        title: observation.title,
        text: observation.question ?? observation.observation ?? "",
        blockIds: observation.evidence.map((evidence) => evidence.blockId),
        referenceId: `observation:${scene.sceneId}:${observation.id}`,
      });
    }
  }

  const activeElements = (input.elements ?? []).filter((element) => element.status !== "dismissed");
  const elementById = new Map(activeElements.map((element) => [element.id, element]));
  const activeLinks = (input.links ?? []).filter((link) => link.status !== "dismissed"
    && elementById.has(link.setupElementId) && elementById.has(link.payoffElementId));
  const relatedElementIds = new Set<string>();
  if (input.scope === "scene" && input.sceneId) {
    for (const element of activeElements) if (element.sceneId === input.sceneId) relatedElementIds.add(element.id);
    for (const link of activeLinks) {
      if (relatedElementIds.has(link.setupElementId) || relatedElementIds.has(link.payoffElementId)) {
        relatedElementIds.add(link.setupElementId);
        relatedElementIds.add(link.payoffElementId);
      }
    }
  }
  const selectedElements = activeElements
    .filter((element) => input.scope === "document" || relatedElementIds.has(element.id))
    .sort((left, right) => narrativeAuthorityRank(right) - narrativeAuthorityRank(left))
    .slice(0, 80);
  const selectedElementIds = new Set(selectedElements.map((element) => element.id));
  const narrativeElements = selectedElements.map((element) => ({
    id: element.id,
    type: element.type,
    sceneId: element.sceneId,
    blockId: element.blockId,
    label: element.label,
    excerpt: element.excerpt,
    status: element.status,
    authority: element.source === "user" ? "user" as const : element.status === "confirmed" ? "confirmed" as const : "suggestion" as const,
    referenceId: `narrative:${element.id}`,
  }));
  const narrativeLinks = activeLinks.filter((link) => selectedElementIds.has(link.setupElementId) && selectedElementIds.has(link.payoffElementId)).map((link) => ({
    id: link.id,
    setupElementId: link.setupElementId,
    payoffElementId: link.payoffElementId,
    status: link.status,
    authority: link.source === "user" ? "user" as const : link.status === "confirmed" ? "confirmed" as const : "suggestion" as const,
  }));
  const pulseMilestones = (input.pulseMilestones ?? []).filter((milestone) => milestone.status !== "dismissed"
    && (input.scope === "document" || includedSceneIds.has(milestone.sceneId))).slice(0, 24).map((milestone) => ({
      id: milestone.id, sceneId: milestone.sceneId, label: milestone.label, type: milestone.type, status: milestone.status,
      referenceId: `pulse:${milestone.id}`,
    }));
  const pulseZones = (input.pulseZones ?? []).filter((zone) => input.scope === "document"
    || includedSceneIds.has(zone.startSceneId) || includedSceneIds.has(zone.endSceneId)).slice(0, 16).map((zone) => ({
      startSceneId: zone.startSceneId, endSceneId: zone.endSceneId, type: zone.type, note: zone.note,
    }));

  const references: WriterGuidedReference[] = [
    ...contextScenes.map((scene) => ({
      referenceId: `scene:${scene.sceneId}`,
      type: "scene" as const,
      targetId: scene.sceneId,
      sceneId: scene.sceneId,
      blockId: scene.sceneId,
      label: `Escena ${scene.sceneNumber} · ${scene.heading}`,
      status: null,
    })),
    ...ooc.map((item) => ({
      referenceId: item.referenceId,
      type: "ooc" as const,
      targetId: `${item.sceneId}:${item.field}`,
      sceneId: item.sceneId,
      blockId: item.sceneId,
      label: `${oocLabel(item.field)} · ${sceneLabel(contextScenes, item.sceneId)}`,
      status: item.authority,
    })),
    ...observations.map((item) => ({
      referenceId: item.referenceId,
      type: "observation" as const,
      targetId: item.id,
      sceneId: item.sceneId,
      blockId: item.blockIds[0] ?? item.sceneId,
      label: `${item.title} · ${sceneLabel(contextScenes, item.sceneId)}`,
      status: item.state,
    })),
    ...narrativeElements.map((item) => ({
      referenceId: item.referenceId,
      type: item.type,
      targetId: item.id,
      sceneId: item.sceneId,
      blockId: item.blockId,
      label: `${item.type === "setup" ? "Setup" : "Payoff"} · ${item.label}`,
      status: item.status,
    })),
    ...pulseMilestones.map((item) => ({
      referenceId: item.referenceId,
      type: "pulse" as const,
      targetId: item.id,
      sceneId: item.sceneId,
      blockId: item.sceneId,
      label: `Narrative Pulse · ${item.label}`,
      status: item.status,
    })),
  ];

  return {
    scope: input.scope,
    documentHash,
    focusSceneId: input.scope === "scene" ? input.sceneId : null,
    scenes: contextScenes,
    ooc,
    observations,
    narrativeElements,
    narrativeLinks,
    pulse: { milestones: pulseMilestones, zones: pulseZones },
    references,
  };
}

export function writerGuidedWritingProviderInput(
  context: WriterGuidedWritingContext,
  history: WriterGuidedWritingMessage[],
  question: string,
  selection?: WriterGuidedSelectionInput | null,
  ideaContext?: WriterIdeaContext | null,
) {
  const providerContext = selection && "sceneIds" in selection
    ? guidedWritingSelectionContext(context, selection.sceneIds)
    : context;
  return JSON.stringify({
    context: {
      ...providerContext,
      references: providerContext.references.map(({ referenceId, type, targetId, sceneId, blockId, label, status }) => ({
        referenceId, type, targetId, sceneId, blockId, label, status,
      })),
    },
    conversation: history.slice(-10).map((message) => message.role === "user"
      ? { role: "user", content: message.content }
      : { role: "assistant", response: message.response }),
    currentQuestion: question,
    selectedIdea: ideaContext ?? null,
    selection: selection?.text.trim() ? ("blockIds" in selection ? {
      blockIds: selection.blockIds,
      sceneIds: selection.sceneIds,
      text: selection.text.trim(),
      from: selection.from,
      to: selection.to,
      sourceRevision: selection.sourceRevision,
      documentHash: selection.documentHash,
    } : { blockIds: [selection.blockId], text: selection.text.trim() }) : null,
  });
}

function guidedWritingSelectionContext(
  context: WriterGuidedWritingContext,
  selectedSceneIds: string[],
): WriterGuidedWritingContext {
  const selected = new Set(selectedSceneIds);
  const included = new Set<string>();
  for (const sceneId of selectedSceneIds) {
    const index = context.scenes.findIndex((scene) => scene.sceneId === sceneId);
    if (index < 0) continue;
    included.add(sceneId);
    if (index > 0) included.add(context.scenes[index - 1].sceneId);
    if (index + 1 < context.scenes.length) included.add(context.scenes[index + 1].sceneId);
  }
  const scenes = context.scenes
    .filter((scene) => included.has(scene.sceneId))
    .map((scene) => ({ ...scene, role: selected.has(scene.sceneId) ? "focus" as const : "adjacent" as const }));
  const narrativeElements = context.narrativeElements.filter((element) => included.has(element.sceneId));
  const elementIds = new Set(narrativeElements.map((element) => element.id));
  const references = context.references.filter((reference) => included.has(reference.sceneId));
  return {
    ...context,
    focusSceneId: selectedSceneIds[0] ?? null,
    scenes,
    ooc: context.ooc.filter((item) => included.has(item.sceneId)),
    observations: context.observations.filter((item) => included.has(item.sceneId)),
    narrativeElements,
    narrativeLinks: context.narrativeLinks.filter((link) => (
      elementIds.has(link.setupElementId) && elementIds.has(link.payoffElementId)
    )),
    pulse: {
      milestones: context.pulse.milestones.filter((milestone) => included.has(milestone.sceneId)),
      zones: context.pulse.zones.filter((zone) => (
        included.has(zone.startSceneId) || included.has(zone.endSceneId)
      )),
    },
    references,
  };
}

export function validateWriterGuidedWritingOutput(
  value: unknown,
  context: WriterGuidedWritingContext,
  question: string,
): WriterGuidedWritingResponse {
  if (!isRecord(value) || !hasExactKeys(value, [
    "summary", "questions", "options", "references", "warnings", "redirectedFromWritingRequest",
  ])) throw new Error("guided_writing_invalid_schema");
  if (typeof value.redirectedFromWritingRequest !== "boolean") throw new Error("guided_writing_invalid_redirect");
  if (writerGuidedWritingRequestAsksForProse(question) && !value.redirectedFromWritingRequest) {
    throw new Error("guided_writing_missing_redirect");
  }
  const catalog = new Map(context.references.map((reference) => [reference.referenceId, reference]));
  const summary = cleanGuidanceText(value.summary, 800);
  if (!Array.isArray(value.questions) || value.questions.length < 2 || value.questions.length > 5) {
    throw new Error("guided_writing_invalid_questions");
  }
  const questionIds = new Set<string>();
  const questions = value.questions.map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["id", "text", "referenceIds"])) throw new Error("guided_writing_invalid_question");
    const id = cleanToken(item.id, 64);
    if (questionIds.has(id)) throw new Error("guided_writing_duplicate_question");
    questionIds.add(id);
    return { id, text: cleanGuidanceText(item.text, 420), referenceIds: parseReferenceIds(item.referenceIds, catalog, 6) };
  });
  if (!Array.isArray(value.options) || value.options.length > 3) throw new Error("guided_writing_invalid_options");
  const optionIds = new Set<string>();
  const options = value.options.map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["id", "title", "change", "consequence", "referenceIds"])) {
      throw new Error("guided_writing_invalid_option");
    }
    const id = cleanToken(item.id, 64);
    if (optionIds.has(id)) throw new Error("guided_writing_duplicate_option");
    optionIds.add(id);
    return {
      id,
      title: cleanGuidanceText(item.title, 120),
      change: cleanGuidanceText(item.change, 360),
      consequence: cleanGuidanceText(item.consequence, 360),
      referenceIds: parseReferenceIds(item.referenceIds, catalog, 6),
    };
  });
  if (!Array.isArray(value.references) || value.references.length > 12) throw new Error("guided_writing_invalid_references");
  const seenReferences = new Set<string>();
  const references = value.references.map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["referenceId", "note"]) || typeof item.referenceId !== "string") {
      throw new Error("guided_writing_invalid_reference");
    }
    const source = catalog.get(item.referenceId);
    if (!source || seenReferences.has(item.referenceId)) throw new Error("guided_writing_invalid_reference");
    seenReferences.add(item.referenceId);
    return { ...source, note: cleanGuidanceText(item.note, 240) };
  });
  if (!Array.isArray(value.warnings) || value.warnings.length > 4) throw new Error("guided_writing_invalid_warnings");
  const warnings = value.warnings.map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["code", "message"])
      || !["context_stale", "limited_context", "ambiguous", "writing_request_redirected", "other"].includes(String(item.code))) {
      throw new Error("guided_writing_invalid_warning");
    }
    return { code: item.code, message: cleanGuidanceText(item.message, 260) } as WriterGuidedWritingResponse["warnings"][number];
  });
  return { summary, questions, options, references, warnings, redirectedFromWritingRequest: value.redirectedFromWritingRequest };
}

export function writerGuidedWritingOutputSchema() {
  const referenceIds = { type: "array", maxItems: 6, items: { type: "string", maxLength: 180 } } as const;
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "questions", "options", "references", "warnings", "redirectedFromWritingRequest"],
    properties: {
      summary: { type: "string", maxLength: 800 },
      questions: { type: "array", minItems: 2, maxItems: 5, items: {
        type: "object", additionalProperties: false, required: ["id", "text", "referenceIds"],
        properties: { id: { type: "string", maxLength: 64 }, text: { type: "string", maxLength: 420 }, referenceIds },
      } },
      options: { type: "array", maxItems: 3, items: {
        type: "object", additionalProperties: false, required: ["id", "title", "change", "consequence", "referenceIds"],
        properties: {
          id: { type: "string", maxLength: 64 }, title: { type: "string", maxLength: 120 },
          change: { type: "string", maxLength: 360 }, consequence: { type: "string", maxLength: 360 }, referenceIds,
        },
      } },
      references: { type: "array", maxItems: 12, items: {
        type: "object", additionalProperties: false, required: ["referenceId", "note"],
        properties: { referenceId: { type: "string", maxLength: 180 }, note: { type: "string", maxLength: 240 } },
      } },
      warnings: { type: "array", maxItems: 4, items: {
        type: "object", additionalProperties: false, required: ["code", "message"],
        properties: {
          code: { type: "string", enum: ["context_stale", "limited_context", "ambiguous", "writing_request_redirected", "other"] },
          message: { type: "string", maxLength: 260 },
        },
      } },
      redirectedFromWritingRequest: { type: "boolean" },
    },
  } as const;
}

export function writerGuidedWritingRequestAsksForProse(value: string) {
  return /\b(?:escr[ií]be(?:me)?|redacta|reescribe|completa (?:el )?di[aá]logo|genera (?:la|una) escena|write (?:me )?(?:the|a) scene|rewrite (?:the|this) scene)\b/iu.test(value);
}

function parseReferenceIds(value: unknown, catalog: ReadonlyMap<string, WriterGuidedReference>, limit: number) {
  if (!Array.isArray(value) || value.length > limit) throw new Error("guided_writing_invalid_reference_ids");
  const ids = value.map((item) => {
    if (typeof item !== "string" || !catalog.has(item)) throw new Error("guided_writing_invalid_reference_ids");
    return item;
  });
  if (new Set(ids).size !== ids.length) throw new Error("guided_writing_invalid_reference_ids");
  return ids;
}

function cleanGuidanceText(value: unknown, limit: number) {
  if (typeof value !== "string") throw new Error("guided_writing_invalid_text");
  if (/(?:^|\n)\s*(?:INT\.|EXT\.|INT\.\/EXT\.)\s+/iu.test(value)
    || /(?:^|\n)\s*[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .'-]{1,32}:\s*\S/u.test(value)) {
    throw new Error("guided_writing_screenplay_prose_rejected");
  }
  const text = value.trim().replace(/\s+/gu, " ");
  if (!text || text.length > limit) throw new Error("guided_writing_invalid_text");
  return text;
}

function cleanToken(value: unknown, limit: number) {
  if (typeof value !== "string") throw new Error("guided_writing_invalid_token");
  const token = value.trim();
  if (!token || token.length > limit || !/^[a-z0-9:_-]+$/iu.test(token)) throw new Error("guided_writing_invalid_token");
  return token;
}

function narrativeAuthorityRank(element: WriterNarrativeElement) {
  if (element.source === "user") return 3;
  if (element.status === "confirmed") return 2;
  return 1;
}

function sceneLabel(scenes: WriterGuidedContextScene[], sceneId: string) {
  const scene = scenes.find((item) => item.sceneId === sceneId);
  return scene ? `Escena ${scene.sceneNumber}` : "Escena relacionada";
}

function oocLabel(field: "objective" | "obstacle" | "change") {
  return field === "objective" ? "Objetivo" : field === "obstacle" ? "Obstáculo" : "Cambio";
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => actual[index] === key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
