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
  isWriterParticipantRole,
  normalizeWriterCharacterIdentity,
  stripWriterCharacterSuffix,
  writerCharacterIdentityKey,
  writerParticipantRoleKey,
  writerObservationTextHash,
  type WriterCharacterEvidence,
} from "./character-observations.ts";

export const WRITER_ASSISTED_IMPORT_VERSION = "writer-import-ai-v1-compact-v4";
export const WRITER_ASSISTED_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const WRITER_ASSISTED_IMPORT_MAX_WORDS = 30_000;
export const WRITER_ASSISTED_IMPORT_MAX_SOURCE_TOKENS = 80_000;
export const WRITER_ASSISTED_IMPORT_MAX_CALLS = 24;
export const WRITER_ASSISTED_IMPORT_MAX_CONCURRENCY = 2;
export const WRITER_ASSISTED_IMPORT_MAX_COST_MICRO_USD = 200_000;
export const WRITER_ASSISTED_IMPORT_MAX_AUTHORIZED_COST_MICRO_USD = 600_000;
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

export type AssistedImportCandidate = {
  candidateId: string;
  blockId: string;
  sentenceId: string;
  start: number;
  end: number;
  text: string;
  sceneId: string | null;
  sceneLabel: string | null;
  signals: string[];
  sourceHash: string;
};

export type AssistedImportSentence = {
  sentenceId: string;
  blockId: string;
  start: number;
  end: number;
  text: string;
};

export type AssistedImportCandidateDisposition = "participant" | "mention" | "nonparticipant" | "uncertain";

export type AssistedImportCandidateDecision = {
  candidateId: string;
  disposition: AssistedImportCandidateDisposition;
  entityType: "named" | "role" | "collective";
  relation: AssistedImportRelation;
  presence: AssistedImportPresence;
  uncertain: boolean;
  reason: string;
  blockId: string;
  start: number;
  end: number;
  label: string;
};

export type AssistedImportValidationIssueCode =
  | "invalid_schema"
  | "unknown_id"
  | "missing_candidate_decision"
  | "duplicate_candidate_decision"
  | "nonexistent_quote"
  | "ambiguous_quote"
  | "partial_word"
  | "bad_relation"
  | "integrity_conflict";

export type AssistedImportValidationIssue = {
  code: AssistedImportValidationIssueCode;
  path: string;
  message: string;
  candidateId?: string;
  sentenceId?: string;
};

type AssistedImportSemanticEvidence = {
  entityType: "named" | "role" | "collective";
  relation: AssistedImportRelation;
  presence: AssistedImportPresence;
  uncertain: boolean;
  reason: string;
};

export type AssistedImportRawModelResult = {
  classifications: AssistedImportClassification[];
  candidateEvidence: Array<AssistedImportSemanticEvidence & {
    candidateId: string;
    disposition: AssistedImportCandidateDisposition;
  }>;
  discoveries: Array<AssistedImportSemanticEvidence & {
    blockId: string | null;
    sentenceId: string | null;
    mention: string;
    quote: string;
  }>;
  observations: Array<{ blockId: string; message: string }>;
};

export type AssistedImportModelResult = {
  classifications: AssistedImportClassification[];
  evidence: AssistedImportEntityEvidence[];
  observations: Array<{ blockId: string; message: string }>;
  candidateDecisions: AssistedImportCandidateDecision[];
  validationIssues: AssistedImportValidationIssue[];
};

export type AssistedImportCoverage = {
  sentenceId: string;
  blockId: string;
  candidateIds: string[];
  examined: true;
  truncated: boolean;
};

export type AssistedImportBatch = {
  index: number;
  sceneLabel: string | null;
  blocks: WriterImportBlock[];
  classificationIds: string[];
  sentences: AssistedImportSentence[];
  candidates: AssistedImportCandidate[];
  coverage: AssistedImportCoverage[];
  knownIdentities: string[];
  sceneContextByBlock: Record<string, { sceneId: string | null; sceneLabel: string | null }>;
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

export const WRITER_ASSISTED_IMPORT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["b", "c", "x", "o"],
  properties: {
    b: {
      type: "array",
      maxItems: 256,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "k", "u"],
        properties: {
          i: { type: "string" },
          k: { type: "string", enum: ["h", "a", "c", "d", "p", "t", "n"] },
          u: { type: "boolean" },
        },
      },
    },
    c: {
      type: "array",
      maxItems: 1_024,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "d", "e", "r", "p"],
        properties: {
          i: { type: "string" },
          d: { type: "string", enum: ["p", "m", "n", "u"] },
          e: { type: "string", enum: ["n", "r", "c"] },
          r: { type: "string", enum: ["i", "a", "m", "u"] },
          p: { type: "string", enum: ["p", "a", "u"] },
        },
      },
    },
    x: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["b", "s", "m", "q", "e", "r", "p", "u"],
        properties: {
          b: { type: ["string", "null"] },
          s: { type: ["string", "null"] },
          m: { type: "string", minLength: 1, maxLength: 64 },
          q: { type: "string", minLength: 1, maxLength: 320 },
          e: { type: "string", enum: ["n", "r", "c"] },
          r: { type: "string", enum: ["i", "a", "m", "u"] },
          p: { type: "string", enum: ["p", "a", "u"] },
          u: { type: "boolean" },
        },
      },
    },
    o: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["b", "c"],
        properties: {
          b: { type: "string" },
          c: { type: "string", enum: ["format_ambiguous", "semantic_ambiguous"] },
        },
      },
    },
  },
} as const;

const TRANSPORT_KIND = {
  h: "sceneHeading", a: "action", c: "character", d: "dialogue", p: "parenthetical", t: "transition", n: "authorNote",
} as const;
const KIND_TRANSPORT = Object.fromEntries(Object.entries(TRANSPORT_KIND).map(([code, kind]) => [kind, code])) as Record<ScreenplayKind, keyof typeof TRANSPORT_KIND>;
const TRANSPORT_DISPOSITION = { p: "participant", m: "mention", n: "nonparticipant", u: "uncertain" } as const;
const TRANSPORT_ENTITY = { n: "named", r: "role", c: "collective" } as const;
const TRANSPORT_RELATION = { i: "intervention", a: "action", m: "mention", u: "indeterminate" } as const;
const TRANSPORT_PRESENCE = { p: "present", a: "absent", u: "unknown" } as const;
const SIGNAL_TRANSPORT: Record<string, string> = {
  "nontraditional-name": "n",
  "apparent-proper-name": "p",
  "determiner-noun-phrase": "r",
  "known-identity": "k",
  "observable-agentive": "a",
};

