import "server-only";

import { createHash } from "node:crypto";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculateAssistedImportCostMicrousd,
  countAssistedImportTokens,
  estimateAssistedImportMaximumCostMicrousd,
  assistedImportReasoning,
  type AssistedImportModel,
  type AssistedImportProviderUsage,
} from "./assisted-import-accounting";
import { checkAssistedImportAccess } from "./assisted-import-access";
import {
  assistedImportAnalysisVersion,
  determineAssistedImportAnalysisStatus,
  parseAssistedImportAnalysisVersion,
  recoverySkippedReasonForErrorCode,
  type AssistedImportAnalysisStatus,
  type AssistedImportRecoverySkippedReason,
} from "./assisted-import-status";
import {
  WRITER_ASSISTED_IMPORT_MAX_BYTES,
  WRITER_ASSISTED_IMPORT_MAX_CONCURRENCY,
  WRITER_ASSISTED_IMPORT_MAX_AUTHORIZED_COST_MICRO_USD,
  WRITER_ASSISTED_IMPORT_MAX_COST_MICRO_USD,
  WRITER_ASSISTED_IMPORT_MAX_SOURCE_TOKENS,
  WRITER_ASSISTED_IMPORT_MAX_WORDS,
  WRITER_ASSISTED_IMPORT_OUTPUT_SCHEMA,
  WRITER_ASSISTED_IMPORT_VERSION,
  assertAssistedImportPreservation,
  planAssistedImportRecovery,
  prepareAssistedImportStaging,
  reconcileAssistedImport,
  recoveryBatch,
  validateAssistedImportModelResult,
  expandAssistedImportTransportResult,
  AssistedImportValidationError,
  type AssistedImportBatch,
  type AssistedImportModelResult,
  type AssistedImportRecoveryTrigger,
} from "./assisted-import";
import {
  SOL_MODEL,
  TERRA_MODEL,
  WRITER_ASSISTED_IMPORT_SOL_INSTRUCTIONS,
  WRITER_ASSISTED_IMPORT_TERRA_INSTRUCTIONS,
  assistedImportProviderInput,
  assistedImportRequestBreakdown,
  dryRunAssistedImport,
  type AssistedImportStage,
} from "./assisted-import-plan";
import type { WriterImportFormat } from "./import";
import { assistedImportDatabaseErrorDescriptor } from "./assisted-import-errors";

const PIPELINE_MODEL = `${TERRA_MODEL}+${SOL_MODEL}`;

export type AssistedImportRequest = {
  operationId: string;
  title: string;
  format: WriterImportFormat;
  sourceText: string;
  fileName?: string;
  signal?: AbortSignal;
};

export type AssistedImportAvailability = {
  enabled: boolean;
  reason: string | null;
  operationId?: string;
  limits: {
    maxBytes: number;
    maxWords: number;
    maxSourceTokens: number;
    completedPerAccount: number;
  };
};

export type AssistedImportProvider = (input: {
  operationId: string;
  batch: AssistedImportBatch;
  requestHash: string;
  maxOutputTokens: number;
  model: AssistedImportModel;
  reasoning: "none" | "low";
  stage: AssistedImportStage;
  triggers: AssistedImportRecoveryTrigger[];
  priorResult?: AssistedImportModelResult | null;
  signal?: AbortSignal;
}) => Promise<{
  result: unknown;
  usage: ProviderUsage;
  latencyMs: number;
  requestId?: string;
}>;

export type AssistedImportRejectedDiagnostic = {
  stage: AssistedImportStage;
  model: AssistedImportModel;
  requestId?: string;
  code: string;
  path: string;
  usage: ProviderUsage;
  rejectedOutput?: unknown;
};

type ProviderUsage = AssistedImportProviderUsage;

type ImportDatabase = ReturnType<typeof createAdminClient>;
type AssistedImportAuthContext = { appMetadata?: Record<string, unknown> };

