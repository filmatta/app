import "server-only";

import { createHash } from "node:crypto";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculateWriterSceneAnalysisCost,
  countWriterSceneAnalysisTokens,
  estimateWriterSceneAnalysisMaximumCost,
  type WriterSceneAnalysisUsage,
} from "./script-assistant-accounting";
import { WRITER_SCRIPT_ASSISTANT_MODEL } from "./script-assistant";
import {
  classifyWriterProviderFailure,
  logWriterProviderDiagnostic,
  writerProviderFailureSettlement,
  writerProviderRuntimeSnapshot,
  type WriterProviderFailureMetadata,
} from "./provider-diagnostics";

const DIAGNOSTIC_VERSION = "provider-connectivity-v2";
const DIAGNOSTIC_TOTAL_CAP_MICRO_USD = 100_000;
const DIAGNOSTIC_KINDS = ["minimal", "structured"] as const;

export type WriterProviderDiagnosticKind = typeof DIAGNOSTIC_KINDS[number];

type Database = ReturnType<typeof createAdminClient>;
type ProviderResult = {
  outputText: string | null;
  status: string;
  usage: WriterSceneAnalysisUsage | null;
  requestId: string | null;
  latencyMs: number;
};

export class WriterProviderDiagnosticError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

export function isWriterProviderDiagnosticKind(value: unknown): value is WriterProviderDiagnosticKind {
  return typeof value === "string" && (DIAGNOSTIC_KINDS as readonly string[]).includes(value);
}

