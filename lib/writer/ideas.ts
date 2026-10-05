import { blockText, type WriterDocument } from "./document.ts";
import type { WriterSearchResult, WriterSearchScope } from "./search.ts";

export const WRITER_IDEA_CATEGORIES = [
  "Conflicto",
  "Giro",
  "Personaje",
  "Subtexto",
  "Visual",
  "Obstáculo",
  "Revelación",
] as const;

export const WRITER_IDEAS_OUTPUT_CONTRACT_VERSION = "writer-ideas-output-v2";
export const WRITER_IDEAS_MIN_COUNT = 3;
export const WRITER_IDEAS_MAX_COUNT = 5;

const WRITER_IDEA_LIMITS = {
  id: 64,
  title: 120,
  direction: 500,
  consequence: 360,
  references: 4,
  referenceId: 80,
} as const;

export type WriterIdeaCategory = (typeof WRITER_IDEA_CATEGORIES)[number];

export type WriterIdea = {
  id: string;
  title: string;
  direction: string;
  consequence: string;
  category: WriterIdeaCategory;
  basis: "source_fact" | "interpretation" | "new_direction";
  references: WriterSearchResult[];
};

export type WriterIdeasRequest = {
  scope: WriterSearchScope;
  sceneId: string | null;
  question: string;
  category: WriterIdeaCategory | null;
};

export type WriterIdeaContext = {
  ideaId: string;
  title: string;
  direction: string;
  consequence: string;
  category: WriterIdeaCategory;
  scope: WriterSearchScope;
  sceneId: string | null;
  sourceRevision: number;
};

export type WriterIdeasSourceContext = {
  scope: WriterSearchScope;
  sceneId: string | null;
  scenes: Array<{
    sceneId: string;
    sceneNumber: number;
    heading: string;
    blocks: Array<{ blockId: string; kind: string; text: string }>;
  }>;
  references: WriterSearchResult[];
};

export class WriterIdeasOutputError extends Error {
  readonly code: string;
  readonly fieldPath: string;
  readonly expected: string;
  readonly receivedType: string;
  readonly count: number | null;
  readonly length: number | null;

  constructor(
    code: string,
    fieldPath: string,
    expected: string,
    receivedType: string,
    count: number | null = null,
    length: number | null = null,
  ) {
    super(`writer_ideas_${legacyIdeasErrorCode(code)}:${code}`);
    this.name = "WriterIdeasOutputError";
    this.code = code;
    this.fieldPath = fieldPath;
    this.expected = expected;
    this.receivedType = receivedType;
    this.count = count;
    this.length = length;
  }
}

function legacyIdeasErrorCode(code: string) {
  if (code === "root_shape" || code === "idea_count") return "invalid_schema";
  if (code === "item_shape") return "invalid_item";
  if (code.startsWith("reference_")) return "invalid_reference";
  if (code.startsWith("duplicate_")) return "duplicate_item";
  if (code === "text") return "invalid_text";
  return code;
}

export function buildWriterIdeasSourceContext(
  document: WriterDocument,
  scope: WriterSearchScope,
  targetSceneId: string | null,
): WriterIdeasSourceContext {
  const scenes: WriterIdeasSourceContext["scenes"] = [];
  const references: WriterSearchResult[] = [];
  let current: WriterIdeasSourceContext["scenes"][number] | null = null;

  for (const block of document.content) {
    const text = blockText(block);
    if (block.attrs.kind === "sceneHeading") {
      current = {
        sceneId: block.attrs.id,
        sceneNumber: scenes.length + 1,
        heading: text.trim() || "Escena sin encabezado",
        blocks: [],
      };
      scenes.push(current);
    }
    if (!current) continue;
    current.blocks.push({ blockId: block.attrs.id, kind: block.attrs.kind, text });
  }

  const selectedScenes = scope === "scene"
    ? scenes.filter((scene) => scene.sceneId === targetSceneId)
    : scenes;
  if (scope === "scene" && selectedScenes.length !== 1) throw new Error("writer_ideas_scene_not_found");

  for (const scene of selectedScenes) {
    references.push({
      id: `scene:${scene.sceneId}`,
      sceneId: scene.sceneId,
      sceneNumber: scene.sceneNumber,
      sceneHeading: scene.heading,
      blockId: scene.sceneId,
      blockKind: "sceneHeading",
      start: 0,
      end: scene.heading.length,
      text: scene.heading,
      snippet: scene.heading,
      reason: "Referencia de escena",
    });
    for (const block of scene.blocks) {
      if (!block.text.trim()) continue;
      references.push({
        id: `block:${block.blockId}`,
        sceneId: scene.sceneId,
        sceneNumber: scene.sceneNumber,
        sceneHeading: scene.heading,
        blockId: block.blockId,
        blockKind: block.kind,
        start: 0,
        end: block.text.length,
        text: block.text,
        snippet: block.text.trim().slice(0, 220),
        reason: "Referencia verificable del guion",
      });
    }
  }

  return { scope, sceneId: scope === "scene" ? targetSceneId : null, scenes: selectedScenes, references };
}