export function assistedImportAvailability(userId: string, auth: AssistedImportAuthContext = {}): AssistedImportAvailability {
  const access = checkAssistedImportAccess(process.env, userId, auth.appMetadata);
  if (!access.enabled) return unavailable(access.reason);
  return { enabled: true, reason: null, limits: limits() };
}

export async function assistedImportAccountStatus(userId: string, auth: AssistedImportAuthContext = {}) {
  const availability = assistedImportAvailability(userId, auth);
  if (!availability.enabled) return availability;
  const db = createAdminClient();
  const [completed, active, attempts, grants] = await Promise.all([
    db.from("writer_assisted_imports").select("id", { count: "exact", head: true }).eq("owner_id", userId).eq("status", "completed"),
    db.from("writer_assisted_imports").select("id,status").eq("owner_id", userId).in("status", ["reserved", "processing", "ready", "uncertain"]).maybeSingle(),
    db.from("writer_assisted_imports").select("id", { count: "exact", head: true }).eq("owner_id", userId)
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    db.rpc("writer_assisted_import_qa_budget_status", { p_user_id: userId }),
  ]);
  if (completed.error || active.error || attempts.error || grants.error) return unavailable("El control de cupo asistido no está disponible.");
  if ((completed.count ?? 0) >= 1) return unavailable("Esta cuenta ya utilizó su importación asistida gratuita.");
  if (active.data) return unavailable(active.data.status === "uncertain"
    ? "Hay una operación anterior pendiente de conciliación segura."
    : "Ya hay una importación asistida en curso para esta cuenta.");
  if ((attempts.count ?? 0) >= 3) return unavailable("Esta cuenta alcanzó el límite de 3 intentos en 24 horas.");
  const operationId = activeQaGrantOperationId(grants.data);
  return operationId ? { ...availability, operationId } : availability;
}

