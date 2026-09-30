import { getEncoding } from "js-tiktoken";

export const WRITER_SCENE_ANALYSIS_PRICING = {
  inputUsdPerMillion: 2,
  cachedInputUsdPerMillion: 0.2,
  outputUsdPerMillion: 12,
} as const;

const encoder = getEncoding("o200k_base");

export type WriterSceneAnalysisUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export function countWriterSceneAnalysisTokens(value: string) {
  return encoder.encode(value).length;
}

export function estimateWriterSceneAnalysisMaximumCost(inputTokens: number, maxOutputTokens: number) {
  return Math.ceil(
    inputTokens * WRITER_SCENE_ANALYSIS_PRICING.inputUsdPerMillion
    + maxOutputTokens * WRITER_SCENE_ANALYSIS_PRICING.outputUsdPerMillion,
  );
}

export function calculateWriterSceneAnalysisCost(usage: WriterSceneAnalysisUsage) {
  const cached = Math.min(usage.inputTokens, usage.cachedInputTokens);
  return Math.ceil(
    (usage.inputTokens - cached) * WRITER_SCENE_ANALYSIS_PRICING.inputUsdPerMillion
    + cached * WRITER_SCENE_ANALYSIS_PRICING.cachedInputUsdPerMillion
    + usage.outputTokens * WRITER_SCENE_ANALYSIS_PRICING.outputUsdPerMillion,
  );
}
