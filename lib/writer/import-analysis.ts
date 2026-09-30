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
  excerpt: string;
};

export type WriterObservationVisualState =
  | "classification"
  | "question"
  | "warning"
  | "error"
  | "suggestion"
  | "narrativeQuestion"
  | "setupPayoff"
  | "outOfCharacter"
  | "pulse";

export type WriterFormatObservationGroup = {
  kind: ScreenplayKind;
  observations: WriterFormatObservation[];
  doubtCount: number;
  reviewedCount: number;
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
    return key && name ? [{
      key,
      name,
      source: "imported" as const,
      importedSource: typeof candidate.source === "string" ? candidate.source : "rule",
      accepted: typeof candidate.accepted === "boolean" ? candidate.accepted : undefined,
    }] : [];
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
      excerpt: blockText(block),
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
  // New analyses persist an explicit accepted/reconciled bit. Older analyses
  // can be reconstructed conservatively from final evidence: explicit
  // character structure, accepted AI action evidence, or a reconciled role
  // participant. Mentions, unknown presence and review-only evidence never
  // become identities through this compatibility path.
  const legacyAcceptedIdentityKeys = new Set(observations
    .filter((observation) => (observation.source === "explicit"
      && observation.confidence === "high"
      && blocks.get(observation.blockId)?.attrs.kind === "character")
      || (observation.presence === "present"
        && observation.confidence !== "review"
        && observation.evidence !== "mention"
        && (observation.source === "ai"
          || (observation.source === "rule" && observation.identityKey.startsWith("ROLE:")))))
    .map((observation) => observation.identityKey));
  const supportedAcceptedIdentityKeys = new Set(observations
    .filter((observation) => (observation.source === "explicit"
      && blocks.get(observation.blockId)?.attrs.kind === "character")
      || (observation.presence === "present"
        && observation.confidence !== "review"
        && (observation.evidence === "actionReference" || observation.evidence === "intervention")))
    .map((observation) => observation.identityKey));
  const identitiesByKey = new Map<string, WriterKnownCharacterIdentity>(
    parsedIdentities
      .filter((identity) => (identity.accepted === true && supportedAcceptedIdentityKeys.has(identity.key))
        || (identity.accepted === undefined
          && (identity.importedSource === "explicit" || legacyAcceptedIdentityKeys.has(identity.key))))
      .map((identity) => [identity.key, identity]),
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

export function writerFormatObservationState(
  observation: Pick<WriterFormatObservation, "message">,
): WriterObservationVisualState {
  return /(?:duda|inciert|no est[aá] segura|requiere revisi[oó]n|conservador)/iu.test(observation.message)
    ? "question"
    : "classification";
}

export function groupWriterFormatObservations(
  observations: readonly WriterFormatObservation[],
  reviewedIds: ReadonlySet<string> = new Set(),
): WriterFormatObservationGroup[] {
  const grouped = new Map<ScreenplayKind, WriterFormatObservation[]>();
  for (const observation of observations) {
    const current = grouped.get(observation.kind) ?? [];
    current.push(observation);
    grouped.set(observation.kind, current);
  }
  return SCREENPLAY_KINDS.flatMap((kind) => {
    const items = grouped.get(kind);
    if (!items?.length) return [];
    return [{
      kind,
      observations: items,
      doubtCount: items.filter((item) => writerFormatObservationState(item) === "question").length,
      reviewedCount: items.filter((item) => reviewedIds.has(item.id)).length,
    }];
  });
}

export function writerObservationExcerpt(value: string, maximum = 118) {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
