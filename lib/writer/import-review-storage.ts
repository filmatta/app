"use client";

export const WRITER_IMPORT_REVIEW_VERSION = 1;

export type WriterImportReviewState = {
  version: typeof WRITER_IMPORT_REVIEW_VERSION;
  reviewedFormatIds: string[];
};

export function emptyWriterImportReviewState(): WriterImportReviewState {
  return { version: WRITER_IMPORT_REVIEW_VERSION, reviewedFormatIds: [] };
}

export function writerImportReviewStorageKey(origin: string, userId: string, scriptId: string) {
  return `filmatta:writer-import-review:v${WRITER_IMPORT_REVIEW_VERSION}:${encodeURIComponent(origin)}:${userId}:${scriptId}`;
}

export function loadWriterImportReviewState(origin: string, userId: string, scriptId: string) {
  const raw = window.localStorage.getItem(writerImportReviewStorageKey(origin, userId, scriptId));
  return raw ? parseWriterImportReviewState(JSON.parse(raw)) : emptyWriterImportReviewState();
}

export function saveWriterImportReviewState(
  origin: string,
  userId: string,
  scriptId: string,
  state: WriterImportReviewState,
) {
  window.localStorage.setItem(writerImportReviewStorageKey(origin, userId, scriptId), JSON.stringify(state));
}

export function parseWriterImportReviewState(value: unknown): WriterImportReviewState {
  if (!isRecord(value) || value.version !== WRITER_IMPORT_REVIEW_VERSION || !Array.isArray(value.reviewedFormatIds)) {
    return emptyWriterImportReviewState();
  }
  const reviewedFormatIds = [...new Set(value.reviewedFormatIds
    .filter((candidate): candidate is string => typeof candidate === "string")
    .map((candidate) => candidate.trim().slice(0, 256))
    .filter(Boolean))].slice(0, 1_000);
  return { version: WRITER_IMPORT_REVIEW_VERSION, reviewedFormatIds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
