import "server-only";

import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateWriterDocument } from "./document";
import {
  WRITER_SCRIPT_ASSISTANT_MODEL,
  WRITER_SCRIPT_ASSISTANT_VERSION,
  findWriterSceneSource,
  validateWriterSceneAnalysisOutput,
  writerAssistantOutputSchema,
  writerSceneSourceHash,
  type WriterSceneAnalysisPayload,
  type WriterSceneSource,
} from "./script-assistant";
import {
  calculateWriterSceneAnalysisCost,
  countWriterSceneAnalysisTokens,
  estimateWriterSceneAnalysisMaximumCost,
  type WriterSceneAnalysisUsage,
} from "./script-assistant-accounting";

const MAX_OUTPUT_TOKENS = 1_200;
const GLOBAL_BUDGET_MICRO_USD = 10_000_000;

export const WRITER_SCENE_ASSISTANT_INSTRUCTIONS = `Eres Script Assistant de FILMATTA. Analiza una sola escena de guion, sin reescribirla ni proponer texto nuevo.
Devuelve Objective, Obstacle y Change de lo que sucede DURANTE la escena. Usa null cuando el texto no lo sostenga.
Objective no es tema ni emoción general. Obstacle es lo que dificulta ese objetivo. Change es un cambio narrativo entre inicio y final.
Puedes devolver 0–3 observaciones. Prioriza preguntas neutrales y útiles. No digas "debes", no puntúes calidad, no inventes hechos y no sugieras escenas, diálogos o acciones.
Cada evidencia debe referir únicamente a un blockId proporcionado. No calcules offsets. Una escena atmosférica puede tener los tres valores null.`;

export type WriterSceneAnalysisProvider = (input: {
  operationId: string;
  requestHash: string;
  scene: WriterSceneSource;
  acceptedCharacters: Array<{ identityId: string; name: string }>;
  maxOutputTokens: number;
  signal?: AbortSignal;
}) => Promise<{
  result: unknown;
  usage: WriterSceneAnalysisUsage;
  latencyMs: number;
  requestId?: string;
}>;

type Database = ReturnType<typeof createAdminClient>;

