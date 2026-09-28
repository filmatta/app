import {
  analyzePastedWriterText,
  analyzeWriterFdx,
  analyzeWriterTxt,
  writerImportPreservesSignificantText,
  type WriterImportBlock,
  type WriterImportFormat,
  type WriterImportStaging,
} from "./import.ts";
import {
  WRITER_SCHEMA_VERSION,
  blockText,
  createBlock,
  type ScreenplayKind,
  type WriterDocument,
} from "./document.ts";
import {
  analyzeWriterCharacterObservations,
  deriveWriterKnownCharacterIdentities,
  normalizeWriterCharacterIdentity,
  writerObservationTextHash,
  type WriterCharacterEvidence,
} from "./character-observations.ts";

export const WRITER_ASSISTED_IMPORT_VERSION = "writer-import-ai-v1";
export const WRITER_ASSISTED_IMPORT_MODEL = "gpt-5.6-luna";
export const WRITER_ASSISTED_IMPORT_REASONING = "none";
export const WRITER_ASSISTED_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const WRITER_ASSISTED_IMPORT_MAX_WORDS = 30_000;
export const WRITER_ASSISTED_IMPORT_MAX_SOURCE_TOKENS = 80_000;
export const WRITER_ASSISTED_IMPORT_MAX_CALLS = 24;
export const WRITER_ASSISTED_IMPORT_MAX_CONCURRENCY = 2;
export const WRITER_ASSISTED_IMPORT_MAX_COST_MICRO_USD = 200_000;
export const WRITER_ASSISTED_IMPORT_GLOBAL_COST_MICRO_USD = 2_000_000;

export type AssistedImportRelation = "intervention" | "action" | "mention" | "indeterminate";
export type AssistedImportPresence = "present" | "absent" | "unknown";
export type AssistedImportSource = "explicit" | "rule" | "ai" | "user";

export type AssistedImportClassification = {
  blockId: string;
  kind: ScreenplayKind;
  uncertain: boolean;
  reason: string;
};

export type AssistedImportEntityEvidence = {
  blockId: string;
  start: number;
  end: number;
  label: string;
  entityType: "named" | "role" | "collective";
  relation: AssistedImportRelation;
  presence: AssistedImportPresence;
  uncertain: boolean;
  reason: string;
};

export type AssistedImportModelResult = {
  classifications: AssistedImportClassification[];
  evidence: AssistedImportEntityEvidence[];
  observations: Array<{ blockId: string; message: string }>;
};

export type AssistedImportBatch = {
  index: number;
  sceneLabel: string | null;
  blocks: WriterImportBlock[];
  classificationIds: string[];
};

export type WriterImportedIdentity = {
  key: string;
  name: string;
  source: AssistedImportSource;
  detected: true;
};

export type WriterImportedEvidence = {
  fingerprint: string;
  identityKey: string;
  identity: string;
  blockId: string;
  sceneId: string | null;
  start: number;
  end: number;
  relation: AssistedImportRelation;
  presence: AssistedImportPresence;
  source: AssistedImportSource;
  confidence: "high" | "medium" | "review";
  reason: string;
  blockHash: string;
};

export type WriterImportedFormatObservation = {
  id: string;
  blockId: string;
  sceneId: string | null;
  kind: ScreenplayKind;
  message: string;
  source: "rule" | "ai";
  blockHash: string;
};

export type AssistedImportReconciliation = {
  schemaVersion: typeof WRITER_SCHEMA_VERSION;
  document: WriterDocument;
  identities: WriterImportedIdentity[];
  evidence: WriterImportedEvidence[];
  observations: WriterImportedFormatObservation[];
};

const SCREENPLAY_KIND_SCHEMA = {
  type: "string",
  enum: ["sceneHeading", "action", "character", "dialogue", "parenthetical", "transition", "authorNote"],
} as const;