export async function executeAssistedImport(
  userId: string,
  request: AssistedImportRequest,
  dependencies: {
    provider?: AssistedImportProvider;
    db?: ImportDatabase;
    appMetadata?: Record<string, unknown>;
    onRejectedOutput?: (diagnostic: AssistedImportRejectedDiagnostic) => void | Promise<void>;
  } = {},
) {
  const availability = assistedImportAvailability(userId, { appMetadata: dependencies.appMetadata });
  if (!availability.enabled) throw new AssistedImportError("unavailable", availability.reason!, 503);
  const sourceBytes = Buffer.byteLength(request.sourceText, "utf8");
  if (sourceBytes > WRITER_ASSISTED_IMPORT_MAX_BYTES) {
    throw new AssistedImportError("too_large", "El origen supera el límite de 2 MiB.", 413);
  }
  const cleanTitle = request.title.trim().slice(0, 160);
  if (!cleanTitle) throw new AssistedImportError("invalid", "Escribe un título para el nuevo guion.", 400);
  const staging = prepareAssistedImportStaging({ ...request, title: cleanTitle });
  if (staging.source.words < 1) {
    throw new AssistedImportError("invalid", "El borrador no contiene texto para importar.", 400);
  }
  if (staging.source.words > WRITER_ASSISTED_IMPORT_MAX_WORDS) {
    throw new AssistedImportError("too_many_words", "El borrador supera el límite de 30,000 palabras.", 413);
  }
  const sourceTokens = countAssistedImportTokens(staging.source.extractedText);
  if (sourceTokens > WRITER_ASSISTED_IMPORT_MAX_SOURCE_TOKENS) {
    throw new AssistedImportError("too_many_tokens", "El borrador supera el límite de 80,000 tokens de origen.", 413);
  }

  const preflight = dryRunAssistedImport(staging, WRITER_ASSISTED_IMPORT_MAX_AUTHORIZED_COST_MICRO_USD);
  const batches = preflight.batches;
  const pipelinePlan = preflight.plan;
  const basePlanCost = pipelinePlan.base.costMicrousd;
  const baseBudgetDecision = preflight.baseBudgetDecision;
  if (basePlanCost > 0 && !baseBudgetDecision.allowed) {
    throw new AssistedImportError("budget_plan", "Este borrador supera la capacidad de la importación asistida. Puedes conservar el origen e importarlo sin IA.", 409);
  }
  const db = dependencies.db ?? createAdminClient();
  const sourceHash = sha256(request.sourceText);
  const optionsHash = sha256(JSON.stringify({
    title: cleanTitle,
    format: request.format,
    fileName: request.fileName ?? null,
    models: [TERRA_MODEL, SOL_MODEL],
    version: WRITER_ASSISTED_IMPORT_VERSION,
    reasoning: { terra: "none", sol: "low" },
    basePlanCost,
  }));
  // Preserve the RPC's real policy code. A call, account or global limit is
  // not evidence that the source itself is too large for the planned base.
  const reserved = await rpcJson(db, "writer_reserve_assisted_import", {
    p_user_id: userId,
    p_operation_id: request.operationId,
    p_source_hash: sourceHash,
    p_options_hash: optionsHash,
    p_source_format: request.format,
    p_title: cleanTitle,
    p_source_words: staging.source.words,
    p_source_tokens: sourceTokens,
    p_source_bytes: sourceBytes,
    p_model: PIPELINE_MODEL,
    p_maximum_plan_cost_microusd: Math.max(1, basePlanCost),
  });
  const operationBudget = positiveInteger(reserved.operation_budget_microusd);
  if (operationBudget < WRITER_ASSISTED_IMPORT_MAX_COST_MICRO_USD || basePlanCost > operationBudget) {
    throw new AssistedImportError("budget_plan", "Esta operación no tiene presupuesto suficiente para la etapa asistida inicial.", 409);
  }
  const operationId = String(reserved.id ?? request.operationId);
  if (reserved.status === "completed" && typeof reserved.script_id === "string") {
    const persisted = await loadPersistedAnalysisSummary(db, reserved.script_id);
    return {
      script: { id: reserved.script_id }, reused: true,
      observations: persisted.observations, identities: persisted.identities,
      analysisStatus: persisted.status, recoverySkippedReason: persisted.recoverySkippedReason,
      usage: operationUsage(reserved),
    };
  }
  if (reserved.reused === true) {
    throw new AssistedImportError("active", reserved.status === "uncertain"
      ? "La operación anterior requiere conciliación y no se repetirá automáticamente."
      : "Esta misma importación ya está en curso o terminó con un fallo registrado.", 409);
  }

  const provider = dependencies.provider ?? openAiProvider;
  const terraResults = new Map<number, AssistedImportModelResult | null>();
  const failedCalls: Array<{ stage: AssistedImportStage; code: string; path: string }> = [];
  await mapConcurrent(batches.filter((batch) => batch.candidates.length > 0), WRITER_ASSISTED_IMPORT_MAX_CONCURRENCY, async (batch) => {
    const outcome = await executePipelineCall({
      db, userId, operationId, batchIndex: batch.index, batch, stage: "terra", model: TERRA_MODEL,
      triggers: [], provider, signal: request.signal, onRejectedOutput: dependencies.onRejectedOutput,
    });
    terraResults.set(batch.index, outcome.result);
    if (!outcome.result) failedCalls.push({ stage: "terra", code: outcome.failureCode!, path: outcome.failurePath! });
  }).catch(async (cause) => {
    const error = cause instanceof AssistedImportError ? cause : new AssistedImportError("provider_error", "No se pudo completar la organización asistida.", 502);
    await failOperation(db, userId, operationId, error.code === "provider_uncertain" ? "uncertain" : "failed", error.code);
    throw error;
  });

  const recovery = planAssistedImportRecovery(batches, terraResults);
  const recoveryBudgetRequested = recovery.items.reduce((total, item) => {
    const prior = terraResults.get(item.batch.index) ?? null;
    const plan = assistedImportRequestBreakdown(recoveryBatch(item), "sol", item.triggers, prior);
    return total + estimateAssistedImportMaximumCostMicrousd(SOL_MODEL, plan.estimatedInputTokens, plan.maxOutputTokens);
  }, 0);
  const solResults = await mapConcurrent(recovery.items, WRITER_ASSISTED_IMPORT_MAX_CONCURRENCY, async (item, recoveryIndex) => {
    const prior = terraResults.get(item.batch.index) ?? null;
    const outcome = await executePipelineCall({
      db, userId, operationId, batchIndex: 20 + recoveryIndex, batch: recoveryBatch(item), stage: "sol", model: SOL_MODEL,
      triggers: item.triggers, priorResult: prior, provider, signal: request.signal,
      onRejectedOutput: dependencies.onRejectedOutput,
    });
    if (!outcome.result && !outcome.skippedReason) {
      failedCalls.push({ stage: "sol", code: outcome.failureCode!, path: outcome.failurePath! });
    }
    return outcome;
  }).catch(async (cause) => {
    const error = cause instanceof AssistedImportError ? cause : new AssistedImportError("provider_error", "No se pudo completar la recuperación asistida.", 502);
    await failOperation(db, userId, operationId, error.code === "provider_uncertain" ? "uncertain" : "failed", error.code);
    throw error;
  });
  const recoverySkippedReason: AssistedImportRecoverySkippedReason | null = solResults.find(
    (outcome) => outcome.skippedReason,
  )?.skippedReason ?? null;

  const modelResults = [...terraResults.values(), ...solResults.map((outcome) => outcome.result)]
    .filter((result): result is AssistedImportModelResult => Boolean(result));
  if (batches.length > 0 && modelResults.length === 0) {
    const exactFailure = failedCalls.map((failure) => `${failure.stage}:${failure.code}@${failure.path}`).join("|").slice(0, 240)
      || "provider_invalid_output";
    await failOperation(db, userId, operationId, "failed", exactFailure);
    throw new AssistedImportError("provider_invalid_output", `La asistencia no produjo un resultado utilizable (${exactFailure}). Puedes importar el borrador sin IA.`, 502);
  }
  const validationIssues = modelResults.flatMap((result) => result.validationIssues);
  const analysisStatus = determineAssistedImportAnalysisStatus({
    incomplete: failedCalls.length > 0 || recovery.partial || Boolean(recoverySkippedReason),
    validationIssueCount: validationIssues.length,
    usableResultCount: modelResults.reduce((count, result) => count
      + result.classifications.length + result.evidence.length + result.observations.length, 0),
  });

  const reconciled = reconcileAssistedImport(staging, modelResults);
  try {
    assertAssistedImportPreservation(staging, reconciled.document);
  } catch {
    await failOperation(db, userId, operationId, "failed", "integrity_conflict");
    throw new AssistedImportError("integrity_conflict", "La verificación de integridad del documento falló; no se creó ningún guion.", 502);
  }
  const finalized = await rpcJson(db, "writer_finalize_assisted_import", {
    p_user_id: userId,
    p_operation_id: operationId,
    p_title: cleanTitle,
    p_document: reconciled.document,
    p_schema_version: reconciled.schemaVersion,
    p_analysis_version: assistedImportAnalysisVersion({
      version: WRITER_ASSISTED_IMPORT_VERSION,
      status: analysisStatus,
      recoverySkippedReason,
    }),
    p_model: batches.length ? (solResults.some((outcome) => outcome.executed) ? PIPELINE_MODEL : TERRA_MODEL) : null,
    p_identities: reconciled.identities,
    p_evidence: reconciled.evidence,
    p_observations: reconciled.observations,
  }).catch(async (cause) => {
    const error = normalizeDatabaseError(cause);
    await failOperation(db, userId, operationId, "failed", error.code);
    throw error;
  });
  const operation = await loadOperation(db, operationId);
  const recoveryCostActual = solResults.reduce((total, outcome) => total + (outcome.actualCostMicrousd ?? 0), 0);
  const budget = {
    baseBudgetReservedMicrousd: basePlanCost,
    baseCostActualMicrousd: Math.max(0, positiveInteger(operation?.actual_cost_microusd) - recoveryCostActual),
    recoveryRequired: recovery.items.length > 0,
    recoveryBudgetRequestedMicrousd: recoveryBudgetRequested,
    recoveryExecuted: solResults.some((outcome) => outcome.executed),
    recoverySkippedReason,
    totalCostMicrousd: positiveInteger(operation?.actual_cost_microusd),
  };
  console.info("writer_assisted_import_budget", { operationId, ...budget });
  return {
    script: { id: finalized.id, revision: Number(finalized.revision ?? 1) },
    reused: Boolean(finalized.reused),
    observations: reconciled.observations.length,
    identities: reconciled.identities.length,
    blocks: reconciled.document.content.length,
    scenes: reconciled.document.content.filter((block) => block.attrs.kind === "sceneHeading").length,
    analysisStatus,
    recoverySkippedReason,
    coverage: {
      segments: batches.length,
      terraSegments: terraResults.size,
      solSegments: solResults.filter((outcome) => outcome.executed).length,
      skippedRecoverySegments: recovery.skippedBatchIndexes.length + solResults.filter((outcome) => outcome.skippedReason).length,
    },
    budget,
    usage: operationUsage(operation ?? {}),
  };
}