export function assistedImportTransportInput(
  batch: AssistedImportBatch,
  stage: "terra" | "sol" = "terra",
  triggers: AssistedImportRecoveryTrigger[] = [],
  priorResult?: AssistedImportModelResult | null,
) {
  const blockIds = new Map(batch.blocks.map((block, index) => [block.id, `b${index}`]));
  const sentenceIds = new Map(batch.sentences.map((sentence, index) => [sentence.sentenceId, `s${index}`]));
  const candidateIds = new Map(batch.candidates.map((candidate, index) => [candidate.candidateId, `c${index}`]));
  const sceneLabels = [...new Set(batch.blocks.map((block) => batch.sceneContextByBlock[block.id]?.sceneLabel).filter((label): label is string => Boolean(label)))];
  const sceneIds = new Map(sceneLabels.map((label, index) => [label, `g${index}`]));
  const relevantText = batch.blocks.map((block) => block.originalText).join("\n").toLocaleUpperCase("es");
  const knownIdentities = batch.knownIdentities.filter((identity) => relevantText.includes(identity.toLocaleUpperCase("es")));
  const prior = priorResult ? priorResult.candidateDecisions.flatMap((decision) => {
    const id = candidateIds.get(decision.candidateId);
    if (!id) return [];
    return [{
      i: id,
      d: transportKey(TRANSPORT_DISPOSITION, decision.disposition),
      r: transportKey(TRANSPORT_RELATION, decision.relation),
      p: transportKey(TRANSPORT_PRESENCE, decision.presence),
    }];
  }) : [];
  return {
    v: WRITER_ASSISTED_IMPORT_VERSION,
    m: stage === "terra" ? "c" : "r",
    t: triggers.map(compactRecoveryTrigger),
    g: sceneLabels.map((label) => [sceneIds.get(label), label]),
    k: knownIdentities,
    b: batch.blocks.map((block) => [
      blockIds.get(block.id),
      block.proposedKind ? KIND_TRANSPORT[block.proposedKind] : null,
      block.confidence === "high" ? "h" : block.confidence === "medium" ? "m" : "r",
      sceneIds.get(batch.sceneContextByBlock[block.id]?.sceneLabel ?? "") ?? null,
      block.originalText,
    ]),
    s: batch.sentences.map((sentence) => [
      sentenceIds.get(sentence.sentenceId), blockIds.get(sentence.blockId), sentence.start, sentence.end,
    ]),
    c: batch.candidates.map((candidate) => [
      candidateIds.get(candidate.candidateId), sentenceIds.get(candidate.sentenceId), candidate.text,
      candidate.signals.map((signal) => SIGNAL_TRANSPORT[signal] ?? "o"),
    ]),
    q: batch.classificationIds.flatMap((id) => blockIds.get(id) ?? []),
    u: batch.coverage.filter((item) => item.candidateIds.length === 0 || item.truncated).map((item) => [
      sentenceIds.get(item.sentenceId), item.candidateIds.length === 0 ? "e" : "t",
    ]),
    p: prior,
  };
}

export function expandAssistedImportTransportResult(value: unknown, batch: AssistedImportBatch): unknown {
  if (!isRecord(value) || !Array.isArray(value.b) || !Array.isArray(value.c)
    || !Array.isArray(value.x) || !Array.isArray(value.o)) return value;
  const blockIds = new Map(batch.blocks.map((block, index) => [`b${index}`, block.id]));
  const sentenceIds = new Map(batch.sentences.map((sentence, index) => [`s${index}`, sentence.sentenceId]));
  const candidateIds = new Map(batch.candidates.map((candidate, index) => [`c${index}`, candidate.candidateId]));
  return {
    classifications: value.b.map((item) => {
      const entry = isRecord(item) ? item : {};
      const kind = TRANSPORT_KIND[String(entry.k) as keyof typeof TRANSPORT_KIND];
      const uncertain = entry.u === true;
      return {
        blockId: blockIds.get(String(entry.i)) ?? `unknown:${String(entry.i)}`,
        kind: kind ?? String(entry.k),
        uncertain,
        reason: uncertain ? "La clasificación de formato requiere revisión." : "Clasificación contextual compatible.",
      };
    }),
    candidateEvidence: value.c.map((item) => {
      const entry = isRecord(item) ? item : {};
      const disposition = TRANSPORT_DISPOSITION[String(entry.d) as keyof typeof TRANSPORT_DISPOSITION];
      const relation = TRANSPORT_RELATION[String(entry.r) as keyof typeof TRANSPORT_RELATION];
      return {
        candidateId: candidateIds.get(String(entry.i)) ?? `unknown:${String(entry.i)}`,
        disposition: disposition ?? String(entry.d),
        entityType: TRANSPORT_ENTITY[String(entry.e) as keyof typeof TRANSPORT_ENTITY] ?? String(entry.e),
        relation: relation ?? String(entry.r),
        presence: TRANSPORT_PRESENCE[String(entry.p) as keyof typeof TRANSPORT_PRESENCE] ?? String(entry.p),
        uncertain: disposition === "uncertain",
        reason: semanticReason(disposition, relation),
      };
    }),
    discoveries: value.x.map((item) => {
      const entry = isRecord(item) ? item : {};
      const relation = TRANSPORT_RELATION[String(entry.r) as keyof typeof TRANSPORT_RELATION];
      return {
        blockId: entry.b === null ? null : blockIds.get(String(entry.b)) ?? `unknown:${String(entry.b)}`,
        sentenceId: entry.s === null ? null : sentenceIds.get(String(entry.s)) ?? `unknown:${String(entry.s)}`,
        mention: entry.m,
        quote: entry.q,
        entityType: TRANSPORT_ENTITY[String(entry.e) as keyof typeof TRANSPORT_ENTITY] ?? String(entry.e),
        relation: relation ?? String(entry.r),
        presence: TRANSPORT_PRESENCE[String(entry.p) as keyof typeof TRANSPORT_PRESENCE] ?? String(entry.p),
        uncertain: entry.u === true,
        reason: semanticReason(entry.u === true ? "uncertain" : "participant", relation),
      };
    }),
    observations: value.o.map((item) => {
      const entry = isRecord(item) ? item : {};
      return {
        blockId: blockIds.get(String(entry.b)) ?? `unknown:${String(entry.b)}`,
        message: entry.c === "semantic_ambiguous"
          ? "La referencia narrativa requiere revisión."
          : "La clasificación de formato requiere revisión.",
      };
    }),
  };
}

