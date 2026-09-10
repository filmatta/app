export const LEARN_CONTENT_TYPES = ["course", "quick_guide"] as const;

export type LearnContentType = (typeof LEARN_CONTENT_TYPES)[number];

export function isLearnContentType(value: unknown): value is LearnContentType {
  return LEARN_CONTENT_TYPES.includes(value as LearnContentType);
}

export function getLearnContentType(record: { content_type?: unknown }) {
  return record.content_type === "quick_guide" ? "quick_guide" : "course";
}

export function getLearnContentTypeLabel(contentType: LearnContentType) {
  return contentType === "quick_guide" ? "Guía rápida" : "Curso";
}
