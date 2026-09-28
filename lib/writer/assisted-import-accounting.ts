import { getEncoding } from "js-tiktoken";

export const WRITER_ASSISTED_IMPORT_MODELS = {
  "gpt-5.6-luna": {
    inputUsdPerMillion: 0.20,
    cachedInputUsdPerMillion: 0.02,
    outputUsdPerMillion: 1.20,
  },
  "gpt-5.6-terra": {
    inputUsdPerMillion: 2.00,
    cachedInputUsdPerMillion: 0.20,
    outputUsdPerMillion: 12.00,
  },
} as const;

export type AssistedImportModel = keyof typeof WRITER_ASSISTED_IMPORT_MODELS;
const encoder = getEncoding("o200k_base");

export type AssistedImportProviderUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export function countAssistedImportTokens(value: string) {
  return encoder.encode(value).length;
}

export function estimateAssistedImportMaximumCostMicrousd(
  model: AssistedImportModel,
  inputTokens: number,
  maxOutputTokens: number,
) {
  const pricing = WRITER_ASSISTED_IMPORT_MODELS[model];
  return Math.ceil(inputTokens * pricing.inputUsdPerMillion + maxOutputTokens * pricing.outputUsdPerMillion);
}

export function calculateAssistedImportCostMicrousd(model: AssistedImportModel, usage: AssistedImportProviderUsage) {
  const pricing = WRITER_ASSISTED_IMPORT_MODELS[model];
  const cached = Math.min(usage.inputTokens, usage.cachedInputTokens);
  const uncached = Math.max(0, usage.inputTokens - cached);
  return Math.ceil(
    uncached * pricing.inputUsdPerMillion
    + cached * pricing.cachedInputUsdPerMillion
    + usage.outputTokens * pricing.outputUsdPerMillion,
  );
}

export function assistedImportModelForUser(
  environment: { [key: string]: string | undefined },
  userId: string,
  appMetadata: Record<string, unknown> = {},
): AssistedImportModel {
  const assignments = environment.WRITER_AI_IMPORT_QA_MODEL_ASSIGNMENTS?.split(",") ?? [];
  for (const assignment of assignments) {
    const [assignedUserId, assignedModel, extra] = assignment.trim().split("=");
    if (!extra && assignedUserId === userId && assignedModel in WRITER_ASSISTED_IMPORT_MODELS) {
      return assignedModel as AssistedImportModel;
    }
  }
  if (environment.WRITER_AI_IMPORT_QA_APP_METADATA_ENABLED === "true"
    && appMetadata.writer_assisted_import_qa === true
    && typeof appMetadata.writer_assisted_import_model === "string"
    && appMetadata.writer_assisted_import_model in WRITER_ASSISTED_IMPORT_MODELS) {
    return appMetadata.writer_assisted_import_model as AssistedImportModel;
  }
  return "gpt-5.6-luna";
}

export function assistedImportReasoning() {
  return "none" as const;
}