export function writerIdeasProviderInput(input: {
  request: WriterIdeasRequest;
  sourceRevision: number;
  source: WriterIdeasSourceContext;
  narrativeContext?: unknown;
}) {
  return JSON.stringify({
    screenplay: input.source.scenes,
    narrativeContext: input.narrativeContext ?? null,
    referenceCatalog: input.source.references.map((reference) => ({
      referenceId: reference.id,
      label: reference.sceneHeading,
    })),
    request: {
      userQuestion: input.request.question.trim(),
      categoryIntent: input.request.category,
      scope: input.request.scope,
      sceneId: input.request.sceneId,
      sourceRevision: input.sourceRevision,
    },
  });
}

export function extractWriterIdeasProviderPayload(response: unknown): unknown {
  if (!isRecord(response)) {
    throw new WriterIdeasOutputError("response_shape", "response", "Responses object", receivedType(response));
  }
  if (response.status === "incomplete") {
    throw new WriterIdeasOutputError("response_incomplete", "response.status", "completed", "incomplete");
  }
  if (hasResponseRefusal(response.output)) {
    throw new WriterIdeasOutputError("response_refusal", "response.output", "structured output", "refusal");
  }
  if (response.status !== "completed") {
    throw new WriterIdeasOutputError("response_status", "response.status", "completed", receivedType(response.status));
  }
  if (typeof response.output_text !== "string" || !response.output_text.trim()) {
    throw new WriterIdeasOutputError("response_text", "response.output_text", "non-empty JSON text", receivedType(response.output_text));
  }
  try {
    return JSON.parse(response.output_text);
  } catch {
    throw new WriterIdeasOutputError("response_json", "response.output_text", "valid JSON", "string");
  }
}

