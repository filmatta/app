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

export function assistedImportReasoning(environment: { [key: string]: string | undefined }) {
  return environment.WRITER_AI_IMPORT_QA_REASONING === "low" ? "low" as const : "none" as const;
}

export function intervalUnionMs(intervals: readonly { start: number; end: number }[]) {
  const sorted = intervals
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end >= interval.start)
    .map((interval) => ({ ...interval }))
    .sort((a, b) => a.start - b.start);
  if (!sorted.length) return 0;
  let total = 0;
  let start = sorted[0].start;
  let end = sorted[0].end;
  for (const interval of sorted.slice(1)) {
    if (interval.start <= end) end = Math.max(end, interval.end);
    else {
      total += end - start;
      start = interval.start;
      end = interval.end;
    }
  }
  return total + end - start;
}