export const WRITER_ASSISTED_IMPORT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["classifications", "evidence", "observations"],
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["blockId", "kind", "uncertain", "reason"],
        properties: {
          blockId: { type: "string" },
          kind: SCREENPLAY_KIND_SCHEMA,
          uncertain: { type: "boolean" },
          reason: { type: "string", maxLength: 180 },
        },
      },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["blockId", "start", "end", "label", "entityType", "relation", "presence", "uncertain", "reason"],
        properties: {
          blockId: { type: "string" },
          start: { type: "integer", minimum: 0 },
          end: { type: "integer", minimum: 1 },
          label: { type: "string", minLength: 1, maxLength: 64 },
          entityType: { type: "string", enum: ["named", "role", "collective"] },
          relation: { type: "string", enum: ["intervention", "action", "mention", "indeterminate"] },
          presence: { type: "string", enum: ["present", "absent", "unknown"] },
          uncertain: { type: "boolean" },
          reason: { type: "string", maxLength: 180 },
        },
      },
    },
    observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["blockId", "message"],
        properties: {
          blockId: { type: "string" },
          message: { type: "string", minLength: 1, maxLength: 180 },
        },
      },
    },
  },
} as const;

const KIND_SET = new Set<ScreenplayKind>([
  "sceneHeading", "action", "character", "dialogue", "parenthetical", "transition", "authorNote",
]);
const PRONOUNS = new Set(["ÉL", "EL", "ELLA", "ELLOS", "ELLAS", "ALGUIEN"]);
const INANIMATE = new Set(["PUERTA", "VENTANA", "VIENTO", "ESPERANZA"]);

export function prepareAssistedImportStaging(input: {
  format: WriterImportFormat;
  sourceText: string;
  fileName?: string;
  title: string;
}) {
  const staging = input.format === "fdx"
    ? analyzeWriterFdx(input.sourceText, input.fileName || "borrador.fdx")
    : input.format === "txt"
      ? analyzeWriterTxt(input.sourceText, input.fileName || "borrador.txt")
      : analyzePastedWriterText(input.sourceText, input.title);
  if (!writerImportPreservesSignificantText(staging)) {
    throw new Error("La verificación independiente de integridad del texto falló.");
  }
  return withStableSourceIds(staging);
}

export function buildAssistedImportBatches(staging: WriterImportStaging) {
  if (staging.source.format === "fdx" && staging.blocks.every((block) => block.proposedKind)) return [];
  const batches: AssistedImportBatch[] = [];
  let current: AssistedImportBatch | null = null;
  let currentCharacters = 0;
  let sceneLabel: string | null = null;
  for (const block of staging.blocks) {
    if (block.proposedKind === "sceneHeading") sceneLabel = block.originalText;
    const shouldAnalyze = block.proposedKind === "action"
      || block.proposedKind === "character"
      || block.confidence !== "high"
      || !block.proposedKind;
    if (!shouldAnalyze) continue;
    const size = block.originalText.length + 180;
    if (!current || current.blocks.length >= 42 || currentCharacters + size > 12_000) {
      current = { index: batches.length, sceneLabel, blocks: [], classificationIds: [] };
      batches.push(current);
      currentCharacters = 0;
    }
    current.blocks.push(block);
    if (block.confidence !== "high" || !block.proposedKind) current.classificationIds.push(block.id);
    currentCharacters += size;
  }
  if (batches.length > WRITER_ASSISTED_IMPORT_MAX_CALLS) {
    throw new Error("El borrador requiere más lotes de los permitidos para una importación asistida.");
  }
  return batches;
}