export function validateWriterIdeasOutput(value: unknown, source: WriterIdeasSourceContext): WriterIdea[] {
  if (!isRecord(value) || !hasExactKeys(value, ["ideas"]) || !Array.isArray(value.ideas)) {
    throw new WriterIdeasOutputError("root_shape", "ideas", "array", receivedType(isRecord(value) ? value.ideas : value));
  }
  if (value.ideas.length < WRITER_IDEAS_MIN_COUNT || value.ideas.length > WRITER_IDEAS_MAX_COUNT) {
    throw new WriterIdeasOutputError(
      "idea_count",
      "ideas",
      `${WRITER_IDEAS_MIN_COUNT}-${WRITER_IDEAS_MAX_COUNT} items`,
      "array",
      value.ideas.length,
    );
  }
  const catalog = new Map(source.references.map((reference) => [reference.id, reference]));
  const scenes = new Map(source.references
    .filter((reference) => reference.id.startsWith("scene:"))
    .map((reference) => [reference.sceneId, reference]));
  const blocks = new Map(source.references
    .filter((reference) => reference.id.startsWith("block:"))
    .map((reference) => [reference.blockId, reference]));
  const ids = new Set<string>();
  const titles = new Set<string>();
  return value.ideas.map((item, ideaIndex) => {
    const itemPath = `ideas[${ideaIndex}]`;
    if (!isRecord(item) || !hasExactKeys(item, ["id", "title", "direction", "consequence", "category", "basis", "referenceIds"])
      || !isWriterIdeaCategory(item.category) || !isWriterIdeaBasis(item.basis) || !Array.isArray(item.referenceIds)
      || item.referenceIds.length > WRITER_IDEA_LIMITS.references) {
      throw new WriterIdeasOutputError("item_shape", itemPath, "complete Writer idea", receivedType(item));
    }
    const id = cleanIdeaText(item.id, WRITER_IDEA_LIMITS.id, `${itemPath}.id`);
    const title = cleanIdeaText(item.title, WRITER_IDEA_LIMITS.title, `${itemPath}.title`);
    const normalizedTitle = title.toLocaleLowerCase("es-MX");
    if (ids.has(id)) throw new WriterIdeasOutputError("duplicate_id", `${itemPath}.id`, "unique id", "string");
    if (titles.has(normalizedTitle)) throw new WriterIdeasOutputError("duplicate_title", `${itemPath}.title`, "unique title", "string");
    ids.add(id);
    titles.add(normalizedTitle);
    const seen = new Set<string>();
    const references = item.referenceIds.map((referenceId, referenceIndex) => {
      const fieldPath = `${itemPath}.referenceIds[${referenceIndex}]`;
      if (typeof referenceId !== "string") {
        throw new WriterIdeasOutputError("reference_type", fieldPath, "source reference id", receivedType(referenceId));
      }
      const reference = catalog.get(referenceId) ?? scenes.get(referenceId) ?? blocks.get(referenceId);
      if (!reference) {
        throw new WriterIdeasOutputError("reference_unknown", fieldPath, "reference from current source catalog", "string");
      }
      if (seen.has(reference.id)) {
        throw new WriterIdeasOutputError("reference_duplicate", fieldPath, "unique source reference", "string");
      }
      seen.add(reference.id);
      return reference;
    });
    return {
      id,
      title,
      direction: cleanIdeaText(item.direction, WRITER_IDEA_LIMITS.direction, `${itemPath}.direction`),
      consequence: cleanIdeaText(item.consequence, WRITER_IDEA_LIMITS.consequence, `${itemPath}.consequence`),
      category: item.category,
      basis: item.basis,
      references,
    };
  });
}

export function writerIdeasOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ideas"],
    properties: {
      ideas: {
        type: "array",
        minItems: WRITER_IDEAS_MIN_COUNT,
        maxItems: WRITER_IDEAS_MAX_COUNT,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "direction", "consequence", "category", "basis", "referenceIds"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: WRITER_IDEA_LIMITS.id },
            title: { type: "string", minLength: 1, maxLength: WRITER_IDEA_LIMITS.title },
            direction: { type: "string", minLength: 1, maxLength: WRITER_IDEA_LIMITS.direction },
            consequence: { type: "string", minLength: 1, maxLength: WRITER_IDEA_LIMITS.consequence },
            category: { type: "string", enum: WRITER_IDEA_CATEGORIES },
            basis: { type: "string", enum: ["source_fact", "interpretation", "new_direction"] },
            referenceIds: {
              type: "array",
              maxItems: WRITER_IDEA_LIMITS.references,
              items: { type: "string", minLength: 1, maxLength: WRITER_IDEA_LIMITS.referenceId },
            },
          },
        },
      },
    },
  } as const;
}

export function isWriterIdeaCategory(value: unknown): value is WriterIdeaCategory {
  return typeof value === "string" && (WRITER_IDEA_CATEGORIES as readonly string[]).includes(value);
}

function isWriterIdeaBasis(value: unknown): value is WriterIdea["basis"] {
  return value === "source_fact" || value === "interpretation" || value === "new_direction";
}

function cleanIdeaText(value: unknown, maximum: number, fieldPath: string) {
  if (typeof value !== "string") {
    throw new WriterIdeasOutputError("text", fieldPath, `non-empty string up to ${maximum} characters`, receivedType(value));
  }
  const result = value.trim().replace(/\s+/gu, " ");
  if (!result || result.length > maximum) {
    throw new WriterIdeasOutputError(
      "text",
      fieldPath,
      `non-empty string up to ${maximum} characters`,
      "string",
      null,
      result.length,
    );
  }
  return result;
}

function hasResponseRefusal(output: unknown) {
  if (!Array.isArray(output)) return false;
  return output.some((item) => isRecord(item) && Array.isArray(item.content)
    && item.content.some((content) => isRecord(content) && content.type === "refusal"));
}

function receivedType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}