const KIND_SET = new Set<ScreenplayKind>([
  "sceneHeading", "action", "character", "dialogue", "parenthetical", "transition", "authorNote",
]);
const PRONOUNS = new Set(["ÉL", "EL", "ELLA", "ELLOS", "ELLAS", "ALGUIEN"]);
const CANDIDATE_FUNCTION_WORDS = new Set(["UN", "UNA", "EL", "LA", "LOS", "LAS", "NO", "OTRO", "OTRA", "OTROS", "OTRAS", "DESPUÉS", "DESPUES"]);
const LEADING_DETERMINER = /^(?:UN|UNA|EL|LA|LOS|LAS|DOS|TRES|VARIOS|VARIAS|OTRO|OTRA|OTROS|OTRAS)\s+/u;
const INACTIVE_PROP_CONTEXT = /\b(?:de\s+utiler[ií]a|de\s+juguete|de\s+exhibici[oó]n|decorativ[oa]s?|maqueta|apagado|apagada|inm[oó]vil|inerte|sin\s+vida)\b/iu;
const PERSONIFIED_CONTEXT = /\b(?:dice|responde|pregunta|protesta|grita|susurra|piensa|decide|se\s+niega|amenaza)\b|[«»“”]/iu;
const EXPLICIT_INTERVENTION_CONTEXT = /\b(?:dice|responde|pregunta|protesta|grita|habla|susurra|amenaza)\b|[«»“”]/iu;
const AGENTIVE_CONTEXT = /^\s+(?:abre|avanza|ayuda|bloquea|busca|camina|cierra|corre|entra|escucha|golpea|grita|habla|lee|mira|observa|protesta|responde|saluda|señala|sigue|sonríe|toma|trabaja|ve|vuelve)\b/iu;

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
  const knownIdentities = [...new Set(staging.blocks
    .filter((block) => block.proposedKind === "character")
    .map((block) => stripWriterCharacterSuffix(block.originalText.trim()))
    .filter(Boolean))];
  const batches: AssistedImportBatch[] = [];
  let current: AssistedImportBatch | null = null;
  let currentCharacters = 0;
  let sceneLabel: string | null = null;
  let sceneId: string | null = null;
  for (const block of staging.blocks) {
    if (block.proposedKind === "sceneHeading") {
      sceneLabel = block.originalText;
      sceneId = block.id;
    }
    if (block.proposedKind === "authorNote") continue;
    const shouldAnalyze = block.proposedKind === "action"
      || block.proposedKind === "character"
      || block.confidence !== "high"
      || !block.proposedKind;
    if (!shouldAnalyze) continue;
    const size = block.originalText.length + 180;
    if (!current || current.blocks.length >= 250 || currentCharacters + size > 300_000) {
      current = {
        index: batches.length, sceneLabel, blocks: [], classificationIds: [], sentences: [], candidates: [], coverage: [],
        knownIdentities, sceneContextByBlock: {},
      };
      batches.push(current);
      currentCharacters = 0;
    }
    current.blocks.push(block);
    current.sceneContextByBlock[block.id] = { sceneId, sceneLabel };
    if (block.confidence !== "high" || !block.proposedKind) current.classificationIds.push(block.id);
    currentCharacters += size;
  }
  const anchored = batches.map(withLocalAnchors).flatMap(splitAnchoredBatch)
    .map((batch, index) => ({ ...batch, index }));
  if (anchored.length > WRITER_ASSISTED_IMPORT_MAX_CALLS - 4) {
    throw new Error("El borrador requiere más de 20 tramos y no deja capacidad para recuperación dentro de las 24 llamadas.");
  }
  return anchored;
}

