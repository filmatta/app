import assert from "node:assert/strict";
import test from "node:test";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import {
  WRITER_CHARACTER_RULE_VERSION,
  writerObservationTextHash,
  type WriterCharacterObservation,
  type WriterKnownCharacterIdentity,
} from "../../lib/writer/character-observations.ts";
import {
  groupWriterFormatObservations,
  parsePersistedWriterImportAnalysis,
  writerFormatObservationState,
  writerObservationExcerpt,
} from "../../lib/writer/import-analysis.ts";
import {
  parseWriterImportReviewState,
  writerImportReviewStorageKey,
} from "../../lib/writer/import-review-storage.ts";
import { deriveAcceptedCharacterActivity } from "../../lib/writer/writing-ux.ts";

test("recognized characters use accepted identities including action-only participants and exclude mentions or rejected candidates", () => {
  const explicit = createBlock("character", "ANA");
  const girl = createBlock("action", "Una niña entra al bosque.");
  const concept = createBlock("action", "La esperanza desaparece.");
  const mention = createBlock("action", "El mural recuerda a MARTA.");
  const document: WriterDocument = { type: "doc", content: [explicit, girl, concept, mention] };
  const parsed = parsePersistedWriterImportAnalysis({
    analysis: {
      identities: [
        { key: "ANA", name: "ANA", source: "explicit", accepted: true },
        { key: "ROLE:SCENE:NIÑA", name: "niña", source: "rule", accepted: true },
        { key: "ESPERANZA", name: "esperanza", source: "ai", accepted: false },
        { key: "LEGACY_ESPERANZA", name: "esperanza antigua", source: "ai" },
        { key: "MARTA", name: "MARTA", source: "ai", accepted: true },
        { key: "DESCARTADA", name: "DESCARTADA", source: "ai", accepted: false },
      ],
      evidence: [
        persistedEvidence(explicit.attrs.id, "ANA", "ANA", "ANA", "high", 0, 3, "intervention", "unknown", "explicit"),
        persistedEvidence(girl.attrs.id, "Una niña entra al bosque.", "ROLE:SCENE:NIÑA", "niña", "medium", 4, 8, "action", "present", "rule"),
        persistedEvidence(concept.attrs.id, "La esperanza desaparece.", "ESPERANZA", "esperanza", "medium", 3, 12),
        persistedEvidence(concept.attrs.id, "La esperanza desaparece.", "LEGACY_ESPERANZA", "esperanza antigua", "medium", 3, 12),
        persistedEvidence(mention.attrs.id, "El mural recuerda a MARTA.", "MARTA", "MARTA", "medium", 20, 25, "mention", "unknown"),
      ],
      observations: [],
    },
    decisions: [],
    compatibleRevision: true,
  }, document);

  assert.ok(parsed);
  assert.deepEqual(parsed.identities.map((identity) => identity.name).sort(), ["ANA", "niña"]);
  assert.equal(parsed.identities.some((identity) => identity.name === "esperanza"), false);
  assert.equal(parsed.identities.some((identity) => identity.name === "esperanza antigua"), false);
  assert.equal(parsed.identities.some((identity) => identity.name === "MARTA"), false);
  assert.equal(parsed.identities.some((identity) => identity.name === "DESCARTADA"), false);
});

test("format review state keeps only bounded, unique observation ids per document key", () => {
  const parsed = parseWriterImportReviewState({ version: 1, reviewedFormatIds: ["format:a", "format:a", " ", 42] });
  assert.deepEqual(parsed.reviewedFormatIds, ["format:a"]);
  assert.match(writerImportReviewStorageKey("https://staging.filmatta.com", "user", "script"), /user:script$/u);
});

test("format observations aggregate by category and retain a single review detail source", () => {
  const observations = [
    formatObservation("d-1", "dialogue", "Todo bien.", "Clasificación contextual compatible."),
    formatObservation("d-2", "dialogue", "No lo sé.", "La clasificación requiere revisión."),
    formatObservation("a-1", "action", "Carolina entra.", "Clasificación contextual compatible."),
  ];
  const groups = groupWriterFormatObservations(observations, new Set(["d-1"]));
  const dialogue = groups.find((group) => group.kind === "dialogue");

  assert.equal(groups.length, 2);
  assert.equal(dialogue?.observations.length, 2);
  assert.equal(dialogue?.doubtCount, 1);
  assert.equal(dialogue?.reviewedCount, 1);
  assert.equal(writerFormatObservationState(observations[0]), "classification");
  assert.equal(writerFormatObservationState(observations[1]), "question");
  assert.equal(writerObservationExcerpt("  uno   dos tres  "), "uno dos tres");
  assert.equal(writerObservationExcerpt("123456789", 6), "12345…");
});

test("sidebar activity uses accepted identities, counts distinct evidence, and sorts deterministically", () => {
  const anaBlock = createBlock("character", "ANA");
  const dialogue = createBlock("dialogue", "Hola.");
  const robotAction = createBlock("action", "ROBOT avanza.");
  const document: WriterDocument = { type: "doc", content: [anaBlock, dialogue, robotAction] };
  const identities: WriterKnownCharacterIdentity[] = [
    { key: "ANA", name: "ANA", source: "characterBlock" },
    { key: "ROBOT", name: "ROBOT", source: "imported" },
  ];
  const observations: WriterCharacterObservation[] = [
    observation("r-1", robotAction.attrs.id, "ROBOT", "ROBOT avanza."),
    observation("r-2", robotAction.attrs.id, "ROBOT", "ROBOT avanza."),
  ];
  const activity = deriveAcceptedCharacterActivity(document, identities, observations);

  assert.deepEqual(activity.map((item) => [item.name, item.evidenceCount]), [["ROBOT", 2], ["ANA", 1]]);
  assert.equal(activity[0].firstBlockId, robotAction.attrs.id);
});

function persistedEvidence(
  blockId: string,
  text: string,
  identityKey: string,
  identity: string,
  confidence: "high" | "medium" | "review",
  start = 0,
  end = 2,
  relation: "action" | "intervention" | "mention" = "action",
  presence: "present" | "unknown" = "present",
  source: "ai" | "rule" | "explicit" = "ai",
) {
  return {
    fingerprint: `${identityKey.toLocaleLowerCase("es-MX")}-1`,
    identityKey,
    identity,
    blockId,
    sceneId: null,
    start,
    end,
    relation,
    presence,
    source,
    confidence,
    reason: "Evidencia sintética.",
    blockHash: writerObservationTextHash(text),
  };
}

function formatObservation(id: string, kind: "dialogue" | "action", excerpt: string, message: string) {
  return { id, blockId: id, sceneId: null, kind, message, source: "ai" as const, blockHash: id, excerpt };
}

function observation(id: string, blockId: string, identity: string, excerpt: string): WriterCharacterObservation {
  return {
    id,
    identityKey: identity,
    identity,
    blockId,
    sceneId: null,
    start: 0,
    end: identity.length,
    excerpt,
    evidence: "actionReference",
    signals: ["Sintética"],
    ruleVersion: WRITER_CHARACTER_RULE_VERSION,
    confidence: "medium",
    known: true,
    blockHash: writerObservationTextHash(excerpt),
    fingerprint: id,
  };
}
