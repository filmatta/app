"use client";

import { normalizeWriterCharacterIdentity } from "./character-observations.ts";

export const WRITER_CHARACTER_DECISIONS_VERSION = 1;

export type WriterLocalCharacterIdentity = {
  id: string;
  name: string;
  source: "confirmedAction" | "manual";
  createdAt: number;
};

export type WriterCharacterDecision = {
  fingerprint: string;
  blockId: string;
  state: "confirmed" | "linked" | "ignored";
  identityId?: string;
  identityKey?: string;
  decidedAt: number;
};

export type WriterCharacterDecisionState = {
  version: typeof WRITER_CHARACTER_DECISIONS_VERSION;
  identities: WriterLocalCharacterIdentity[];
  decisions: WriterCharacterDecision[];
};

export function emptyWriterCharacterDecisionState(): WriterCharacterDecisionState {
  return { version: WRITER_CHARACTER_DECISIONS_VERSION, identities: [], decisions: [] };
}

export function writerCharacterDecisionStorageKey(origin: string, userId: string, scriptId: string) {
  return `filmatta:writer-character-decisions:v${WRITER_CHARACTER_DECISIONS_VERSION}:${encodeURIComponent(origin)}:${userId}:${scriptId}`;
}

export function loadWriterCharacterDecisionState(origin: string, userId: string, scriptId: string) {
  const raw = window.localStorage.getItem(writerCharacterDecisionStorageKey(origin, userId, scriptId));
  if (!raw) return emptyWriterCharacterDecisionState();
  return parseWriterCharacterDecisionState(JSON.parse(raw));
}

export function saveWriterCharacterDecisionState(
  origin: string,
  userId: string,
  scriptId: string,
  state: WriterCharacterDecisionState,
) {
  window.localStorage.setItem(
    writerCharacterDecisionStorageKey(origin, userId, scriptId),
    JSON.stringify(state),
  );
}

export function parseWriterCharacterDecisionState(value: unknown): WriterCharacterDecisionState {
  if (!isRecord(value) || value.version !== WRITER_CHARACTER_DECISIONS_VERSION) {
    return emptyWriterCharacterDecisionState();
  }
  const identities = Array.isArray(value.identities)
    ? value.identities.flatMap((candidate) => {
      if (!isRecord(candidate)
        || typeof candidate.id !== "string"
        || typeof candidate.name !== "string"
        || (candidate.source !== "confirmedAction" && candidate.source !== "manual")
        || typeof candidate.createdAt !== "number") return [];
      const name = candidate.name.trim().replace(/\s+/gu, " ").slice(0, 64);
      if (!name) return [];
      return [{
        id: candidate.id,
        name,
        source: candidate.source as WriterLocalCharacterIdentity["source"],
        createdAt: candidate.createdAt,
      }];
    })
    : [];
  const identityIds = new Set(identities.map((identity) => identity.id));
  const decisions = Array.isArray(value.decisions)
    ? value.decisions.flatMap((candidate) => {
      if (!isRecord(candidate)
        || typeof candidate.fingerprint !== "string"
        || typeof candidate.blockId !== "string"
        || !["confirmed", "linked", "ignored"].includes(String(candidate.state))
        || typeof candidate.decidedAt !== "number") return [];
      const identityId = typeof candidate.identityId === "string" && identityIds.has(candidate.identityId)
        ? candidate.identityId
        : undefined;
      const identityKey = typeof candidate.identityKey === "string"
        ? normalizeWriterCharacterIdentity(candidate.identityKey)
        : undefined;
      if (candidate.state !== "ignored" && !identityId && !identityKey) return [];
      return [{
        fingerprint: candidate.fingerprint,
        blockId: candidate.blockId,
        state: candidate.state as WriterCharacterDecision["state"],
        ...(identityId ? { identityId } : {}),
        ...(identityKey ? { identityKey } : {}),
        decidedAt: candidate.decidedAt,
      }];
    })
    : [];
  return { version: WRITER_CHARACTER_DECISIONS_VERSION, identities, decisions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