export class WriterSceneAssistantError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function executeWriterSceneAnalysis(
  userId: string,
  request: { scriptId: string; sceneId: string; sourceHash: string; operationId?: string; signal?: AbortSignal },
  dependencies: { db?: Database; provider?: WriterSceneAnalysisProvider } = {},
) {
  const db = dependencies.db ?? createAdminClient();
  const scriptResult = await db.from("writer_scripts").select("document").eq("id", request.scriptId).eq("owner_id", userId).maybeSingle();
  if (scriptResult.error || !scriptResult.data) throw new WriterSceneAssistantError("not_found", "Guion no encontrado.", 404);
  const validated = validateWriterDocument(scriptResult.data.document);
  if (!validated.ok) throw new WriterSceneAssistantError("invalid_document", "El guion guardado no es compatible.", 409);
  const scene = findWriterSceneSource(validated.document, request.sceneId);
  if (!scene) throw new WriterSceneAssistantError("scene_not_found", "La escena ya no existe.", 404);
  const sourceHash = await writerSceneSourceHash(scene);
  if (sourceHash !== request.sourceHash) {
    throw new WriterSceneAssistantError("stale", "La escena cambió. Espera a que se guarde antes de analizarla.", 409);
  }

  const acceptedCharacters = scene.blocks.flatMap((block) => block.kind === "character" && block.text.trim()
    ? [{ identityId: block.id, name: block.text.trim().replace(/\s+/gu, " ") }]
    : []);
  const providerInput = writerSceneProviderInput(scene, acceptedCharacters);
  const requestHash = sha256(JSON.stringify({
    version: WRITER_SCRIPT_ASSISTANT_VERSION,
    model: WRITER_SCRIPT_ASSISTANT_MODEL,
    reasoning: "none",
    instructions: WRITER_SCENE_ASSISTANT_INSTRUCTIONS,
    input: providerInput,
  }));
  const maximumCost = estimateWriterSceneAnalysisMaximumCost(
    countWriterSceneAnalysisTokens(`${WRITER_SCENE_ASSISTANT_INSTRUCTIONS}\n${providerInput}`),
    MAX_OUTPUT_TOKENS,
  );
  const operationId = request.operationId ?? randomUUID();
  const reserved = await rpcJson(db, "writer_reserve_scene_analysis", {
    p_user_id: userId,
    p_operation_id: operationId,
    p_script_id: request.scriptId,
    p_scene_id: request.sceneId,
    p_source_hash: sourceHash,
    p_analysis_version: WRITER_SCRIPT_ASSISTANT_VERSION,
    p_model: WRITER_SCRIPT_ASSISTANT_MODEL,
    p_request_hash: requestHash,
    p_max_cost_microusd: maximumCost,
    p_global_budget_microusd: GLOBAL_BUDGET_MICRO_USD,
  });

  if (reserved.status === "fresh") {
    const analysis = await loadAnalysis(db, userId, request.scriptId, request.sceneId, sourceHash);
    return { analysis, cached: true, providerCalls: 0, costMicrousd: 0, latencyMs: 0 };
  }
  if (reserved.status === "analyzing") return { analysis: null, cached: false, pending: true, providerCalls: 0, costMicrousd: 0, latencyMs: 0 };
  if (reserved.status === "uncertain") throw new WriterSceneAssistantError("uncertain", "Una llamada anterior sigue pendiente de conciliación segura.", 409);
  if (reserved.status !== "reserved") throw new WriterSceneAssistantError("reservation", "No pudimos preparar el análisis.", 409);

  let providerResponse: Awaited<ReturnType<WriterSceneAnalysisProvider>>;
  try {
    providerResponse = await (dependencies.provider ?? openAiWriterSceneProvider)({
      operationId,
      requestHash,
      scene,
      acceptedCharacters,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      signal: request.signal,
    });
  } catch (cause) {
    const ambiguous = cause instanceof ProviderRequestFailure ? cause.ambiguous : true;
    const usage = cause instanceof ProviderRequestFailure ? cause.usage : emptyUsage();
    const actualCost = ambiguous ? maximumCost : calculateWriterSceneAnalysisCost(usage);
    await settle(db, userId, operationId, ambiguous ? "uncertain" : "failed", null, "provider_request_failed", usage, actualCost);
    console.info("writer_scene_analysis", { operationId, sceneId: request.sceneId, sourceHash, model: WRITER_SCRIPT_ASSISTANT_MODEL, status: ambiguous ? "uncertain" : "failed", costMicrousd: actualCost });
    throw new WriterSceneAssistantError("provider", "No pudimos analizar esta escena ahora.", 503);
  }

  let payload: WriterSceneAnalysisPayload;
  try {
    payload = validateWriterSceneAnalysisOutput(providerResponse.result, scene, sourceHash);
  } catch {
    const actualCost = calculateWriterSceneAnalysisCost(providerResponse.usage);
    await settle(db, userId, operationId, "failed", null, "provider_invalid_output", providerResponse.usage, actualCost);
    console.info("writer_scene_analysis", { operationId, sceneId: request.sceneId, sourceHash, model: WRITER_SCRIPT_ASSISTANT_MODEL, status: "failed", costMicrousd: actualCost });
    throw new WriterSceneAssistantError("invalid_output", "No pudimos validar el análisis de esta escena.", 503);
  }

  const actualCost = calculateWriterSceneAnalysisCost(providerResponse.usage);
  await settle(db, userId, operationId, "completed", payload, null, providerResponse.usage, actualCost);
  const analysis = await loadAnalysis(db, userId, request.scriptId, request.sceneId, sourceHash);
  console.info("writer_scene_analysis", {
    operationId,
    sceneId: request.sceneId,
    sourceHash,
    model: WRITER_SCRIPT_ASSISTANT_MODEL,
    status: "completed",
    usage: providerResponse.usage,
    costMicrousd: actualCost,
    latencyMs: providerResponse.latencyMs,
  });
  return { analysis, cached: false, providerCalls: 1, costMicrousd: actualCost, latencyMs: providerResponse.latencyMs };
}

export function writerSceneProviderInput(
  scene: WriterSceneSource,
  acceptedCharacters: Array<{ identityId: string; name: string }> = [],
) {
  return JSON.stringify({
    sceneId: scene.sceneId,
    heading: scene.heading,
    blocks: scene.blocks.map((block) => ({ blockId: block.id, type: block.kind, text: block.text })),
    acceptedCharacters,
  });
}

