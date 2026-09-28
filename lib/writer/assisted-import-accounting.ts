import { getEncoding } from "js-tiktoken";

const MODEL_INPUT_USD_PER_MILLION = 0.20;
const MODEL_CACHED_INPUT_USD_PER_MILLION = 0.02;
const MODEL_OUTPUT_USD_PER_MILLION = 1.20;
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

export function estimateAssistedImportMaximumCostMicrousd(inputTokens: number, maxOutputTokens: number) {
  return Math.ceil(inputTokens * MODEL_INPUT_USD_PER_MILLION + maxOutputTokens * MODEL_OUTPUT_USD_PER_MILLION);
}

export function calculateAssistedImportCostMicrousd(usage: AssistedImportProviderUsage) {
  const cached = Math.min(usage.inputTokens, usage.cachedInputTokens);
  const uncached = Math.max(0, usage.inputTokens - cached);
  return Math.ceil(
    uncached * MODEL_INPUT_USD_PER_MILLION
    + cached * MODEL_CACHED_INPUT_USD_PER_MILLION
    + usage.outputTokens * MODEL_OUTPUT_USD_PER_MILLION,
  );
}
