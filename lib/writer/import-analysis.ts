import { blockText, SCREENPLAY_KINDS, type ScreenplayKind, type WriterDocument } from "./document.ts";
import {
  WRITER_CHARACTER_RULE_VERSION,
  writerObservationTextHash,
  type WriterCharacterObservation,
  type WriterKnownCharacterIdentity,
} from "./character-observations.ts";

export type WriterFormatObservation = {
  id: string;
  blockId: string;
  sceneId: string | null;
  kind: ScreenplayKind;
  message: string;
  source: "rule" | "ai";
  blockHash: string;
};

export type PersistedWriterImportAnalysis = {
  identities: WriterKnownCharacterIdentity[];
  observations: WriterCharacterObservation[];
  formatObservations: WriterFormatObservation[];
  decisions: Array<{
    fingerprint: string;
    blockId: string;
    state: "confirmed" | "linked" | "ignored";
    identityKey?: string;
    identityName?: string;
    decidedAt: number;
  }>;
  persistent: true;
  compatibleRevision: boolean;
};

export function parsePersistedWriterImportAnalysis(value: unknown, document: WriterDocument): PersistedWriterImportAnalysis | null {
  if (!isRecord(value) || !isRecord(value.analysis) || !Array.isArray(value.analysis.identities)
    || !Array.isArray(value.analysis.evidence) || !Array.isArray(value.analysis.observations)
    || !Array.isArray(value.decisions)) return null;
  const blocks = new Map(document.content.map((block) => [block.attrs.id, block]));
  const parsedIdentities = value.analysis.identities.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.key !== "string" || typeof candidate.name !== "string") return [];
    const key = candidate.key.trim().slice(0, 128);
    const name = candidate.name.trim().replace(/\s+/gu, " ").slice(0, 64);
    return key && name ? [{ key, name, source: "imported" as const }] : [];
  });
  const observations = value.analysis.evidence.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.fingerprint !== "string" || typeof candidate.identityKey !== "string"
      || typeof candidate.identity !== "string" || typeof candidate.blockId !== "string"
      || typeof candidate.start !== "number" || typeof candidate.end !== "number"
      || typeof candidate.blockHash !== "string" || typeof candidate.reason !== "string") return [];
    const block = blocks.get(candidate.blockId);
    if (!block) return [];
    const excerpt = blockText(block);
    if (writerObservationTextHash(excerpt) !== candidate.blockHash || candidate.start < 0 || candidate.end > excerpt.length || candidate.end <= candidate.start) return [];
    const relation = candidate.relation === "action" ? "actionReference" : candidate.relation;
    if (!["intervention", "actionReference", "mention", "indeterminate"].includes(String(relation))) return [];
    const confidence = ["high", "medium", "review"].includes(String(candidate.confidence))
      ? candidate.confidence as WriterCharacterObservation["confidence"] : "review";
    return [{
      id: `import:${candidate.fingerprint}`,
      identityKey: candidate.identityKey,
      identity: candidate.identity,
      blockId: candidate.blockId,
      sceneId: typeof candidate.sceneId === "string" ? candidate.sceneId : null,
      start: candidate.start,
      end: candidate.end,
      excerpt,
      evidence: relation as WriterCharacterObservation["evidence"],
      signals: [candidate.reason, `Procedencia: ${candidate.source === "ai" ? "IA" : candidate.source === "explicit" ? "estructura explícita" : "regla local"}.`],
      ruleVersion: WRITER_CHARACTER_RULE_VERSION as typeof WRITER_CHARACTER_RULE_VERSION,
      confidence,
      known: confidence !== "review",
      blockHash: candidate.blockHash,
      fingerprint: candidate.fingerprint,
      source: ["explicit", "rule", "ai", "user"].includes(String(candidate.source))
        ? candidate.source as WriterCharacterObservation["source"] : "rule",
      presence: ["present", "absent", "unknown"].includes(String(candidate.presence))
        ? candidate.presence as WriterCharacterObservation["presence"] : "unknown",
      detected: true as const,
    }];
  });
  const kindSet = new Set<string>(SCREENPLAY_KINDS);
  const formatObservations = value.analysis.observations.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.blockId !== "string"
      || typeof candidate.message !== "string" || typeof candidate.blockHash !== "string"
      || !kindSet.has(String(candidate.kind))) return [];
    const block = blocks.get(candidate.blockId);
    if (!block || writerObservationTextHash(blockText(block)) !== candidate.blockHash) return [];
    return [{
      id: candidate.id,
      blockId: candidate.blockId,
      sceneId: typeof candidate.sceneId === "string" ? candidate.sceneId : null,
      kind: candidate.kind as ScreenplayKind,
      message: candidate.message,
      source: candidate.source === "ai" ? "ai" as const : "rule" as const,
      blockHash: candidate.blockHash,
    }];
  });
  const decisions = value.decisions.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.fingerprint !== "string" || typeof candidate.block_id !== "string"
      || !["confirmed", "linked", "ignored"].includes(String(candidate.decision))) return [];
    return [{
      fingerprint: candidate.fingerprint,
      blockId: candidate.block_id,
      state: candidate.decision as "confirmed" | "linked" | "ignored",
      ...(typeof candidate.identity_key === "string" ? { identityKey: candidate.identity_key } : {}),
      ...(typeof candidate.identity_name === "string" ? { identityName: candidate.identity_name } : {}),
      decidedAt: Date.parse(String(candidate.decided_at)) || Date.now(),
    }];
  });
  const identitiesByKey = new Map<string, WriterKnownCharacterIdentity>(
    parsedIdentities.map((identity) => [identity.key, identity]),
  );
  for (const decision of decisions) {
    if (decision.state !== "confirmed" || !decision.identityKey || !decision.identityName) continue;
    identitiesByKey.set(decision.identityKey, {
      key: decision.identityKey,
      name: decision.identityName,
      source: "confirmedAction",
    });
  }
  return {
    identities: [...identitiesByKey.values()],
    observations,
    formatObservations,
    decisions,
    persistent: true,
    compatibleRevision: value.compatibleRevision === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