export async function executeWriterProviderDiagnostic(
  userId: string,
  scriptId: string,
  kind: WriterProviderDiagnosticKind,
  dependencies: {
    readDb: SupabaseClient;
    db?: Database;
    provider?: (kind: WriterProviderDiagnosticKind, operationId: string) => Promise<ProviderResult>;
  },
) {
  assertEnabled(userId);
  const owned = await dependencies.readDb.from("writer_scripts").select("id").eq("id", scriptId).eq("owner_id", userId).maybeSingle();
  if (owned.error || !owned.data) throw new WriterProviderDiagnosticError("not_found", "Guion QA no encontrado.", 404);

  const db = dependencies.db ?? createAdminClient();
  const operationId = deterministicUuid(`${DIAGNOSTIC_VERSION}:${userId}:${kind}`);
  const requestHash = createHash("sha256").update(`${DIAGNOSTIC_VERSION}:${WRITER_SCRIPT_ASSISTANT_MODEL}:${kind}`).digest("hex");
  const maximumCost = maximumCostFor(kind);
  const knownOperationIds = DIAGNOSTIC_KINDS.map((value) => deterministicUuid(`${DIAGNOSTIC_VERSION}:${userId}:${value}`));
  const previous = await db.from("writer_smart_tool_operations").select("id,status,actual_cost_microusd")
    .eq("owner_id", userId).in("id", knownOperationIds);
  if (previous.error) throw new WriterProviderDiagnosticError("storage", "No pudimos comprobar el límite diagnóstico.", 500);
  if ((previous.data ?? []).some((row) => String(row.id) === operationId)) {
    throw new WriterProviderDiagnosticError("duplicate", "Esta prueba diagnóstica ya fue ejecutada.", 409);
  }
  const spent = (previous.data ?? []).reduce((total, row) => total + Number(row.actual_cost_microusd ?? 0), 0);
  if (spent + maximumCost > DIAGNOSTIC_TOTAL_CAP_MICRO_USD) {
    throw new WriterProviderDiagnosticError("budget", "El límite diagnóstico está agotado.", 429);
  }

  const reserved = await db.from("writer_smart_tool_operations").insert({
    id: operationId,
    owner_id: userId,
    script_id: scriptId,
    tool: "ideas",
    scope: "scene",
    model: WRITER_SCRIPT_ASSISTANT_MODEL,
    status: "processing",
    request_hash: requestHash,
    chunks: 0,
  });
  if (reserved.error) throw new WriterProviderDiagnosticError("reservation", "No pudimos reservar la prueba diagnóstica.", 409);

  console.info("writer_provider_runtime", {
    diagnostic_run_id: operationId,
    operation_id: operationId,
    feature: "diagnostic",
    kind,
    ...writerProviderRuntimeSnapshot(WRITER_SCRIPT_ASSISTANT_MODEL),
    timeout_ms: 30_000,
  });

  let providerResult: ProviderResult;
  try {
    providerResult = await (dependencies.provider ?? openAiDiagnosticProvider)(kind, operationId);
  } catch (cause) {
    const failure = cause instanceof DiagnosticProviderFailure
      ? cause
      : new DiagnosticProviderFailure(classifyWriterProviderFailure(cause, { outboundAttempted: true }), null, null);
    const usage = failure.usage ?? emptyUsage();
    const settlement = writerProviderFailureSettlement({
      metadata: failure.metadata,
      outboundAttempted: true,
      usageReceived: failure.usage !== null,
      maximumCostMicrousd: maximumCost,
      measuredCostMicrousd: calculateWriterSceneAnalysisCost(usage),
    });
    await settle(db, userId, operationId, settlement.status, usage, settlement.costMicrousd, failure.elapsedMs ?? 0, settlement.errorCode);
    throw new WriterProviderDiagnosticError("provider", "La prueba no recibió una respuesta utilizable.", 503);
  }

  const usage = providerResult.usage ?? emptyUsage();
  const actualCost = calculateWriterSceneAnalysisCost(usage);
  const valid = kind === "minimal"
    ? providerResult.status === "completed" && providerResult.outputText?.trim() === "OK"
    : validateStructured(providerResult);
  if (!valid) {
    await settle(db, userId, operationId, "failed", usage, actualCost, providerResult.latencyMs, `diagnostic_${kind}_invalid_response`);
    logWriterProviderDiagnostic({
      diagnosticRunId: operationId, operationId, feature: "diagnostic", stage: "validation",
      outboundAttempted: true, requestedModel: WRITER_SCRIPT_ASSISTANT_MODEL,
      providerRequestId: providerResult.requestId, elapsedMs: providerResult.latencyMs,
      usageReceived: providerResult.usage !== null, failureOrigin: "validation",
      providerErrorCode: "invalid_response",
    });
    throw new WriterProviderDiagnosticError("invalid_response", "La respuesta no cumplió el contrato diagnóstico.", 503);
  }

  await settle(db, userId, operationId, "completed", usage, actualCost, providerResult.latencyMs, null);
  logWriterProviderDiagnostic({
    diagnosticRunId: operationId, operationId, feature: "diagnostic", stage: "complete",
    outboundAttempted: true, requestedModel: WRITER_SCRIPT_ASSISTANT_MODEL,
    providerRequestId: providerResult.requestId, elapsedMs: providerResult.latencyMs,
    usageReceived: providerResult.usage !== null,
  });
  return {
    kind,
    result: "pass",
    operationId,
    model: WRITER_SCRIPT_ASSISTANT_MODEL,
    providerRequestId: providerResult.requestId,
    usage: providerResult.usage,
    costMicrousd: actualCost,
    latencyMs: providerResult.latencyMs,
  };
}