async function openAiWriterSceneProvider(input: Parameters<WriterSceneAnalysisProvider>[0]) {
  if (!process.env.OPENAI_API_KEY) throw new ProviderRequestFailure(false, emptyUsage());
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 60_000 });
  const started = Date.now();
  let response;
  try {
    response = await client.responses.create({
      model: WRITER_SCRIPT_ASSISTANT_MODEL,
      reasoning: { effort: "none" },
      store: false,
      max_output_tokens: input.maxOutputTokens,
      instructions: WRITER_SCENE_ASSISTANT_INSTRUCTIONS,
      input: writerSceneProviderInput(input.scene, input.acceptedCharacters),
      text: {
        format: {
          type: "json_schema",
          name: "writer_scene_analysis",
          strict: true,
          schema: writerAssistantOutputSchema(),
        },
      },
    }, {
      headers: { "Idempotency-Key": `writer-scene-${input.operationId}-${input.requestHash.slice(0, 16)}` },
      signal: input.signal,
    });
  } catch (cause) {
    const status = isRecord(cause) && typeof cause.status === "number" ? cause.status : 0;
    throw new ProviderRequestFailure(status === 0 || status >= 500, emptyUsage());
  }
  const usage = readUsage(response.usage);
  if (response.status !== "completed" || !response.output_text) throw new ProviderRequestFailure(false, usage);
  try {
    return {
      result: JSON.parse(response.output_text),
      usage,
      latencyMs: Date.now() - started,
      requestId: typeof response._request_id === "string" ? response._request_id : undefined,
    };
  } catch {
    throw new ProviderRequestFailure(false, usage);
  }
}

class ProviderRequestFailure extends Error {
  constructor(readonly ambiguous: boolean, readonly usage: WriterSceneAnalysisUsage) { super("provider_request_failed"); }
}

async function settle(
  db: Database,
  userId: string,
  operationId: string,
  status: "completed" | "partial" | "failed" | "uncertain",
  payload: WriterSceneAnalysisPayload | null,
  errorCode: string | null,
  usage: WriterSceneAnalysisUsage,
  actualCost: number,
) {
  await rpcJson(db, "writer_settle_scene_analysis", {
    p_user_id: userId,
    p_operation_id: operationId,
    p_status: status,
    p_payload: payload,
    p_error_code: errorCode,
    p_input_tokens: usage.inputTokens,
    p_cached_input_tokens: usage.cachedInputTokens,
    p_output_tokens: usage.outputTokens,
    p_reasoning_tokens: usage.reasoningTokens,
    p_actual_cost_microusd: actualCost,
  });
}

async function loadAnalysis(db: Database, userId: string, scriptId: string, sceneId: string, sourceHash: string) {
  const response = await db.from("writer_scene_analyses")
    .select("id,script_id,scene_id,source_hash,analysis_version,model,status,analysis_payload,error_code,updated_at")
    .eq("owner_id", userId).eq("script_id", scriptId).eq("scene_id", sceneId).eq("source_hash", sourceHash)
    .eq("analysis_version", WRITER_SCRIPT_ASSISTANT_VERSION).maybeSingle();
  if (response.error || !response.data) throw new WriterSceneAssistantError("storage", "No pudimos cargar el análisis guardado.", 500);
  return mapAnalysisRow(response.data);
}

export function mapAnalysisRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    scriptId: String(row.script_id),
    sceneId: String(row.scene_id),
    sourceHash: String(row.source_hash),
    analysisVersion: String(row.analysis_version),
    model: String(row.model),
    status: String(row.status),
    payload: row.analysis_payload,
    errorCode: row.error_code == null ? null : String(row.error_code),
    updatedAt: String(row.updated_at),
  };
}

async function rpcJson(db: Database, name: string, args: Record<string, unknown>) {
  const response = await db.rpc(name, args);
  if (response.error) {
    const message = response.error.message ?? "";
    if (message.includes("GLOBAL_BUDGET")) throw new WriterSceneAssistantError("budget", "El límite técnico de análisis está temporalmente agotado.", 503);
    if (message.includes("NOT_FOUND")) throw new WriterSceneAssistantError("not_found", "Guion no encontrado.", 404);
    throw new WriterSceneAssistantError("storage", "No pudimos guardar el análisis.", 500);
  }
  return response.data as Record<string, unknown>;
}

function readUsage(value: unknown): WriterSceneAnalysisUsage {
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

function emptyUsage(): WriterSceneAnalysisUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
}

function positiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