export function validateAssistedImportModelResult(value: unknown, batch: AssistedImportBatch): AssistedImportModelResult {
  if (!isRecord(value) || !Array.isArray(value.classifications) || !Array.isArray(value.candidateEvidence)
    || !Array.isArray(value.discoveries) || !Array.isArray(value.observations)) {
    throw new AssistedImportValidationError("invalid_schema", "$", "La respuesta estructurada no es válida.");
  }
  const blocks = new Map(batch.blocks.map((block) => [block.id, block]));
  const sentences = new Map(batch.sentences.map((sentence) => [sentence.sentenceId, sentence]));
  const candidates = new Map(batch.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const classificationIds = new Set(batch.classificationIds);
  const issues: AssistedImportValidationIssue[] = [];
  const classifications: AssistedImportClassification[] = [];
  const usedClassificationIds = new Set<string>();
  value.classifications.forEach((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.blockId !== "string" || !classificationIds.has(candidate.blockId)
      || usedClassificationIds.has(candidate.blockId) || !KIND_SET.has(candidate.kind as ScreenplayKind)
      || typeof candidate.uncertain !== "boolean" || typeof candidate.reason !== "string") {
      issues.push(issue("unknown_id", `classifications[${index}]`, "Clasificación desconocida, duplicada o fuera del lote."));
      return;
    }
    usedClassificationIds.add(candidate.blockId);
    const block = blocks.get(candidate.blockId)!;
    let kind = candidate.kind as ScreenplayKind;
    let uncertain = candidate.uncertain;
    let reason = candidate.reason.slice(0, 180);
    if (kind === "character" && !canBeCharacterHeading(block.originalText)) {
      kind = "action";
      uncertain = true;
      reason = "La línea contiene una oración narrativa; se preservó como Acción.";
    }
    classifications.push({ blockId: candidate.blockId, kind, uncertain, reason });
  });
  for (const blockId of classificationIds) {
    if (!usedClassificationIds.has(blockId)) {
      issues.push(issue("unknown_id", "classifications", `Falta la clasificación requerida para ${blockId}.`));
    }
  }
  const usedCandidateIds = new Set<string>();
  const candidateDecisions: AssistedImportCandidateDecision[] = [];
  const evidence: AssistedImportEntityEvidence[] = [];
  value.candidateEvidence.forEach((semantic, index) => {
    const path = `candidateEvidence[${index}]`;
    if (!isRecord(semantic) || typeof semantic.candidateId !== "string" || !candidates.has(semantic.candidateId)) {
      issues.push(issue("unknown_id", path, "La decisión referencia un candidato desconocido."));
      return;
    }
    if (usedCandidateIds.has(semantic.candidateId)) {
      issues.push(issue("duplicate_candidate_decision", path, "El candidato tiene más de una decisión.", semantic.candidateId));
      return;
    }
    if (!validSemanticEvidence(semantic) || !validDisposition(semantic.disposition)) {
      issues.push(issue("bad_relation", path, "La disposición o relación del candidato no está permitida.", semantic.candidateId));
      return;
    }
    usedCandidateIds.add(semantic.candidateId);
    const anchor = candidates.get(semantic.candidateId)!;
    const decision = semantic as unknown as Omit<AssistedImportCandidateDecision, "blockId" | "start" | "end" | "label">;
    candidateDecisions.push({
      ...decision,
      reason: decision.reason.slice(0, 180),
      blockId: anchor.blockId,
      start: anchor.start,
      end: anchor.end,
      label: anchor.text,
    });
    if ((decision.disposition === "mention" && decision.relation !== "mention")
      || (decision.disposition === "participant" && decision.relation === "mention")) {
      issues.push(issue("bad_relation", path, "La relación contradice la disposición declarada.", decision.candidateId));
      return;
    }
    const block = blocks.get(anchor.blockId)!;
    if (decision.presence === "absent" && decision.disposition === "nonparticipant") {
      issues.push(issue("bad_relation", path, "Una identidad ausente sigue siendo una mención, no un rechazo.", decision.candidateId));
      return;
    }
    if (decision.relation === "intervention" && block.proposedKind !== "character"
      && !EXPLICIT_INTERVENTION_CONTEXT.test(block.originalText)) {
      issues.push(issue("bad_relation", path, "Intervención requiere habla o expresión explícita en el texto.", decision.candidateId));
      return;
    }
    if (decision.disposition === "nonparticipant" || decision.disposition === "uncertain") return;
    const accepted = acceptedEvidence(anchor.blockId, anchor.start, anchor.end, semantic, blocks);
    if (accepted.length === 0) {
      issues.push(issue("integrity_conflict", path, "La decisión no supera las reglas locales de integridad.", decision.candidateId));
      return;
    }
    evidence.push(...accepted);
  });
  for (const candidateId of candidates.keys()) {
    if (!usedCandidateIds.has(candidateId)) {
      issues.push(issue("missing_candidate_decision", "candidateEvidence", "El candidato no recibió una decisión explícita.", candidateId));
    }
  }
  value.discoveries.forEach((discovery, index) => {
    const path = `discoveries[${index}]`;
    if (!isRecord(discovery) || !validSemanticEvidence(discovery)
      || typeof discovery.mention !== "string" || discovery.mention.length > 64
      || typeof discovery.quote !== "string" || discovery.quote.length > 320
      || !(typeof discovery.blockId === "string" || discovery.blockId === null)
      || !(typeof discovery.sentenceId === "string" || discovery.sentenceId === null)
      || Boolean(discovery.blockId) === Boolean(discovery.sentenceId)) {
      issues.push(issue("bad_relation", path, "El descubrimiento no cumple el contrato semántico."));
      return;
    }
    const resolved = resolveDiscovery(discovery, blocks, sentences);
    if (!resolved.ok) {
      issues.push(issue(resolved.code, path, resolved.message, undefined,
        typeof discovery.sentenceId === "string" ? discovery.sentenceId : undefined));
      return;
    }
    const accepted = acceptedEvidence(resolved.blockId, resolved.start, resolved.end, discovery, blocks);
    if (accepted.length === 0) {
      issues.push(issue("integrity_conflict", path, "El descubrimiento no supera las reglas locales de integridad."));
      return;
    }
    evidence.push(...accepted);
  });
  const observations = value.observations.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.blockId !== "string" || !blocks.has(candidate.blockId)
      || typeof candidate.message !== "string" || !candidate.message.trim()) {
      issues.push(issue("unknown_id", "observations", "La observación referencia un bloque desconocido."));
      return [];
    }
    if (!classificationIds.has(candidate.blockId)) return [];
    return [{ blockId: candidate.blockId, message: candidate.message.trim().slice(0, 180) }];
  });
  return { classifications, evidence: dedupeResolvedEvidence(evidence), observations, candidateDecisions, validationIssues: issues };
}

export class AssistedImportValidationError extends Error {
  code: AssistedImportValidationIssueCode;
  path: string;

  constructor(code: AssistedImportValidationIssueCode, path: string, message: string) {
    super(message);
    this.code = code;
    this.path = path;
  }
}

export type AssistedImportRecoveryTrigger = "unresolved" | "uncovered" | "contradictory_negative" | "control_sample" | "terra_invalid";

export type AssistedImportRecoveryPlanItem = {
  batch: AssistedImportBatch;
  triggers: AssistedImportRecoveryTrigger[];
  candidateIds: string[];
  sentenceIds: string[];
};

export type AssistedImportRecoveryPlan = {
  items: AssistedImportRecoveryPlanItem[];
  skippedBatchIndexes: number[];
  partial: boolean;
};