export class AssistedImportError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

class ProviderFailure extends Error {
  constructor(
    public ambiguous: boolean,
    public usage: ProviderUsage | undefined,
    public code: string,
    public path = "$",
    public requestId?: string,
    public rejectedOutput?: unknown,
  ) {
    super(code);
  }
}

type PipelineCallInput = {
  db: ImportDatabase;
  userId: string;
  operationId: string;
  batchIndex: number;
  batch: AssistedImportBatch;
  stage: AssistedImportStage;
  model: AssistedImportModel;
  triggers: AssistedImportRecoveryTrigger[];
  priorResult?: AssistedImportModelResult | null;
  provider: AssistedImportProvider;
  signal?: AbortSignal;
  onRejectedOutput?: (diagnostic: AssistedImportRejectedDiagnostic) => void | Promise<void>;
};

type PipelineCallOutcome = {
  result: AssistedImportModelResult | null;
  failureCode?: string;
  failurePath?: string;
  executed?: boolean;
  actualCostMicrousd?: number;
  skippedReason?: AssistedImportRecoverySkippedReason;
};

async function executePipelineCall(input: PipelineCallInput): Promise<PipelineCallOutcome> {
  const prompt = assistedImportProviderInput(input.batch, input.stage, input.triggers, input.priorResult);
  const requestHash = sha256(JSON.stringify({
    version: WRITER_ASSISTED_IMPORT_VERSION,
    stage: input.stage,
    model: input.model,
    reasoning: assistedImportReasoning(input.model),
    prompt,
  }));
  const existing = await loadBatch(input.db, input.operationId, input.batchIndex);
  if (existing?.status === "completed" && existing.request_hash === requestHash) {
    return {
      result: validateAssistedImportModelResult(checkpointResult(existing.result, input.stage, input.model), input.batch),
      executed: true,
      actualCostMicrousd: checkpointActualCost(existing.result),
    };
  }
  if (existing && existing.status !== "failed") {
    throw new AssistedImportError("reconciliation_required", "Un lote anterior quedó pendiente de conciliación; no se repetirá automáticamente.", 409);
  }
  const requestPlan = assistedImportRequestBreakdown(input.batch, input.stage, input.triggers, input.priorResult);
  const maxOutputTokens = requestPlan.maxOutputTokens;
  const maxCost = estimateAssistedImportMaximumCostMicrousd(
    input.model, requestPlan.estimatedInputTokens, maxOutputTokens,
  );
  let call: Record<string, unknown>;
  try {
    call = await rpcJson(input.db, "writer_reserve_assisted_import_call", {
      p_user_id: input.userId,
      p_operation_id: input.operationId,
      p_batch_index: input.batchIndex,
      p_request_hash: requestHash,
      p_max_cost_microusd: maxCost,
    });
  } catch (cause) {
    const skippedReason = input.stage === "sol" && cause instanceof AssistedImportError
      ? recoverySkippedReasonForErrorCode(cause.code)
      : null;
    if (skippedReason) return { result: null, executed: false, skippedReason };
    throw cause;
  }
  if (call.status === "completed") {
    return {
      result: validateAssistedImportModelResult(checkpointResult(call.result, input.stage, input.model), input.batch),
      executed: true,
      actualCostMicrousd: checkpointActualCost(call.result),
    };
  }
  try {
    const response = await input.provider({
      operationId: input.operationId,
      batch: input.batch,
      requestHash,
      maxOutputTokens,
      model: input.model,
      reasoning: assistedImportReasoning(input.model),
      stage: input.stage,
      triggers: input.triggers,
      priorResult: input.priorResult,
      signal: input.signal,
    });
    let validated: AssistedImportModelResult;
    try {
      validated = validateAssistedImportModelResult(expandAssistedImportTransportResult(response.result, input.batch), input.batch);
    } catch (cause) {
      const validation = cause instanceof AssistedImportValidationError
        ? cause
        : new AssistedImportValidationError("invalid_schema", "$", "Respuesta estructural inválida.");
      throw new ProviderFailure(false, response.usage, validation.code, validation.path, response.requestId, response.result);
    }
    if (validated.validationIssues.length) {
      const first = validated.validationIssues[0];
      await input.onRejectedOutput?.({
        stage: input.stage, model: input.model, requestId: response.requestId,
        code: first.code, path: first.path, usage: response.usage, rejectedOutput: response.result,
      });
    }
    const actualCost = calculateAssistedImportCostMicrousd(input.model, response.usage);
    await settleCall(input.db, input.userId, input.operationId, input.batchIndex, "completed", {
      checkpointVersion: 1,
      stage: input.stage,
      model: input.model,
      pipelineVersion: WRITER_ASSISTED_IMPORT_VERSION,
      triggers: input.triggers,
      latencyMs: response.latencyMs,
      actualCostMicrousd: actualCost,
      maximumCostMicrousd: maxCost,
      result: expandAssistedImportTransportResult(response.result, input.batch),
      validationIssues: validated.validationIssues,
    }, response.usage, actualCost);
    return { result: validated, executed: true, actualCostMicrousd: actualCost };
  } catch (cause) {
    const failure = cause instanceof ProviderFailure ? cause : new ProviderFailure(true, undefined, "provider_request_failed");
    const usage = failure.usage ?? emptyUsage();
    const cost = failure.ambiguous ? maxCost : calculateAssistedImportCostMicrousd(input.model, usage);
    await input.onRejectedOutput?.({
      stage: input.stage, model: input.model, requestId: failure.requestId,
      code: failure.code, path: failure.path, usage, rejectedOutput: failure.rejectedOutput,
    });
    await settleCall(input.db, input.userId, input.operationId, input.batchIndex, failure.ambiguous ? "uncertain" : "failed", {
      checkpointVersion: 1,
      stage: input.stage,
      model: input.model,
      pipelineVersion: WRITER_ASSISTED_IMPORT_VERSION,
      diagnostic: { code: failure.code, path: failure.path, requestId: failure.requestId ?? null },
    }, usage, cost);
    if (!failure.ambiguous) return { result: null, failureCode: failure.code, failurePath: failure.path, executed: true, actualCostMicrousd: cost };
    throw new AssistedImportError("provider_uncertain", "La llamada quedó en estado incierto y no se repetirá automáticamente.", 409);
  }
}