export function validateAssistedImportModelResult(value: unknown, batch: AssistedImportBatch): AssistedImportModelResult {
  if (!isRecord(value) || !Array.isArray(value.classifications) || !Array.isArray(value.evidence)
    || !Array.isArray(value.observations)) throw new Error("La respuesta estructurada no es válida.");
  const blocks = new Map(batch.blocks.map((block) => [block.id, block]));
  const classificationIds = new Set(batch.classificationIds);
  const classifications = value.classifications.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.blockId !== "string" || !classificationIds.has(candidate.blockId)
      || !KIND_SET.has(candidate.kind as ScreenplayKind) || typeof candidate.uncertain !== "boolean"
      || typeof candidate.reason !== "string") throw new Error("La IA devolvió una clasificación fuera del lote.");
    const block = blocks.get(candidate.blockId)!;
    let kind = candidate.kind as ScreenplayKind;
    let uncertain = candidate.uncertain;
    let reason = candidate.reason.slice(0, 180);
    if (kind === "character" && !canBeCharacterHeading(block.originalText)) {
      kind = "action";
      uncertain = true;
      reason = "La línea contiene una oración narrativa; se preservó como Acción.";
    }
    return { blockId: candidate.blockId, kind, uncertain, reason };
  });
  if (new Set(classifications.map((item) => item.blockId)).size !== classifications.length) {
    throw new Error("La IA duplicó una clasificación dentro del lote.");
  }
  if (classifications.length !== classificationIds.size
    || classifications.some((item) => !classificationIds.has(item.blockId))) {
    throw new Error("La IA no clasificó todos los elementos ambiguos del lote.");
  }
  const evidence = value.evidence.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.blockId !== "string" || !blocks.has(candidate.blockId)
      || !integer(candidate.start) || !integer(candidate.end) || candidate.start < 0 || candidate.end <= candidate.start
      || typeof candidate.label !== "string" || !["named", "role", "collective"].includes(String(candidate.entityType))
      || !["intervention", "action", "mention", "indeterminate"].includes(String(candidate.relation))
      || !["present", "absent", "unknown"].includes(String(candidate.presence))
      || typeof candidate.uncertain !== "boolean" || typeof candidate.reason !== "string") {
      throw new Error("La IA devolvió evidencia fuera de contrato.");
    }
    const block = blocks.get(candidate.blockId)!;
    if (candidate.end > block.originalText.length) throw new Error("La IA devolvió un rango inexistente.");
    const surface = block.originalText.slice(candidate.start, candidate.end);
    if (!surface.trim()) throw new Error("La IA devolvió evidencia vacía.");
    const normalized = normalizeWriterCharacterIdentity(candidate.label);
    if (PRONOUNS.has(normalized) || clearlyInanimate(normalized, block.originalText)) return [];
    return [{
      blockId: candidate.blockId,
      start: candidate.start,
      end: candidate.end,
      label: candidate.label.trim().replace(/\s+/gu, " ").slice(0, 64),
      entityType: candidate.entityType as AssistedImportEntityEvidence["entityType"],
      relation: candidate.relation as AssistedImportRelation,
      presence: candidate.presence as AssistedImportPresence,
      uncertain: candidate.uncertain,
      reason: candidate.reason.slice(0, 180),
    }];
  });
  const observations = value.observations.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.blockId !== "string" || !blocks.has(candidate.blockId)
      || typeof candidate.message !== "string" || !candidate.message.trim()) {
      throw new Error("La IA devolvió una observación fuera de contrato.");
    }
    return { blockId: candidate.blockId, message: candidate.message.trim().slice(0, 180) };
  });
  return { classifications, evidence, observations };
}

