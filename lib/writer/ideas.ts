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
      sceneId: reference.sceneId,
      blockId: reference.blockId,
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

export function validateWriterIdeasOutput(value: unknown, source: WriterIdeasSourceContext): WriterIdea[] {
  if (!isRecord(value) || !hasExactKeys(value, ["ideas"]) || !Array.isArray(value.ideas)
    || value.ideas.length < 3 || value.ideas.length > 5) throw new Error("writer_ideas_invalid_schema");
  const catalog = new Map(source.references.map((reference) => [reference.id, reference]));
  const ids = new Set<string>();
  const titles = new Set<string>();
  return value.ideas.map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["id", "title", "direction", "consequence", "category", "basis", "referenceIds"])
      || !isWriterIdeaCategory(item.category) || !isWriterIdeaBasis(item.basis) || !Array.isArray(item.referenceIds) || item.referenceIds.length > 4) {
      throw new Error("writer_ideas_invalid_item");
    }
    const id = cleanIdeaText(item.id, 64);
    const title = cleanIdeaText(item.title, 120);
    const normalizedTitle = title.toLocaleLowerCase("es-MX");
    if (ids.has(id) || titles.has(normalizedTitle)) throw new Error("writer_ideas_duplicate_item");
    ids.add(id);
    titles.add(normalizedTitle);
    const seen = new Set<string>();
    const references = item.referenceIds.map((referenceId) => {
      if (typeof referenceId !== "string" || seen.has(referenceId)) throw new Error("writer_ideas_invalid_reference");
      const reference = catalog.get(referenceId);
      if (!reference) throw new Error("writer_ideas_invalid_reference");
      seen.add(referenceId);
      return reference;
    });
    return {
      id,
      title,
      direction: cleanIdeaText(item.direction, 500),
      consequence: cleanIdeaText(item.consequence, 360),
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
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "direction", "consequence", "category", "basis", "referenceIds"],
          properties: {
            id: { type: "string", maxLength: 64 },
            title: { type: "string", maxLength: 120 },
            direction: { type: "string", maxLength: 500 },
            consequence: { type: "string", maxLength: 360 },
            category: { type: "string", enum: WRITER_IDEA_CATEGORIES },
            basis: { type: "string", enum: ["source_fact", "interpretation", "new_direction"] },
            referenceIds: { type: "array", maxItems: 4, items: { type: "string", maxLength: 80 } },
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

function cleanIdeaText(value: unknown, maximum: number) {
  if (typeof value !== "string") throw new Error("writer_ideas_invalid_text");
  const result = value.trim().replace(/\s+/gu, " ");
  if (!result || result.length > maximum) throw new Error("writer_ideas_invalid_text");
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}