async function openAiProvider(input: Parameters<AssistedImportProvider>[0]): ReturnType<AssistedImportProvider> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 90_000 });
  const started = Date.now();
  let response;
  try {
    response = await client.responses.create({
      model: input.model,
      reasoning: { effort: input.reasoning },
      store: false,
      max_output_tokens: input.maxOutputTokens,
      instructions: input.stage === "terra" ? WRITER_ASSISTED_IMPORT_TERRA_INSTRUCTIONS : WRITER_ASSISTED_IMPORT_SOL_INSTRUCTIONS,
      input: assistedImportProviderInput(input.batch, input.stage, input.triggers, input.priorResult),
      text: {
        format: {
          type: "json_schema",
          name: "writer_import_analysis",
          strict: true,
          schema: WRITER_ASSISTED_IMPORT_OUTPUT_SCHEMA,
        },
      },
    }, {
      headers: { "Idempotency-Key": `writer-import-${input.operationId}-${input.batch.index}-${input.requestHash.slice(0, 16)}` },
      signal: input.signal,
    });
  } catch (cause) {
    const status = isRecord(cause) && typeof cause.status === "number" ? cause.status : 0;
    throw new ProviderFailure(status === 0 || status >= 500, undefined, "provider_request_failed");
  }
  const usage = readUsage(response.usage);
  const requestId = isRecord(response) && typeof response._request_id === "string" ? response._request_id : undefined;
  if (response.status !== "completed" || !response.output_text) {
    const incompleteReason = response.status === "incomplete" && isRecord(response.incomplete_details)
      && typeof response.incomplete_details.reason === "string"
      ? response.incomplete_details.reason.replace(/[^a-z0-9_-]/giu, "_").slice(0, 64)
      : null;
    throw new ProviderFailure(
      false,
      usage,
      incompleteReason ? `provider_incomplete_${incompleteReason}` : "provider_refusal",
      incompleteReason ? "$.incomplete_details.reason" : "$",
      requestId,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    throw new ProviderFailure(false, usage, "provider_invalid_json", "$", requestId, response.output_text.slice(0, 2_000));
  }
  return { result: parsed, usage, latencyMs: Date.now() - started, requestId };
}