export function planAssistedImportRecovery(
  batches: readonly AssistedImportBatch[],
  terraResults: ReadonlyMap<number, AssistedImportModelResult | null>,
  options: { controlSample?: boolean } = {},
): AssistedImportRecoveryPlan {
  const proposals: AssistedImportRecoveryPlanItem[] = [];
  let controlUsed = false;
  for (const batch of batches) {
    const result = terraResults.get(batch.index);
    const candidateIds = new Set<string>();
    const sentenceIds = new Set<string>();
    const triggers = new Set<AssistedImportRecoveryTrigger>();
    if (batch.candidates.length === 0) {
      for (const coverage of batch.coverage) sentenceIds.add(coverage.sentenceId);
      if (sentenceIds.size) triggers.add("uncovered");
    } else if (!result) {
      batch.candidates.forEach((candidate) => candidateIds.add(candidate.candidateId));
      batch.coverage.forEach((coverage) => sentenceIds.add(coverage.sentenceId));
      triggers.add("terra_invalid");
    } else {
      for (const issueItem of result.validationIssues) {
        if (issueItem.candidateId) candidateIds.add(issueItem.candidateId);
        if (issueItem.sentenceId) sentenceIds.add(issueItem.sentenceId);
        if (issueItem.code === "missing_candidate_decision" || issueItem.code === "bad_relation"
          || issueItem.code === "integrity_conflict" || issueItem.code === "partial_word") triggers.add("unresolved");
      }
      for (const decision of result.candidateDecisions) {
        if (decision.disposition === "uncertain") {
          candidateIds.add(decision.candidateId);
          triggers.add("unresolved");
        }
        if (decision.disposition === "nonparticipant") {
          const candidate = batch.candidates.find((item) => item.candidateId === decision.candidateId);
          if (candidate?.signals.includes("observable-agentive")) {
            candidateIds.add(decision.candidateId);
            sentenceIds.add(candidate.sentenceId);
            triggers.add("contradictory_negative");
          }
        }
      }
      for (const coverage of batch.coverage) {
        if (coverage.candidateIds.length === 0 || coverage.truncated) {
          sentenceIds.add(coverage.sentenceId);
          triggers.add("uncovered");
        }
      }
      if (options.controlSample && !controlUsed && triggers.size === 0) {
        const control = result.candidateDecisions
          .filter((decision) => decision.disposition === "nonparticipant")
          .sort((left, right) => left.candidateId.localeCompare(right.candidateId))[0];
        if (control) {
          candidateIds.add(control.candidateId);
          sentenceIds.add(batch.candidates.find((item) => item.candidateId === control.candidateId)!.sentenceId);
          triggers.add("control_sample");
          controlUsed = true;
        }
      }
    }
    if (triggers.size) proposals.push({
      batch,
      triggers: [...triggers],
      candidateIds: [...candidateIds],
      sentenceIds: [...sentenceIds],
    });
  }
  proposals.sort((left, right) => recoveryPriority(left) - recoveryPriority(right) || left.batch.index - right.batch.index);
  const items = proposals.slice(0, 4);
  return {
    items,
    skippedBatchIndexes: proposals.slice(4).map((item) => item.batch.index),
    partial: proposals.length > items.length,
  };
}

export function recoveryBatch(item: AssistedImportRecoveryPlanItem): AssistedImportBatch {
  const candidateIds = new Set(item.candidateIds);
  const sentenceIds = new Set(item.sentenceIds);
  const candidates = item.batch.candidates.filter((candidate) => candidateIds.has(candidate.candidateId));
  for (const candidate of candidates) sentenceIds.add(candidate.sentenceId);
  const sentences = item.batch.sentences.filter((sentence) => sentenceIds.has(sentence.sentenceId));
  const blockIds = new Set([...sentences.map((sentence) => sentence.blockId), ...candidates.map((candidate) => candidate.blockId)]);
  return {
    ...item.batch,
    blocks: item.batch.blocks.filter((block) => blockIds.has(block.id)),
    classificationIds: item.triggers.includes("terra_invalid") || item.batch.candidates.length === 0
      ? item.batch.classificationIds
      : [],
    sentences,
    candidates,
    coverage: item.batch.coverage.filter((coverage) => sentenceIds.has(coverage.sentenceId)),
  };
}

