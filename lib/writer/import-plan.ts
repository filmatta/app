export const WRITER_IMPORT_PLAN_CONFIG = {
  wordsPerPage: 250,
  free: {
    assistedImports: 1,
    maxPagesPerImport: 15,
  },
  paid: {
    assistedImports: null,
    maxPagesPerImport: 120,
  },
  raw: {
    maxBytes: 5_000_000,
  },
} as const;

export type WriterImportPlan = "free" | "paid";

// Billing can replace this resolver without changing the importer. App metadata
// is server-issued; public user metadata is intentionally ignored.
export function writerImportPlanFromAppMetadata(appMetadata?: Record<string, unknown>): WriterImportPlan {
  return appMetadata?.writer_import_plan === "paid" ? "paid" : "free";
}

export function writerImportPageCount(words: number) {
  return Math.max(1, Math.ceil(words / WRITER_IMPORT_PLAN_CONFIG.wordsPerPage));
}

export function writerImportPlanLimit(plan: WriterImportPlan) {
  return WRITER_IMPORT_PLAN_CONFIG[plan];
}