async function openAiDiagnosticProvider(kind: WriterProviderDiagnosticKind, operationId: string): Promise<ProviderResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new DiagnosticProviderFailure({
      providerStatus: null, providerErrorCode: "openai_key_missing", providerErrorType: null,
      providerErrorParam: null, providerRequestId: null, failureOrigin: "configuration",
    }, null, null);
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 30_000 });
  const started = Date.now();
  logWriterProviderDiagnostic({
    diagnosticRunId: operationId, operationId, feature: "diagnostic", stage: "outbound_attempt",
    outboundAttempted: true, requestedModel: WRITER_SCRIPT_ASSISTANT_MODEL,
  });
  let response;
  try {
    response = await client.responses.create({
      model: WRITER_SCRIPT_ASSISTANT_MODEL,
      reasoning: { effort: "none" },
      store: false,
      max_output_tokens: kind === "minimal" ? 32 : 64,
      input: kind === "minimal" ? "Responde exactamente OK." : "Devuelve el estado ok.",
      ...(kind === "structured" ? {
        text: { format: { type: "json_schema" as const, name: "writer_provider_connectivity", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["status"],
          properties: { status: { type: "string", enum: ["ok"] } },
        } } },
      } : {}),
    }, { headers: { "Idempotency-Key": `writer-provider-diagnostic-${operationId}` } });
  } catch (cause) {
    const metadata = classifyWriterProviderFailure(cause, { outboundAttempted: true });
    const elapsedMs = Date.now() - started;
    logWriterProviderDiagnostic({
      diagnosticRunId: operationId, operationId, feature: "diagnostic", stage: "response_headers",
      outboundAttempted: true, requestedModel: WRITER_SCRIPT_ASSISTANT_MODEL,
      elapsedMs, usageReceived: false, ...metadata,
    });
    throw new DiagnosticProviderFailure(metadata, null, elapsedMs);
  }
  const usage = response.usage ? readUsage(response.usage) : null;
  const requestId = typeof response._request_id === "string" ? response._request_id : null;
  const latencyMs = Date.now() - started;
  logWriterProviderDiagnostic({
    diagnosticRunId: operationId, operationId, feature: "diagnostic", stage: "response_body",
    outboundAttempted: true, requestedModel: WRITER_SCRIPT_ASSISTANT_MODEL,
    providerRequestId: requestId, elapsedMs: latencyMs, usageReceived: usage !== null,
    providerErrorCode: response.status === "completed" ? null : `response_${response.status}`,
    failureOrigin: response.status === "completed" ? null : "response",
  });
  return { outputText: response.output_text || null, status: String(response.status ?? "unknown"), usage, requestId, latencyMs };
}

class DiagnosticProviderFailure extends Error {
  constructor(readonly metadata: WriterProviderFailureMetadata, readonly usage: WriterSceneAnalysisUsage | null, readonly elapsedMs: number | null) { super("provider_failed"); }
}

async function settle(db: Database, userId: string, operationId: string, status: "completed" | "failed" | "uncertain", usage: WriterSceneAnalysisUsage, cost: number, latencyMs: number, errorCode: string | null) {
  const result = await db.from("writer_smart_tool_operations").update({
    status,
    input_tokens: usage.inputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    output_tokens: usage.outputTokens,
    reasoning_tokens: usage.reasoningTokens,
    actual_cost_microusd: cost,
    latency_ms: latencyMs,
    error_code: errorCode,
    settled_at: new Date().toISOString(),
  }).eq("id", operationId).eq("owner_id", userId);
  if (result.error) throw new WriterProviderDiagnosticError("storage", "No pudimos conciliar la prueba diagnóstica.", 500);
}

function validateStructured(result: ProviderResult) {
  if (result.status !== "completed" || !result.outputText) return false;
  try {
    const value = JSON.parse(result.outputText) as unknown;
    return isRecord(value) && value.status === "ok" && Object.keys(value).length === 1;
  } catch { return false; }
}

function assertEnabled(userId: string) {
  const authorized = new Set((process.env.WRITER_PROVIDER_DIAGNOSTIC_QA_USER_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  if (process.env.VERCEL_ENV !== "preview"
    || process.env.WRITER_PROVIDER_DIAGNOSTIC_ENABLED !== "enabled"
    || !authorized.has(userId)) {
    throw new WriterProviderDiagnosticError("not_found", "Ruta no disponible.", 404);
  }
}

function maximumCostFor(kind: WriterProviderDiagnosticKind) {
  const input = kind === "minimal" ? "Responde exactamente OK." : "Devuelve el estado ok.";
  return estimateWriterSceneAnalysisMaximumCost(countWriterSceneAnalysisTokens(input), kind === "minimal" ? 32 : 64);
}

function deterministicUuid(value: string) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readUsage(value: unknown): WriterSceneAnalysisUsage {
  const usage = isRecord(value) ? value : {};
  const input = isRecord(usage.input_tokens_details) ? usage.input_tokens_details : {};
  const output = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : {};
  return {
    inputTokens: integer(usage.input_tokens),
    cachedInputTokens: integer(input.cached_tokens),
    cacheWriteTokens: integer(input.cache_write_tokens),
    outputTokens: integer(usage.output_tokens),
    reasoningTokens: integer(output.reasoning_tokens),
  };
}

function emptyUsage(): WriterSceneAnalysisUsage {
  return { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 };
}

function integer(value: unknown) { return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
