import { createHash } from "node:crypto";

export type WriterProviderFeature = "diagnostic" | "ideas" | "guided_writing" | "narrative_pulse" | "breakdown";

export type WriterProviderStage =
  | "auth"
  | "ownership"
  | "saved_revision"
  | "feature_gate"
  | "budget_reservation"
  | "context_build"
  | "client_init"
  | "request_build"
  | "outbound_attempt"
  | "response_headers"
  | "response_body"
  | "parse"
  | "validation"
  | "persist"
  | "complete";

export type WriterProviderFailureOrigin =
  | "configuration"
  | "pre_provider"
  | "provider"
  | "network"
  | "timeout"
  | "caller_abort"
  | "response"
  | "parse"
  | "validation"
  | "persistence"
  | "unknown";

export type WriterProviderFailureMetadata = {
  providerStatus: number | null;
  providerErrorCode: string | null;
  providerErrorType: string | null;
  providerErrorParam: string | null;
  providerRequestId: string | null;
  failureOrigin: WriterProviderFailureOrigin;
};

type DiagnosticEvent = {
  diagnosticRunId: string;
  operationId: string;
  feature: WriterProviderFeature;
  stage: WriterProviderStage;
  outboundAttempted: boolean;
  requestedModel: string;
  providerStatus?: number | null;
  providerErrorCode?: string | null;
  providerErrorType?: string | null;
  providerErrorParam?: string | null;
  providerRequestId?: string | null;
  elapsedMs?: number | null;
  usageReceived?: boolean;
  failureOrigin?: WriterProviderFailureOrigin | null;
};

export function classifyWriterProviderFailure(
  cause: unknown,
  options: { outboundAttempted: boolean; aborted?: boolean } = { outboundAttempted: true },
): WriterProviderFailureMetadata {
  const error = record(cause) ? cause : {};
  const status = safeInteger(error.status);
  const name = safeToken(error.name, 80);
  const requestId = safeToken(
    error.requestID
      ?? error.request_id
      ?? headerValue(error.headers, "x-request-id"),
    160,
  );
  let failureOrigin: WriterProviderFailureOrigin = "unknown";
  if (options.aborted || name === "AbortError" || name === "APIUserAbortError") failureOrigin = "caller_abort";
  else if (name === "APIConnectionTimeoutError" || name?.toLowerCase().includes("timeout")) failureOrigin = "timeout";
  else if (status !== null) failureOrigin = "provider";
  else if (options.outboundAttempted && (name === "APIConnectionError" || name === "TypeError")) failureOrigin = "network";
  else if (!options.outboundAttempted) failureOrigin = "pre_provider";

  return {
    providerStatus: status,
    providerErrorCode: safeToken(error.code, 120),
    providerErrorType: safeToken(error.type, 120),
    providerErrorParam: safeToken(error.param, 160),
    providerRequestId: requestId,
    failureOrigin,
  };
}

export function writerProviderRuntimeSnapshot(model: string) {
  return {
    deployment_id: safeToken(process.env.VERCEL_DEPLOYMENT_ID, 160),
    deployment_sha: safeToken(process.env.VERCEL_GIT_COMMIT_SHA, 80),
    deployment_branch: safeToken(process.env.VERCEL_GIT_COMMIT_REF, 160),
    vercel_env: safeToken(process.env.VERCEL_ENV, 40),
    node_runtime: process.release.name,
    api_family: "responses",
    requested_model: model,
    api_base_hostname: apiBaseHostname(process.env.OPENAI_BASE_URL),
    openai_key_present: Boolean(process.env.OPENAI_API_KEY),
    production_ai_enabled: process.env.WRITER_PRODUCTION_AI_ENABLED === "enabled",
    max_retries: 0,
  };
}

export function writerProviderCacheKey(namespace: string, ...parts: Array<string | number | null | undefined>) {
  const safeNamespace = namespace.replace(/[^a-z0-9_-]/giu, "-").slice(0, 20) || "writer";
  const digest = createHash("sha256").update(parts.map((part) => String(part ?? "")).join("\u0000")).digest("hex").slice(0, 42);
  return `${safeNamespace}:${digest}`;
}

export function logWriterProviderDiagnostic(event: DiagnosticEvent) {
  console.info("writer_provider_diagnostic", {
    diagnostic_run_id: safeToken(event.diagnosticRunId, 160),
    operation_id: safeToken(event.operationId, 160),
    deployment_id: safeToken(process.env.VERCEL_DEPLOYMENT_ID, 160),
    deployment_sha: safeToken(process.env.VERCEL_GIT_COMMIT_SHA, 80),
    feature: event.feature,
    stage: event.stage,
    outbound_attempted: event.outboundAttempted,
    requested_model: safeToken(event.requestedModel, 120),
    api_family: "responses",
    provider_status: event.providerStatus ?? null,
    provider_error_code: safeToken(event.providerErrorCode, 120),
    provider_error_type: safeToken(event.providerErrorType, 120),
    provider_error_param: safeToken(event.providerErrorParam, 160),
    provider_request_id: safeToken(event.providerRequestId, 160),
    elapsed_ms: safeInteger(event.elapsedMs),
    usage_received: event.usageReceived ?? false,
    failure_origin: event.failureOrigin ?? null,
  });
}

export function writerProviderLedgerErrorCode(metadata: WriterProviderFailureMetadata) {
  return ["provider", metadata.providerStatus ?? metadata.failureOrigin, metadata.providerErrorCode ?? metadata.providerErrorType]
    .filter(Boolean)
    .join("_")
    .replace(/[^a-z0-9_-]/giu, "_")
    .slice(0, 80);
}

export function writerProviderFailureSettlement(input: {
  metadata: WriterProviderFailureMetadata;
  outboundAttempted: boolean;
  usageReceived: boolean;
  maximumCostMicrousd: number;
  measuredCostMicrousd: number;
}) {
  const uncertain = input.outboundAttempted && !input.usageReceived;
  return {
    status: uncertain ? "uncertain" as const : "failed" as const,
    costMicrousd: uncertain ? input.maximumCostMicrousd : input.measuredCostMicrousd,
    errorCode: writerProviderLedgerErrorCode(input.metadata),
  };
}

function apiBaseHostname(value: string | undefined) {
  try { return new URL(value || "https://api.openai.com/v1").hostname; }
  catch { return "invalid"; }
}

function headerValue(value: unknown, name: string) {
  if (typeof Headers !== "undefined" && value instanceof Headers) return value.get(name);
  if (record(value) && typeof value.get === "function") {
    try { return value.get(name); } catch { return null; }
  }
  return null;
}

function safeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function safeToken(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || !value) return null;
  const token = value.replace(/[^a-z0-9_.:\/\[\]-]/giu, "_").slice(0, maximum);
  return token || null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
