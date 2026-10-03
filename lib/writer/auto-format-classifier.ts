import {
  calculateAssistedImportCostMicrousd,
  estimateAssistedImportMaximumCostMicrousd,
  type AssistedImportProviderUsage,
} from "./assisted-import-accounting.ts";
import { validateWriterAutoFormatClassifications, type WriterAutoFormatCandidate } from "./smart-format.ts";

export const WRITER_AUTO_FORMAT_MODEL = "gpt-5.6-terra" as const;
export const WRITER_AUTO_FORMAT_REASONING = "none" as const;

export type WriterAutoFormatProvider = (input: {
  candidates: readonly WriterAutoFormatCandidate[];
  operationId: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
}) => Promise<{
  result: unknown;
  usage: AssistedImportProviderUsage;
  latencyMs: number;
  requestId?: string;
}>;

export function writerAutoFormatAiAvailable(environment: Readonly<Record<string, string | undefined>>) {
  return environment.VERCEL_ENV === "preview"
    && environment.VERCEL_GIT_COMMIT_REF === "codex/writer-smart-format-layout-v1"
    && environment.NEXT_PUBLIC_SUPABASE_URL === "https://ezlycwkuzkwcnhrhiruv.supabase.co";
}

export async function classifyWriterAutoFormatCandidatesWithProvider(
  candidates: readonly WriterAutoFormatCandidate[],
  input: { operationId: string; signal?: AbortSignal },
  provider: WriterAutoFormatProvider,
) {
  if (candidates.length === 0) {
    return { classifications: [], model: WRITER_AUTO_FORMAT_MODEL, usage: emptyUsage(), costMicrousd: 0, maximumCostMicrousd: 0, latencyMs: 0 };
  }
  const maxOutputTokens = Math.min(3_600, Math.max(320, candidates.length * 44));
  const response = await provider({ ...input, candidates, maxOutputTokens });
  const classifications = validateWriterAutoFormatClassifications(candidates, response.result);
  return {
    classifications,
    model: WRITER_AUTO_FORMAT_MODEL,
    usage: response.usage,
    costMicrousd: calculateAssistedImportCostMicrousd(WRITER_AUTO_FORMAT_MODEL, response.usage),
    maximumCostMicrousd: estimateAssistedImportMaximumCostMicrousd(WRITER_AUTO_FORMAT_MODEL, approximateInputTokens(candidates), maxOutputTokens),
    latencyMs: response.latencyMs,
    requestId: response.requestId,
  };
}

function approximateInputTokens(candidates: readonly WriterAutoFormatCandidate[]) {
  return Math.ceil(JSON.stringify({ candidates }).length / 3.5) + 180;
}

function emptyUsage(): AssistedImportProviderUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
}
