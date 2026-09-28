import { getEncoding } from "js-tiktoken";

export const WRITER_ASSISTED_IMPORT_MODELS = {
  "gpt-5.6-terra": {
    inputUsdPerMillion: 2.00,
    cachedInputUsdPerMillion: 0.20,
    outputUsdPerMillion: 12.00,
  },
  "gpt-5.6-sol": {
    inputUsdPerMillion: 4.00,
    cachedInputUsdPerMillion: 0.40,
    outputUsdPerMillion: 20.00,
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
  _environment: { [key: string]: string | undefined },
  _userId: string,
  _appMetadata: Record<string, unknown> = {},
): AssistedImportModel {
  void _environment;
  void _userId;
  void _appMetadata;
  return "gpt-5.6-terra";
}

export function assistedImportReasoning(model: AssistedImportModel = "gpt-5.6-terra") {
  return model === "gpt-5.6-sol" ? "low" as const : "none" as const;
}
