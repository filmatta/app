"use client";

export const WRITER_STRUCTURAL_METADATA_VERSION = 1;

export type WriterCharacterRenameAlias = {
  identityId: string;
  name: string;
  previousName?: string;
  blockIds?: string[];
};

export type WriterStructuralMetadata = {
  version: typeof WRITER_STRUCTURAL_METADATA_VERSION;
  sceneNicknames: Record<string, string>;
  characterAliases: Record<string, WriterCharacterRenameAlias>;
};

export function emptyWriterStructuralMetadata(): WriterStructuralMetadata {
  return {
    version: WRITER_STRUCTURAL_METADATA_VERSION,
    sceneNicknames: {},
    characterAliases: {},
  };
}

export function writerStructuralMetadataStorageKey(origin: string, userId: string, scriptId: string) {
  return `filmatta:writer-structural-metadata:v${WRITER_STRUCTURAL_METADATA_VERSION}:${encodeURIComponent(origin)}:${userId}:${scriptId}`;
}

export function loadWriterStructuralMetadata(origin: string, userId: string, scriptId: string) {
  const raw = window.localStorage.getItem(writerStructuralMetadataStorageKey(origin, userId, scriptId));
  if (!raw) return emptyWriterStructuralMetadata();
  return parseWriterStructuralMetadata(JSON.parse(raw));
}

export function saveWriterStructuralMetadata(
  origin: string,
  userId: string,
  scriptId: string,
  metadata: WriterStructuralMetadata,
) {
  window.localStorage.setItem(
    writerStructuralMetadataStorageKey(origin, userId, scriptId),
    JSON.stringify(metadata),
  );
}

export function parseWriterStructuralMetadata(value: unknown): WriterStructuralMetadata {
  if (!isRecord(value) || value.version !== WRITER_STRUCTURAL_METADATA_VERSION) {
    return emptyWriterStructuralMetadata();
  }
  const sceneNicknames = isRecord(value.sceneNicknames)
    ? Object.fromEntries(Object.entries(value.sceneNicknames).flatMap(([id, nickname]) => {
      if (typeof nickname !== "string") return [];
      const normalized = normalizeWriterSceneNickname(nickname);
      return normalized ? [[id, normalized]] : [];
    }))
    : {};
  const characterAliases = isRecord(value.characterAliases)
    ? Object.fromEntries(Object.entries(value.characterAliases).flatMap(([key, alias]) => {
      if (!isRecord(alias) || typeof alias.identityId !== "string" || typeof alias.name !== "string") return [];
      const name = normalizeWriterStructuralName(alias.name);
      const previousName = typeof alias.previousName === "string"
        ? normalizeWriterStructuralName(alias.previousName)
        : "";
      const blockIds = Array.isArray(alias.blockIds)
        ? alias.blockIds.filter((id): id is string => typeof id === "string").slice(0, 10_000)
        : [];
      return key && name ? [[key, {
        identityId: alias.identityId,
        name,
        ...(previousName ? { previousName } : {}),
        ...(blockIds.length ? { blockIds } : {}),
      }]] : [];
    }))
    : {};
  return {
    version: WRITER_STRUCTURAL_METADATA_VERSION,
    sceneNicknames,
    characterAliases,
  };
}

export function normalizeWriterSceneNickname(value: string) {
  return value.trim().replace(/\s+/gu, " ").slice(0, 80);
}

export function normalizeWriterStructuralName(value: string) {
  return value.trim().replace(/\s+/gu, " ").slice(0, 64);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