export function reconcileAssistedImport(
  staging: WriterImportStaging,
  modelResults: readonly AssistedImportModelResult[],
): AssistedImportReconciliation {
  const classificationById = new Map(modelResults.flatMap((result) => result.classifications).map((item) => [item.blockId, item]));
  const resolved: Array<WriterImportBlock & {
    resolvedKind: ScreenplayKind;
    source: "rule" | "ai";
    model?: Pick<AssistedImportClassification, "uncertain" | "reason">;
  }> = staging.blocks.map((block) => {
    if (block.confidence === "high" && block.proposedKind) return { ...block, resolvedKind: block.proposedKind, source: "rule" as const };
    const proposed = classificationById.get(block.id);
    if (proposed) return { ...block, resolvedKind: proposed.kind, source: "ai" as const, model: proposed };
    return {
      ...block,
      resolvedKind: block.proposedKind ?? "action",
      source: "rule" as const,
      model: { uncertain: true, reason: "Se aplicó la opción conservadora sin cambiar el texto." },
    };
  });
  const document: WriterDocument = {
    type: "doc",
    content: resolved.map((block) => createBlock(block.resolvedKind, block.originalText)),
  };
  const canonicalBySource = new Map(resolved.map((block, index) => [block.id, document.content[index]]));
  const sceneByBlock = sceneMap(document);
  const observations: WriterImportedFormatObservation[] = [];
  for (const block of resolved) {
    const canonical = canonicalBySource.get(block.id)!;
    if (block.confidence === "high" && !block.model?.uncertain) continue;
    observations.push({
      id: `format:${canonical.attrs.id}`,
      blockId: canonical.attrs.id,
      sceneId: sceneByBlock.get(canonical.attrs.id) ?? null,
      kind: block.resolvedKind,
      message: block.model?.reason || "Writer aplicó una clasificación conservadora que puedes ajustar.",
      source: block.source,
      blockHash: writerObservationTextHash(blockText(canonical)),
    });
  }
  for (const result of modelResults) {
    for (const item of result.observations) {
      const canonical = canonicalBySource.get(item.blockId);
      if (!canonical || observations.some((observation) => observation.blockId === canonical.attrs.id && observation.message === item.message)) continue;
      observations.push({
        id: `format:${canonical.attrs.id}:${writerObservationTextHash(item.message)}`,
        blockId: canonical.attrs.id,
        sceneId: sceneByBlock.get(canonical.attrs.id) ?? null,
        kind: canonical.attrs.kind,
        message: item.message,
        source: "ai",
        blockHash: writerObservationTextHash(blockText(canonical)),
      });
    }
  }

  const evidence: WriterImportedEvidence[] = [];
  const known = deriveWriterKnownCharacterIdentities(document);
  const deterministic = analyzeWriterCharacterObservations(document, known).observations;
  for (const characterBlock of document.content.filter((block) => block.attrs.kind === "character")) {
    const identity = blockText(characterBlock).trim();
    if (!identity) continue;
    const sceneId = sceneByBlock.get(characterBlock.attrs.id) ?? null;
    evidence.push(importedEvidence({
      identityKey: normalizeWriterCharacterIdentity(identity), identity, block: characterBlock, sceneId,
      start: 0, end: identity.length, relation: "intervention", presence: "unknown", source: "explicit",
      confidence: "high", reason: "Encabezado explícito de diálogo; no acredita presencia física por sí solo.",
    }));
  }
  for (const item of deterministic) {
    evidence.push(importedEvidence({
      identityKey: item.identityKey, identity: item.identity,
      block: document.content.find((block) => block.attrs.id === item.blockId)!, sceneId: item.sceneId,
      start: item.start, end: item.end,
      relation: item.evidence === "actionReference" ? "action" : item.evidence,
      presence: item.evidence === "mention" ? "unknown" : "present", source: "rule",
      confidence: item.confidence, reason: item.signals.join(" ").slice(0, 180),
    }));
  }
  for (const result of modelResults) {
    for (const item of result.evidence) {
      const block = canonicalBySource.get(item.blockId);
      if (!block) continue;
      const sceneId = sceneByBlock.get(block.attrs.id) ?? null;
      const key = identityKey(item, sceneId);
      evidence.push(importedEvidence({
        identityKey: key, identity: item.label, block, sceneId, start: item.start, end: item.end,
        relation: item.relation, presence: item.presence, source: "ai",
        confidence: item.uncertain ? "review" : "medium", reason: item.reason,
      }));
    }
  }
  const uniqueEvidence = dedupeEvidence(evidence);
  const identityMap = new Map<string, WriterImportedIdentity>();
  for (const item of uniqueEvidence) {
    const current = identityMap.get(item.identityKey);
    if (!current || sourcePriority(item.source) > sourcePriority(current.source)) {
      identityMap.set(item.identityKey, { key: item.identityKey, name: item.identity, source: item.source, detected: true });
    }
  }
  return {
    schemaVersion: WRITER_SCHEMA_VERSION,
    document,
    identities: [...identityMap.values()],
    evidence: uniqueEvidence,
    observations: observations.slice(0, 80),
  };
}

