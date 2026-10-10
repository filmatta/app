export const SANDBOX_DEFAULT_MODEL = "gpt-5.6-terra";

export function sandboxModel() {
  return process.env.SANDBOX_OPENAI_MODEL?.trim() || SANDBOX_DEFAULT_MODEL;
}

export const SANDBOX_FREE_RESPONSE_LIMIT = 3;
export const SANDBOX_PAID_MONTHLY_RESPONSE_LIMIT = 100;

// Published standard text rates for gpt-5.6-terra (USD per million tokens).
// An override with unknown pricing is intentionally stored with cost = null.
export function estimateSandboxCostUsd(model: string, inputTokens: number, cachedInputTokens: number, outputTokens: number) {
  if (model !== SANDBOX_DEFAULT_MODEL) return null;
  const uncached = Math.max(0, inputTokens - cachedInputTokens);
  return Math.round(((uncached * 2 + cachedInputTokens * 0.2 + outputTokens * 12) / 1_000_000) * 1_000_000) / 1_000_000;
}
