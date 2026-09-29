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
import { deriveAcceptedCharacterActivity } from "../../lib/writer/writing-ux.ts";

test("recognized characters exclude persisted rule/AI candidates until explicitly accepted", () => {
  const review = createBlock("action", "No entra.");
  const accepted = createBlock("action", "Un robot observa la puerta.");
  const document: WriterDocument = { type: "doc", content: [review, accepted] };
  const parsed = parsePersistedWriterImportAnalysis({
    analysis: {
      identities: [
        { key: "NO", name: "NO", source: "ai" },
        { key: "ROBOT", name: "ROBOT", source: "ai" },
        { key: "AMBOS", name: "AMBOS", source: "rule" },
      ],
      evidence: [
        persistedEvidence(review.attrs.id, "No entra.", "NO", "NO", "medium"),
        persistedEvidence(accepted.attrs.id, "Un robot observa la puerta.", "ROBOT", "robot", "medium", 3, 8),
      ],
      observations: [],
    },
    decisions: [{
      fingerprint: "human-1",
      block_id: review.attrs.id,
      decision: "confirmed",
      identity_key: "ROBOT",
      identity_name: "ROBOT",
      decided_at: "2026-09-29T00:00:00Z",
    }],
    compatibleRevision: true,
  }, document);

  assert.ok(parsed);
  assert.deepEqual(parsed.identities.map((identity) => identity.name).sort(), ["ROBOT"]);
  assert.equal(parsed.identities.some((identity) => identity.name === "NO"), false);
  assert.equal(parsed.identities.some((identity) => identity.name === "AMBOS"), false);
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
  confidence: "medium" | "review",
  start = 0,
  end = 2,
) {
  return {
    fingerprint: `${identityKey.toLocaleLowerCase("es-MX")}-1`,
    identityKey,
    identity,
    blockId,
    sceneId: null,
    start,
    end,
    relation: "action",
    presence: "present",
    source: "ai",
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