export function assertAssistedImportPreservation(staging: WriterImportStaging, document: WriterDocument) {
  const source = staging.blocks.map((block) => block.originalText).join("\n");
  const rendered = document.content.map(blockText).join("\n");
  if (source !== rendered) throw new Error("La reconciliación alteró, perdió o duplicó texto del origen.");
  if (document.content.length !== staging.blocks.length) throw new Error("La reconciliación cambió el número de bloques.");
  if (new Set(document.content.map((block) => block.attrs.id)).size !== document.content.length) {
    throw new Error("La reconciliación generó identificadores duplicados.");
  }
}

function withStableSourceIds(staging: WriterImportStaging): WriterImportStaging {
  return {
    ...staging,
    blocks: staging.blocks.map((block, index) => ({
      ...block,
      id: `source-${index + 1}-${block.sourceStartLine}-${block.sourceEndLine}`,
    })),
  };
}

function canBeCharacterHeading(value: string) {
  const trimmed = value.trim();
  if (!trimmed || [...trimmed].length > 64 || /[.!?…]/u.test(trimmed)) return false;
  const words = trimmed.split(/\s+/u);
  return words.length <= 6 && !/\p{Ll}{3,}\s+\p{Ll}{3,}/u.test(trimmed);
}

function clearlyInanimate(normalized: string, context: string) {
  if (!INANIMATE.has(normalized)) return false;
  if (normalized === "ESPERANZA" && /\b(?:a|de)\s+Esperanza\b/u.test(context)) return false;
  return true;
}

function sceneMap(document: WriterDocument) {
  const result = new Map<string, string | null>();
  let sceneId: string | null = null;
  for (const block of document.content) {
    if (block.attrs.kind === "sceneHeading") sceneId = block.attrs.id;
    result.set(block.attrs.id, sceneId);
  }
  return result;
}

function identityKey(item: AssistedImportEntityEvidence, sceneId: string | null) {
  const normalized = normalizeWriterCharacterIdentity(item.label.replace(/^(?:UN|UNA|EL|LA|LOS|LAS|DOS|TRES|VARIOS|VARIAS)\s+/iu, ""));
  return item.entityType === "named" ? normalized : `${item.entityType.toLocaleUpperCase("en-US")}:${sceneId ?? "PREAMBLE"}:${normalized}`;
}

function importedEvidence(input: {
  identityKey: string;
  identity: string;
  block: WriterDocument["content"][number];
  sceneId: string | null;
  start: number;
  end: number;
  relation: AssistedImportRelation | WriterCharacterEvidence;
  presence: AssistedImportPresence;
  source: AssistedImportSource;
  confidence: "high" | "medium" | "review";
  reason: string;
}): WriterImportedEvidence {
  const blockHash = writerObservationTextHash(blockText(input.block));
  const relation = input.relation === "actionReference" ? "action" : input.relation;
  const fingerprint = writerObservationTextHash([
    input.block.attrs.id, blockHash, input.identityKey, input.start, input.end, relation, input.source,
  ].join("\u0000"));
  return { ...input, relation, fingerprint, blockId: input.block.attrs.id, blockHash };
}

function dedupeEvidence(items: WriterImportedEvidence[]) {
  const unique = new Map<string, WriterImportedEvidence>();
  for (const item of items) {
    const key = [item.identityKey, item.blockId, item.start, item.end, item.relation].join("|");
    const current = unique.get(key);
    if (!current || sourcePriority(item.source) > sourcePriority(current.source)) unique.set(key, item);
  }
  return [...unique.values()];
}

function sourcePriority(source: AssistedImportSource) {
  return source === "user" ? 5 : source === "explicit" ? 4 : source === "ai" ? 3 : 2;
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
