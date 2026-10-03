import type { WriterDocument } from "./document.ts";
import { getWriterDocumentReadiness, type WriterDocumentReadiness } from "./smart-format.ts";
export { countRedundantWriterBlankBlocks } from "./spacing.ts";

export const WRITER_FORMAT_BASELINE_VERSION = 1;

export type WriterFormatInvalidationReason =
  | "significantPaste"
  | "import"
  | "genericBatch"
  | "largeReplace"
  | "externalMerge";

export type WriterFormatBaseline = {
  version: typeof WRITER_FORMAT_BASELINE_VERSION;
  reviewedAt: number;
  reviewedRevision: number;
  reviewedSceneIds: string[];
  pendingBlockIds: string[];
};

export type WriterFormatChange = {
  kind: "text" | "cursor" | "autosave" | "structural";
  reason?: WriterFormatInvalidationReason;
  affectedBlockIds?: readonly string[];
  replacementCount?: number;
};

export function createWriterFormatBaseline(
  document: WriterDocument,
  revision: number,
): WriterFormatBaseline {
  return {
    version: WRITER_FORMAT_BASELINE_VERSION,
    reviewedAt: Date.now(),
    reviewedRevision: Math.max(1, Math.trunc(revision)),
    reviewedSceneIds: document.content
      .filter((block) => block.attrs.kind === "sceneHeading")
      .map((block) => block.attrs.id),
    pendingBlockIds: [],
  };
}

export function shouldInvalidateFormatBaseline(change: WriterFormatChange) {
  if (change.kind !== "structural") return false;
  if (change.reason === "largeReplace") return (change.replacementCount ?? 0) >= 8;
  return change.reason === "significantPaste"
    || change.reason === "import"
    || change.reason === "genericBatch"
    || change.reason === "externalMerge";
}

export function invalidateWriterFormatBaseline(
  baseline: WriterFormatBaseline | null,
  change: WriterFormatChange,
): WriterFormatBaseline | null {
  if (!baseline || !shouldInvalidateFormatBaseline(change)) return baseline;
  const pending = new Set(baseline.pendingBlockIds);
  for (const blockId of change.affectedBlockIds ?? []) pending.add(blockId);
  return { ...baseline, pendingBlockIds: [...pending] };
}

export function resolveWriterFormatBaseline(
  baseline: WriterFormatBaseline | null,
  document: WriterDocument,
  resolvedBlockIds: readonly string[],
  revision: number,
) {
  if (!baseline) return createWriterFormatBaseline(document, revision);
  const resolved = new Set(resolvedBlockIds);
  return {
    ...createWriterFormatBaseline(document, revision),
    reviewedAt: Date.now(),
    pendingBlockIds: baseline.pendingBlockIds.filter((id) => !resolved.has(id)),
  } satisfies WriterFormatBaseline;
}

export function writerReadinessWithFormatBaseline(
  document: WriterDocument,
  baseline: WriterFormatBaseline | null,
): WriterDocumentReadiness {
  const derived = getWriterDocumentReadiness(document);
  if (!baseline || derived.state === "EMPTY" || derived.state === "UNFORMATTED") return derived;
  const ids = new Set(document.content.map((block) => block.attrs.id));
  const sceneIds = new Set(document.content
    .filter((block) => block.attrs.kind === "sceneHeading")
    .map((block) => block.attrs.id));
  const missingReviewedScene = baseline.reviewedSceneIds.some((id) => !sceneIds.has(id));
  const pending = baseline.pendingBlockIds.filter((id) => ids.has(id));
  if (missingReviewedScene) {
    return { ...derived, state: "PARTIALLY_FORMATTED" };
  }
  if (pending.length > 0) {
    return { ...derived, state: "PARTIALLY_FORMATTED", suspiciousBlockIds: pending };
  }
  return { ...derived, state: "READY", suspiciousBlockIds: [] };
}

export function parseWriterFormatBaseline(value: unknown): WriterFormatBaseline | null {
  if (!isRecord(value) || value.version !== WRITER_FORMAT_BASELINE_VERSION
    || !Number.isFinite(value.reviewedAt) || !Number.isFinite(value.reviewedRevision)
    || !Array.isArray(value.reviewedSceneIds) || !Array.isArray(value.pendingBlockIds)) return null;
  const reviewedSceneIds = value.reviewedSceneIds.filter(validId);
  const pendingBlockIds = value.pendingBlockIds.filter(validId);
  return {
    version: WRITER_FORMAT_BASELINE_VERSION,
    reviewedAt: Number(value.reviewedAt),
    reviewedRevision: Math.max(1, Math.trunc(Number(value.reviewedRevision))),
    reviewedSceneIds: [...new Set(reviewedSceneIds)],
    pendingBlockIds: [...new Set(pendingBlockIds)],
  };
}

export function writerFormatBaselineStorageKey(origin: string, userId: string, scriptId: string) {
  return `filmatta:writer-format-baseline:v${WRITER_FORMAT_BASELINE_VERSION}:${encodeURIComponent(origin)}:${userId}:${scriptId}`;
}

export function loadWriterFormatBaseline(origin: string, userId: string, scriptId: string) {
  try {
    const raw = window.localStorage.getItem(writerFormatBaselineStorageKey(origin, userId, scriptId));
    return raw ? parseWriterFormatBaseline(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveWriterFormatBaseline(origin: string, userId: string, scriptId: string, baseline: WriterFormatBaseline) {
  window.localStorage.setItem(writerFormatBaselineStorageKey(origin, userId, scriptId), JSON.stringify(baseline));
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/iu.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