function checkpointResult(value: unknown, stage: AssistedImportStage, model: AssistedImportModel) {
  if (isRecord(value) && value.checkpointVersion === 1 && value.stage === stage && value.model === model && "result" in value) {
    return value.result;
  }
  throw new AssistedImportValidationError("integrity_conflict", "$", "El checkpoint no coincide con la etapa y modelo actuales.");
}

function checkpointActualCost(value: unknown) {
  return isRecord(value) ? positiveInteger(value.actualCostMicrousd) : 0;
}

function readUsage(value: unknown): ProviderUsage {
  if (!isRecord(value)) return emptyUsage();
  const inputDetails = isRecord(value.input_tokens_details) ? value.input_tokens_details : {};
  const outputDetails = isRecord(value.output_tokens_details) ? value.output_tokens_details : {};
  return {
    inputTokens: positiveInteger(value.input_tokens),
    cachedInputTokens: positiveInteger(inputDetails.cached_tokens),
    outputTokens: positiveInteger(value.output_tokens),
    reasoningTokens: positiveInteger(outputDetails.reasoning_tokens),
  };
}

function emptyUsage(): ProviderUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
}

async function settleCall(
  db: ImportDatabase,
  userId: string,
  operationId: string,
  batchIndex: number,
  status: "completed" | "failed" | "uncertain",
  result: unknown,
  usage: ProviderUsage,
  actualCost: number,
) {
  const response = await db.rpc("writer_settle_assisted_import_call", {
    p_user_id: userId,
    p_operation_id: operationId,
    p_batch_index: batchIndex,
    p_status: status,
    p_result: result,
    p_input_tokens: usage.inputTokens,
    p_cached_input_tokens: usage.cachedInputTokens,
    p_output_tokens: usage.outputTokens,
    p_reasoning_tokens: usage.reasoningTokens,
    p_actual_cost_microusd: actualCost,
  });
  if (response.error) throw normalizeDatabaseError(response.error);
}