function recoveryPriority(item: AssistedImportRecoveryPlanItem) {
  if (item.triggers.includes("terra_invalid")) return 0;
  if (item.triggers.includes("unresolved")) return 1;
  if (item.triggers.includes("uncovered")) return 2;
  if (item.triggers.includes("contradictory_negative")) return 3;
  return 4;
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
    if (!block.model?.uncertain && (block.confidence === "high"
      || (block.proposedKind && block.proposedKind === block.resolvedKind))) continue;
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
  const rejectedRanges = modelResults.flatMap((result) => (result.candidateDecisions ?? [])
    .filter((decision) => decision.disposition === "nonparticipant")
    .flatMap((decision) => {
      const canonical = canonicalBySource.get(decision.blockId);
      return canonical ? [{ blockId: canonical.attrs.id, start: decision.start, end: decision.end }] : [];
    }));
  const explicitByScene = new Map<string, Set<string>>();
  for (const characterBlock of document.content.filter((block) => block.attrs.kind === "character")) {
    const identity = blockText(characterBlock).trim();
    if (!identity) continue;
    const sceneId = sceneByBlock.get(characterBlock.attrs.id) ?? null;
    const sceneKey = sceneId ?? "PREAMBLE";
    const catalog = explicitByScene.get(sceneKey) ?? new Set<string>();
    catalog.add(writerParticipantRoleKey(identity));
    explicitByScene.set(sceneKey, catalog);
    evidence.push(importedEvidence({
      identityKey: writerCharacterIdentityKey(identity), identity, block: characterBlock, sceneId,
      start: 0, end: identity.length, relation: "intervention", presence: "unknown", source: "explicit",
      confidence: "high", reason: "Encabezado explícito de diálogo; no acredita presencia física por sí solo.",
    }));
  }
  for (const item of deterministic) {
    if (rejectedRanges.some((range) => range.blockId === item.blockId && item.start < range.end && item.end > range.start)) continue;
    const identityKey = reconcileRuleIdentityKey(item.identityKey, item.identity, item.sceneId, explicitByScene);
    evidence.push(importedEvidence({
      identityKey, identity: item.identity,
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
      const initialKey = identityKey(item, sceneId);
      const overlapping = evidence.find((candidate) => candidate.blockId === block.attrs.id
        && candidate.start === item.start && candidate.end === item.end);
      const key = overlapping?.identityKey
        ?? reconcileRuleIdentityKey(initialKey, item.label, sceneId, explicitByScene);
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

function withLocalAnchors(batch: AssistedImportBatch): AssistedImportBatch {
  const sentences = batch.blocks.flatMap((block) => segmentBlock(block));
  const sentenceByBlock = new Map<string, AssistedImportSentence[]>();
  for (const sentence of sentences) {
    const items = sentenceByBlock.get(sentence.blockId) ?? [];
    items.push(sentence);
    sentenceByBlock.set(sentence.blockId, items);
  }
  const candidates: AssistedImportCandidate[] = [];
  const coverage: AssistedImportCoverage[] = [];
  for (const block of batch.blocks) {
    const scene = batch.sceneContextByBlock[block.id] ?? { sceneId: null, sceneLabel: null };
    if (block.proposedKind === "character") continue;
    const spans = new Map<string, { start: number; end: number; signals: Set<string> }>();
    const add = (start: number, end: number, signal: string) => {
      const text = block.originalText.slice(start, end);
      if (!text.trim() || cutsWordBoundary(block.originalText, start, end)) return;
      const key = `${start}:${end}`;
      const current = spans.get(key) ?? { start, end, signals: new Set<string>() };
      current.signals.add(signal);
      spans.set(key, current);
    };
    const properName = /(?:[A-ZÁÉÍÓÚÜÑ0-9]+(?:-[A-ZÁÉÍÓÚÜÑ0-9]+)+|\p{Lu}[\p{L}\p{M}'’-]*)(?:\s+(?:[A-ZÁÉÍÓÚÜÑ0-9]+(?:-[A-ZÁÉÍÓÚÜÑ0-9]+)+|\p{Lu}[\p{L}\p{M}'’-]*)){0,2}/gu;
    for (const match of block.originalText.matchAll(properName)) {
      const start = match.index ?? 0;
      if (CANDIDATE_FUNCTION_WORDS.has(normalizeWriterCharacterIdentity(match[0]))) continue;
      add(start, start + match[0].length, /\d/u.test(match[0]) ? "nontraditional-name" : "apparent-proper-name");
    }
    const rolePhrase = /\b(?:un|una|el|la|los|las|dos|tres|varios|varias|otro|otra|otros|otras)\s+[\p{L}\p{M}'’-]+(?:\s+[\p{L}\p{M}'’-]+)?\b/giu;
    for (const match of block.originalText.matchAll(rolePhrase)) {
      const start = match.index ?? 0;
      const words = match[0].split(/\s+/u);
      add(start, start + words.slice(0, 2).join(" ").length, "determiner-noun-phrase");
    }
    for (const identity of batch.knownIdentities) {
      const matcher = new RegExp(escapeRegExp(identity), "giu");
      for (const match of block.originalText.matchAll(matcher)) {
        const start = match.index ?? 0;
        add(start, start + match[0].length, "known-identity");
      }
    }
    for (const sentence of sentenceByBlock.get(block.id) ?? []) {
      const sentenceSpans = [...spans.values()]
        .filter((span) => span.start >= sentence.start && span.end <= sentence.end)
        .sort((a, b) => a.start - b.start || a.end - b.end);
      const truncated = sentenceSpans.length > 12;
      const selected = sentenceSpans.slice(0, 12);
      const candidateIds: string[] = [];
      for (const span of selected) {
        const text = block.originalText.slice(span.start, span.end);
        const signals = [...span.signals];
        if (PERSONIFIED_CONTEXT.test(sentence.text)) signals.push("observable-agentive");
        const candidateId = `candidate:${block.id}:${span.start}:${span.end}`;
        candidateIds.push(candidateId);
        candidates.push({
          candidateId,
          blockId: block.id,
          sentenceId: sentence.sentenceId,
          start: span.start,
          end: span.end,
          text,
          sceneId: scene.sceneId,
          sceneLabel: scene.sceneLabel,
          signals: [...new Set(signals)],
          sourceHash: writerObservationTextHash([block.id, sentence.sentenceId, span.start, span.end, text].join("\u0000")),
        });
      }
      if (block.proposedKind === "action" || !block.proposedKind) {
        coverage.push({ sentenceId: sentence.sentenceId, blockId: block.id, candidateIds, examined: true, truncated });
      }
    }
  }
  return { ...batch, sentences, candidates, coverage };
}

function splitAnchoredBatch(batch: AssistedImportBatch): AssistedImportBatch[] {
  const groups: WriterImportBlock[][] = [];
  let current: WriterImportBlock[] = [];
  let candidateCount = 0;
  for (const block of batch.blocks) {
    const blockCandidates = batch.candidates.filter((candidate) => candidate.blockId === block.id).length;
    if (current.length && candidateCount + blockCandidates > 240) {
      groups.push(current);
      current = [];
      candidateCount = 0;
    }
    current.push(block);
    candidateCount += blockCandidates;
  }
  if (current.length) groups.push(current);
  if (groups.length <= 1 && batch.candidates.length <= 240) return [batch];
  return groups.flatMap((blocks) => splitAnchoredBlockGroup(batch, blocks));
}

function splitAnchoredBlockGroup(batch: AssistedImportBatch, blocks: WriterImportBlock[]): AssistedImportBatch[] {
  if (blocks.length === 1) {
    const block = blocks[0];
    const sentences = batch.sentences.filter((sentence) => sentence.blockId === block.id);
    const chunks: AssistedImportSentence[][] = [];
    let current: AssistedImportSentence[] = [];
    let candidateCount = 0;
    for (const sentence of sentences) {
      const sentenceCandidates = batch.candidates.filter((candidate) => candidate.sentenceId === sentence.sentenceId).length;
      if (current.length && candidateCount + sentenceCandidates > 240) {
        chunks.push(current);
        current = [];
        candidateCount = 0;
      }
      current.push(sentence);
      candidateCount += sentenceCandidates;
    }
    if (current.length) chunks.push(current);
    if (chunks.length > 1) return chunks.map((chunk, index) => {
      const sentenceIds = new Set(chunk.map((sentence) => sentence.sentenceId));
      return anchoredSubset(batch, blocks, chunk, sentenceIds, index === 0);
    });
  }
  const sentences = batch.sentences.filter((sentence) => blocks.some((block) => block.id === sentence.blockId));
  const sentenceIds = new Set(sentences.map((sentence) => sentence.sentenceId));
  return [anchoredSubset(batch, blocks, sentences, sentenceIds, true)];
}

function anchoredSubset(
  batch: AssistedImportBatch,
  blocks: WriterImportBlock[],
  sentences: AssistedImportSentence[],
  sentenceIds: ReadonlySet<string>,
  includeClassifications: boolean,
) {
    const blockIds = new Set(blocks.map((block) => block.id));
    return {
      ...batch,
      sceneLabel: batch.sceneContextByBlock[blocks[0].id]?.sceneLabel ?? batch.sceneLabel,
      blocks,
      classificationIds: includeClassifications ? batch.classificationIds.filter((id) => blockIds.has(id)) : [],
      sentences,
      candidates: batch.candidates.filter((candidate) => sentenceIds.has(candidate.sentenceId)),
      coverage: batch.coverage.filter((coverage) => sentenceIds.has(coverage.sentenceId)),
      sceneContextByBlock: Object.fromEntries(blocks.map((block) => [block.id, batch.sceneContextByBlock[block.id]])),
    };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function segmentBlock(block: WriterImportBlock): AssistedImportSentence[] {
  const text = block.originalText;
  const result: AssistedImportSentence[] = [];
  let start = 0;
  const boundary = /[.!?…]+[»”"')\]]*(?=\s|$)/gu;
  for (const match of text.matchAll(boundary)) {
    const rawEnd = (match.index ?? 0) + match[0].length;
    pushSentence(start, rawEnd);
    start = rawEnd;
  }
  pushSentence(start, text.length);
  if (result.length === 0 && text.trim()) pushSentence(0, text.length);
  return result;

  function pushSentence(rawStart: number, rawEnd: number) {
    let sentenceStart = rawStart;
    let sentenceEnd = rawEnd;
    while (sentenceStart < sentenceEnd && /\s/u.test(text[sentenceStart])) sentenceStart += 1;
    while (sentenceEnd > sentenceStart && /\s/u.test(text[sentenceEnd - 1])) sentenceEnd -= 1;
    if (sentenceStart >= sentenceEnd) return;
    result.push({
      sentenceId: `sentence:${block.id}:${sentenceStart}:${sentenceEnd}`,
      blockId: block.id,
      start: sentenceStart,
      end: sentenceEnd,
      text: text.slice(sentenceStart, sentenceEnd),
    });
  }
}

function validSemanticEvidence(value: Record<string, unknown>) {
  return ["named", "role", "collective"].includes(String(value.entityType))
    && ["intervention", "action", "mention", "indeterminate"].includes(String(value.relation))
    && ["present", "absent", "unknown"].includes(String(value.presence))
    && typeof value.uncertain === "boolean"
    && typeof value.reason === "string";
}

function validDisposition(value: unknown): value is AssistedImportCandidateDisposition {
  return value === "participant" || value === "mention" || value === "nonparticipant" || value === "uncertain";
}

function issue(
  code: AssistedImportValidationIssueCode,
  path: string,
  message: string,
  candidateId?: string,
  sentenceId?: string,
): AssistedImportValidationIssue {
  return { code, path, message, ...(candidateId ? { candidateId } : {}), ...(sentenceId ? { sentenceId } : {}) };
}

function acceptedEvidence(
  blockId: string,
  start: number,
  end: number,
  semantic: Record<string, unknown>,
  blocks: ReadonlyMap<string, WriterImportBlock>,
): AssistedImportEntityEvidence[] {
  const block = blocks.get(blockId);
  if (!block || start < 0 || end <= start || end > block.originalText.length || cutsWordBoundary(block.originalText, start, end)) return [];
  if (block.proposedKind === "authorNote" || block.proposedKind === "character") return [];
  const surface = block.originalText.slice(start, end);
  if (!surface.trim() || surface !== surface.trim()) return [];
  const label = surface.replace(/\s+/gu, " ");
  const normalized = normalizeWriterCharacterIdentity(label);
  const entityType = semantic.entityType as AssistedImportEntityEvidence["entityType"];
  const relation = semantic.relation as AssistedImportRelation;
  if (label.length > 64 || PRONOUNS.has(normalized) || !supportsNarrativeParticipant({
    label,
    blockText: block.originalText,
    rangeEnd: end,
    entityType,
    relation,
  })) return [];
  return [{
    blockId,
    start,
    end,
    label,
    entityType,
    relation,
    presence: semantic.presence as AssistedImportPresence,
    uncertain: semantic.uncertain as boolean,
    reason: (semantic.reason as string).slice(0, 180),
  }];
}

function resolveDiscovery(
  discovery: Record<string, unknown>,
  blocks: ReadonlyMap<string, WriterImportBlock>,
  sentences: ReadonlyMap<string, AssistedImportSentence>,
) {
  const sentence = typeof discovery.sentenceId === "string" ? sentences.get(discovery.sentenceId) : undefined;
  const blockId = sentence?.blockId ?? (discovery.blockId as string);
  const block = blocks.get(blockId);
  if (!block || (typeof discovery.sentenceId === "string" && !sentence) || (sentence && discovery.blockId !== null)) {
    return { ok: false as const, code: "unknown_id" as const, message: "La cita referencia un bloque o frase desconocidos." };
  }
  const scopeText = sentence?.text ?? block.originalText;
  const scopeStart = sentence?.start ?? 0;
  const quote = discovery.quote as string;
  const mention = discovery.mention as string;
  if (!quote || !mention || quote !== quote.trim() || mention !== mention.trim()) {
    return { ok: false as const, code: "nonexistent_quote" as const, message: "La cita o mención no es literal." };
  }
  const quoteMatches = exactOccurrences(scopeText, quote);
  if (quoteMatches.length === 0) return { ok: false as const, code: "nonexistent_quote" as const, message: "La cita no existe literalmente en el origen." };
  if (quoteMatches.length > 1) return { ok: false as const, code: "ambiguous_quote" as const, message: "La cita aparece más de una vez en el ámbito indicado." };
  const mentionMatches = exactOccurrences(quote, mention);
  if (mentionMatches.length === 0) return { ok: false as const, code: "nonexistent_quote" as const, message: "La mención no existe dentro de la cita." };
  if (mentionMatches.length > 1) return { ok: false as const, code: "ambiguous_quote" as const, message: "La mención aparece más de una vez dentro de la cita." };
  const start = scopeStart + quoteMatches[0] + mentionMatches[0];
  const end = start + mention.length;
  if (block.originalText.slice(start, end) !== mention) {
    return { ok: false as const, code: "nonexistent_quote" as const, message: "La mención no coincide con el texto original." };
  }
  if (cutsWordBoundary(block.originalText, start, end)) {
    return { ok: false as const, code: "partial_word" as const, message: "La mención corta una palabra del origen." };
  }
  return { ok: true as const, blockId, start, end };
}

function exactOccurrences(text: string, literal: string) {
  const result: number[] = [];
  if (!literal) return result;
  let cursor = 0;
  while (cursor <= text.length - literal.length) {
    const index = text.indexOf(literal, cursor);
    if (index < 0) break;
    result.push(index);
    cursor = index + Math.max(1, literal.length);
  }
  return result;
}

function dedupeResolvedEvidence(items: AssistedImportEntityEvidence[]) {
  const unique = new Map<string, AssistedImportEntityEvidence>();
  for (const item of items) {
    const key = [item.blockId, item.start, item.end, item.entityType, item.relation].join("|");
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
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
  const identity = stripWriterCharacterSuffix(trimmed);
  if (!identity || [...trimmed].length > 64 || /[.!?…]/u.test(identity)) return false;
  const words = identity.split(/\s+/u);
  return words.length <= 6 && !/\p{Ll}{3,}\s+\p{Ll}{3,}/u.test(identity);
}

function supportsNarrativeParticipant(input: {
  label: string;
  blockText: string;
  rangeEnd: number;
  entityType: AssistedImportEntityEvidence["entityType"];
  relation: AssistedImportRelation;
}) {
  const normalized = normalizeWriterCharacterIdentity(input.label);
  const after = input.blockText.slice(input.rangeEnd, Math.min(input.blockText.length, input.rangeEnd + 100));
  const neighborhood = input.blockText.slice(Math.max(0, input.rangeEnd - input.label.length - 8), input.rangeEnd + 100);
  if (INACTIVE_PROP_CONTEXT.test(neighborhood)) return false;
  if (PERSONIFIED_CONTEXT.test(neighborhood)) return true;
  if (input.entityType === "named") {
    if (LEADING_DETERMINER.test(normalized)) return false;
    const firstLetter = input.label.match(/\p{L}/u)?.[0] ?? "";
    return Boolean(firstLetter) && firstLetter === firstLetter.toLocaleUpperCase("es-MX");
  }
  if (isWriterParticipantRole(input.label)) return true;
  if (input.relation === "mention") return false;
  return AGENTIVE_CONTEXT.test(after);
}

function cutsWordBoundary(text: string, start: number, end: number) {
  const word = /[\p{L}\p{M}\p{N}'’_-]/u;
  const beginsInside = start > 0 && word.test(text.slice(start - 1, start)) && word.test(text.slice(start, start + 1));
  const endsInside = end < text.length && word.test(text.slice(end - 1, end)) && word.test(text.slice(end, end + 1));
  return beginsInside || endsInside;
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
  const complete = normalizeWriterCharacterIdentity(item.label);
  const normalized = writerParticipantRoleKey(item.label);
  const scoped = /^(?:OTRO|OTRA|OTROS|OTRAS|DOS|TRES|VARIOS|VARIAS)\s+/u.test(complete) ? complete : normalized;
  return item.entityType === "named" ? writerCharacterIdentityKey(item.label) : `${item.entityType.toLocaleUpperCase("en-US")}:${sceneId ?? "PREAMBLE"}:${scoped}`;
}

function reconcileRuleIdentityKey(
  key: string,
  identity: string,
  sceneId: string | null,
  explicitByScene: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const normalized = writerParticipantRoleKey(identity);
  const sceneIdentities = explicitByScene.get(sceneId ?? "PREAMBLE");
  if (!/^(?:OTRO|OTRA|OTROS|OTRAS|DOS|TRES|VARIOS|VARIAS)\s+/u.test(normalizeWriterCharacterIdentity(identity))
    && sceneIdentities?.has(normalized)) return normalized;
  return key;
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
    if (!current
      || (current.presence === "unknown" && item.presence === "absent")
      || sourcePriority(item.source) > sourcePriority(current.source)) unique.set(key, item);
  }
  return [...unique.values()];
}

function sourcePriority(source: AssistedImportSource) {
  return source === "user" ? 5 : source === "explicit" ? 4 : source === "rule" ? 3 : 2;
}

function transportKey(values: Record<string, string>, value: string) {
  return Object.entries(values).find(([, expanded]) => expanded === value)?.[0] ?? "u";
}

function compactRecoveryTrigger(trigger: AssistedImportRecoveryTrigger) {
  return trigger === "unresolved" ? "u"
    : trigger === "uncovered" ? "c"
      : trigger === "contradictory_negative" ? "n"
        : trigger === "control_sample" ? "q"
          : "i";
}

function semanticReason(disposition: unknown, relation: unknown) {
  if (disposition === "nonparticipant") return "El contexto no la presenta como participante narrativo.";
  if (disposition === "uncertain" || relation === "indeterminate") return "La referencia narrativa requiere revisión.";
  if (relation === "mention") return "Referencia narrativa sin intervención física acreditada.";
  if (relation === "intervention") return "Intervención explícita; la presencia física no se presume.";
  return "Participa en la acción descrita.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