async function failOperation(db: ImportDatabase, userId: string, operationId: string, status: "failed" | "cancelled" | "uncertain", code: string) {
  await db.rpc("writer_fail_assisted_import", {
    p_user_id: userId,
    p_operation_id: operationId,
    p_status: status,
    p_error_code: code,
  });
}

async function loadBatch(db: ImportDatabase, operationId: string, index: number) {
  const response = await db.from("writer_assisted_import_batches")
    .select("request_hash,status,result")
    .eq("operation_id", operationId).eq("batch_index", index).maybeSingle();
  if (response.error) throw normalizeDatabaseError(response.error);
  return response.data as { request_hash: string; status: string; result: unknown } | null;
}

async function loadOperation(db: ImportDatabase, operationId: string) {
  const response = await db.from("writer_assisted_imports")
    .select("provider_calls,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,actual_cost_microusd,operation_budget_microusd,reserved_cost_microusd")
    .eq("id", operationId).maybeSingle();
  return response.error ? null : response.data;
}

async function loadPersistedAnalysisSummary(
  db: ImportDatabase,
  scriptId: string,
): Promise<{
  status: AssistedImportAnalysisStatus;
  identities: number;
  observations: number;
  recoverySkippedReason: AssistedImportRecoverySkippedReason | null;
}> {
  const response = await db.from("writer_import_analyses")
    .select("analysis_version,identities,observations")
    .eq("script_id", scriptId).maybeSingle();
  if (response.error || !isRecord(response.data) || typeof response.data.analysis_version !== "string") {
    return { status: "partial", identities: 0, observations: 0, recoverySkippedReason: null };
  }
  const version = parseAssistedImportAnalysisVersion(response.data.analysis_version);
  return {
    status: version.status,
    recoverySkippedReason: version.recoverySkippedReason,
    identities: Array.isArray(response.data.identities) ? response.data.identities.length : 0,
    observations: Array.isArray(response.data.observations) ? response.data.observations.length : 0,
  };
}

async function rpcJson(db: ImportDatabase, name: string, args: Record<string, unknown>) {
  const response = await db.rpc(name, args);
  if (response.error) throw normalizeDatabaseError(response.error);
  if (!isRecord(response.data)) throw new AssistedImportError("database_contract", "El control de importación devolvió una respuesta inválida.", 500);
  return response.data;
}

function normalizeDatabaseError(cause: unknown) {
  const known = assistedImportDatabaseErrorDescriptor(cause);
  if (known) return new AssistedImportError(known.code, known.message, known.status);
  return cause instanceof AssistedImportError ? cause : new AssistedImportError("database_error", "No se pudo reservar o finalizar la importación.", 500);
}

function operationUsage(value: Record<string, unknown>) {
  return {
    calls: positiveInteger(value.provider_calls),
    inputTokens: positiveInteger(value.input_tokens),
    cachedInputTokens: positiveInteger(value.cached_input_tokens),
    outputTokens: positiveInteger(value.output_tokens),
    reasoningTokens: positiveInteger(value.reasoning_tokens),
    costUsd: positiveInteger(value.actual_cost_microusd) / 1_000_000,
  };
}

function limits() {
  return {
    maxBytes: WRITER_ASSISTED_IMPORT_MAX_BYTES,
    maxWords: WRITER_ASSISTED_IMPORT_MAX_WORDS,
    maxSourceTokens: WRITER_ASSISTED_IMPORT_MAX_SOURCE_TOKENS,
    completedPerAccount: 1,
  };
}

function unavailable(reason: string): AssistedImportAvailability {
  return { enabled: false, reason, limits: limits() };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function activeQaGrantOperationId(value: unknown) {
  if (!Array.isArray(value)) return null;
  const now = Date.now();
  const grant = value.find((item) => isRecord(item)
    && item.status === "active"
    && typeof item.operation_id === "string"
    && typeof item.expires_at === "string"
    && Date.parse(item.expires_at) > now);
  return isRecord(grant) && typeof grant.operation_id === "string" ? grant.operation_id : null;
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, task: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let firstError: unknown;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length && !firstError) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await task(items[index], index);
      } catch (cause) {
        firstError ??= cause;
      }
    }
  }));
  if (firstError) throw firstError;
  return results;
}
