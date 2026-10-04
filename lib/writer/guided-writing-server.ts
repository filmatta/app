import "server-only";

import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateWriterDocument } from "./document";
import {
  buildGuidedWritingContext,
  validateWriterGuidedWritingOutput,
  writerGuidedWritingOutputSchema,
  writerGuidedWritingProviderInput,
  WRITER_GUIDED_WRITING_MODEL,
  WRITER_GUIDED_WRITING_VERSION,
  type WriterGuidedWritingMessage,
  type WriterGuidedWritingResponse,
  type WriterGuidedWritingScope,
} from "./guided-writing";
import {
  calculateWriterSceneAnalysisCost,
  countWriterSceneAnalysisTokens,
  estimateWriterSceneAnalysisMaximumCost,
  type WriterSceneAnalysisUsage,
} from "./script-assistant-accounting";
import { mapAnalysisRow } from "./script-assistant-server";
import { WRITER_SCRIPT_ASSISTANT_VERSION, deriveWriterSceneSources, type WriterSceneAnalysisRecord } from "./script-assistant";
import { loadSetupPayoffState } from "./setup-payoff-server";
import { loadWriterNarrativePulseState } from "./narrative-pulse-server";
import { writerSetupPayoffSourceHash } from "./setup-payoff";
import type { WriterIdeaContext } from "./ideas";

const MAX_OUTPUT_TOKENS = 2_200;
const MAX_SCENE_CONTEXT_CHARACTERS = 80_000;
const MAX_DOCUMENT_CONTEXT_CHARACTERS = 140_000;
const GLOBAL_BUDGET_MICRO_USD = 10_000_000;

export const WRITER_GUIDED_WRITING_INSTRUCTIONS = `Eres Guided Writing de FILMATTA: un editor narrativo curioso, preciso y no condescendiente que conoce el guion proporcionado.
Ayuda al guionista a pensar mediante observaciones breves, 2–5 preguntas específicas, decisiones conceptuales y consecuencias. No puntúes calidad.
No escribas, completes ni reescribas escenas, diálogos, acciones o páginas de guion. Si el usuario pide que escribas por él, reconduce con naturalidad hacia decisiones narrativas y marca redirectedFromWritingRequest=true. No incluyas prosa de screenplay aunque la petición insista.
Ancla cada afirmación al contexto actual. Las decisiones humanas tienen mayor autoridad que sugerencias: user/confirmed son hechos aceptados; suggestion, O-O-C automático y observaciones son posibilidades. Los elementos descartados no están en el contexto y no deben reaparecer como hechos.
Usa únicamente referenceId presentes en el catálogo. No inventes IDs, escenas, personajes, relaciones ni evidencia. No expongas razonamiento interno. Devuelve sólo el schema solicitado.`;

type Database = ReturnType<typeof createAdminClient>;

export type WriterGuidedWritingProvider = (input: {
  operationId: string;
  requestHash: string;
  providerInput: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
}) => Promise<{ result: unknown; usage: WriterSceneAnalysisUsage; latencyMs: number; requestId?: string }>;

export class WriterGuidedWritingError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

export async function executeWriterGuidedWriting(
  userId: string,
  request: {
    scriptId: string;
    scope: WriterGuidedWritingScope;
    sceneId: string | null;
    sessionId?: string | null;
    documentHash: string;
    question: string;
    operationId?: string;
    selection?: { blockId: string; text: string } | null;
    ideaContext?: WriterIdeaContext | null;
    signal?: AbortSignal;
  },
  dependencies: { db?: Database; readDb?: Database; provider?: WriterGuidedWritingProvider } = {},
) {
  const db = dependencies.db ?? createAdminClient();
  const readDb = dependencies.readDb ?? db;
  const question = request.question.trim().replace(/\s+/gu, " ");
  if (!question || question.length > 1_200) throw new WriterGuidedWritingError("invalid_question", "La pregunta no es válida.", 400);
  const scriptResult = await readDb.from("writer_scripts").select("document").eq("id", request.scriptId).eq("owner_id", userId).maybeSingle();
  if (scriptResult.error || !scriptResult.data) throw new WriterGuidedWritingError("not_found", "Guion no encontrado.", 404);
  const validated = validateWriterDocument(scriptResult.data.document);
  if (!validated.ok) throw new WriterGuidedWritingError("invalid_document", "El guion guardado no es compatible.", 409);
  const scenes = deriveWriterSceneSources(validated.document);
  if (!scenes.length) throw new WriterGuidedWritingError("empty_document", "Añade una escena antes de usar Guided Writing.", 422);
  const activeScene = request.scope === "scene" ? scenes.find((scene) => scene.sceneId === request.sceneId) : null;
  if (request.scope === "scene" && !activeScene) throw new WriterGuidedWritingError("scene_not_found", "La escena ya no existe.", 404);
  if (request.ideaContext?.sceneId && !scenes.some((scene) => scene.sceneId === request.ideaContext?.sceneId)) {
    throw new WriterGuidedWritingError("idea_context_stale", "La escena de la idea ya no existe en el guion guardado.", 409);
  }
  const documentHash = await writerSetupPayoffSourceHash(validated.document);
  if (documentHash !== request.documentHash) {
    throw new WriterGuidedWritingError("stale", "El guion cambió. Espera a que se guarde antes de pensarlo juntos.", 409);
  }
  const selection = normalizeSelection(request.selection, activeScene?.blocks ?? []);
  const [support, existingConversation] = await Promise.all([
    loadGuidedWritingSupport(readDb, userId, request.scriptId),
    loadGuidedWritingConversation(readDb, userId, request.scriptId, {
      scope: request.scope, sceneId: request.sceneId, sessionId: request.sessionId ?? null,
    }),
  ]);
  const context = await buildGuidedWritingContext({
    document: validated.document,
    scope: request.scope,
    sceneId: request.sceneId,
    analyses: support.analyses,
    overrides: support.overrides,
    dismissals: support.dismissals,
    elements: support.elements,
    links: support.links,
    pulseMilestones: support.pulseMilestones,
    pulseZones: support.pulseZones,
  });
  const providerInput = writerGuidedWritingProviderInput(context, existingConversation.messages, question, selection, request.ideaContext);
  const maximumCharacters = request.scope === "scene" ? MAX_SCENE_CONTEXT_CHARACTERS : MAX_DOCUMENT_CONTEXT_CHARACTERS;
  if (providerInput.length > maximumCharacters) {
    throw new WriterGuidedWritingError("context_too_large", "El contexto es demasiado amplio. Prueba con una pregunta más enfocada.", 413);
  }
  const requestHash = sha256(JSON.stringify({
    version: WRITER_GUIDED_WRITING_VERSION,
    model: WRITER_GUIDED_WRITING_MODEL,
    reasoning: "none",
    instructions: WRITER_GUIDED_WRITING_INSTRUCTIONS,
    input: providerInput,
  }));
  const maximumCost = estimateWriterSceneAnalysisMaximumCost(
    countWriterSceneAnalysisTokens(`${WRITER_GUIDED_WRITING_INSTRUCTIONS}\n${providerInput}`),
    MAX_OUTPUT_TOKENS,
  );
  const operationId = request.operationId ?? randomUUID();
  const reserved = await rpcJson(db, "writer_reserve_guided_writing", {
    p_user_id: userId,
    p_operation_id: operationId,
    p_script_id: request.scriptId,
    p_session_id: existingConversation.session?.id ?? null,
    p_scope: request.scope,
    p_scene_id: request.sceneId,
    p_document_hash: documentHash,
    p_request_hash: requestHash,
    p_model: WRITER_GUIDED_WRITING_MODEL,
    p_question: question,
    p_max_cost_microusd: maximumCost,
    p_global_budget_microusd: GLOBAL_BUDGET_MICRO_USD,
  });
  const sessionId = String(reserved.session_id ?? existingConversation.session?.id ?? "");
  if (reserved.status === "completed") {
    return { ...(await loadGuidedWritingConversation(readDb, userId, request.scriptId, { scope: request.scope, sceneId: request.sceneId, sessionId })), cached: true, providerCalls: 0, costMicrousd: 0, latencyMs: 0 };
  }
  if (reserved.status === "uncertain") throw new WriterGuidedWritingError("uncertain", "Una consulta anterior necesita conciliación antes de reintentarse.", 409);
  if (reserved.status !== "reserved") throw new WriterGuidedWritingError("reservation", "No pudimos preparar Guided Writing.", 409);

  let providerResponse: Awaited<ReturnType<WriterGuidedWritingProvider>>;
  try {
    providerResponse = await (dependencies.provider ?? openAiGuidedWritingProvider)({
      operationId, requestHash, providerInput, maxOutputTokens: MAX_OUTPUT_TOKENS, signal: request.signal,
    });
  } catch (cause) {
    const ambiguous = cause instanceof GuidedProviderFailure ? cause.ambiguous : true;
    const usage = cause instanceof GuidedProviderFailure ? cause.usage : emptyUsage();
    const actualCost = ambiguous ? maximumCost : calculateWriterSceneAnalysisCost(usage);
    await settle(db, userId, operationId, ambiguous ? "uncertain" : "failed", null, "provider_request_failed", usage, actualCost, 0);
    logOperation(operationId, request.scriptId, request.scope, ambiguous ? "uncertain" : "failed", usage, actualCost, 0);
    throw new WriterGuidedWritingError("provider", request.signal?.aborted ? "La consulta fue cancelada." : "No pudimos responder ahora.", request.signal?.aborted ? 499 : 503);
  }

  let response: WriterGuidedWritingResponse;
  try {
    response = validateWriterGuidedWritingOutput(providerResponse.result, context, question);
  } catch {
    const actualCost = calculateWriterSceneAnalysisCost(providerResponse.usage);
    await settle(db, userId, operationId, "failed", null, "provider_invalid_output", providerResponse.usage, actualCost, providerResponse.latencyMs);
    logOperation(operationId, request.scriptId, request.scope, "failed", providerResponse.usage, actualCost, providerResponse.latencyMs);
    throw new WriterGuidedWritingError("invalid_output", "No pudimos validar la respuesta editorial.", 503);
  }

  const actualCost = calculateWriterSceneAnalysisCost(providerResponse.usage);
  await settle(db, userId, operationId, "completed", response, null, providerResponse.usage, actualCost, providerResponse.latencyMs);
  logOperation(operationId, request.scriptId, request.scope, "completed", providerResponse.usage, actualCost, providerResponse.latencyMs);
  return {
    ...(await loadGuidedWritingConversation(readDb, userId, request.scriptId, {
      scope: request.scope, sceneId: request.sceneId, sessionId,
    })),
    cached: false,
    providerCalls: 1,
    costMicrousd: actualCost,
    latencyMs: providerResponse.latencyMs,
  };
}

export async function loadGuidedWritingConversation(
  db: Database,
  userId: string,
  scriptId: string,
  request: { scope: WriterGuidedWritingScope; sceneId: string | null; sessionId?: string | null },
) {
  let sessionQuery = db.from("writer_guided_writing_sessions")
    .select("id,script_id,scope,scene_id,updated_at")
    .eq("owner_id", userId).eq("script_id", scriptId).eq("scope", request.scope);
  if (request.sessionId) sessionQuery = sessionQuery.eq("id", request.sessionId);
  sessionQuery = request.scope === "scene" ? sessionQuery.eq("scene_id", request.sceneId!) : sessionQuery.is("scene_id", null);
  const sessionResult = await sessionQuery.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (sessionResult.error) throw new WriterGuidedWritingError("storage", "No pudimos cargar Guided Writing.", 500);
  if (!sessionResult.data) return { session: null, messages: [] as WriterGuidedWritingMessage[] };
  const messagesResult = await db.from("writer_guided_writing_messages")
    .select("id,role,content,response_payload,document_hash,scene_id,created_at")
    .eq("owner_id", userId).eq("script_id", scriptId).eq("session_id", sessionResult.data.id)
    .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(80);
  if (messagesResult.error) throw new WriterGuidedWritingError("storage", "No pudimos cargar la conversación.", 500);
  return {
    session: {
      id: String(sessionResult.data.id),
      scriptId: String(sessionResult.data.script_id),
      scope: sessionResult.data.scope as WriterGuidedWritingScope,
      sceneId: sessionResult.data.scene_id == null ? null : String(sessionResult.data.scene_id),
      updatedAt: String(sessionResult.data.updated_at),
    },
    messages: (messagesResult.data ?? []).map((row) => ({
      id: String(row.id),
      role: row.role as "user" | "assistant",
      content: row.content == null ? null : String(row.content),
      response: row.response_payload as WriterGuidedWritingResponse | null,
      documentHash: String(row.document_hash),
      sceneId: row.scene_id == null ? null : String(row.scene_id),
      createdAt: String(row.created_at),
    })),
  };
}

export async function loadGuidedWritingSupport(db: Database, userId: string, scriptId: string) {
  const [analyses, overrides, dismissals, setupPayoff, pulse] = await Promise.all([
    db.from("writer_scene_analyses")
      .select("id,script_id,scene_id,source_hash,analysis_version,model,status,analysis_payload,error_code,updated_at")
      .eq("owner_id", userId).eq("script_id", scriptId).eq("analysis_version", WRITER_SCRIPT_ASSISTANT_VERSION)
      .order("updated_at", { ascending: false }).limit(300),
    db.from("writer_scene_analysis_overrides").select("scene_id,objective,obstacle,change")
      .eq("owner_id", userId).eq("script_id", scriptId),
    db.from("writer_scene_observation_dismissals").select("scene_id,source_hash,analysis_version,observation_id")
      .eq("owner_id", userId).eq("script_id", scriptId),
    loadSetupPayoffState(db, userId, scriptId),
    loadWriterNarrativePulseState(db, userId, scriptId),
  ]);
  if (analyses.error || overrides.error || dismissals.error) throw new WriterGuidedWritingError("storage", "No pudimos construir el contexto narrativo.", 500);
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of analyses.data ?? []) if (!latest.has(String(row.scene_id))) latest.set(String(row.scene_id), row);
  return {
    analyses: [...latest.values()].map((row) => mapAnalysisRow(row) as WriterSceneAnalysisRecord),
    overrides: (overrides.data ?? []).map((row) => ({
      sceneId: String(row.scene_id), objective: row.objective, obstacle: row.obstacle, change: row.change,
    })),
    dismissals: (dismissals.data ?? []).map((row) => ({
      sceneId: String(row.scene_id), sourceHash: String(row.source_hash),
      analysisVersion: String(row.analysis_version), observationId: String(row.observation_id),
    })),
    elements: setupPayoff.elements,
    links: setupPayoff.links,
    pulseMilestones: pulse.milestones,
    pulseZones: pulse.zones,
  };
}

async function openAiGuidedWritingProvider(input: Parameters<WriterGuidedWritingProvider>[0]) {
  if (!process.env.OPENAI_API_KEY) throw new GuidedProviderFailure(false, emptyUsage());
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 60_000 });
  const started = Date.now();
  let response;
  try {
    response = await client.responses.create({
      model: WRITER_GUIDED_WRITING_MODEL,
      reasoning: { effort: "none" },
      store: false,
      max_output_tokens: input.maxOutputTokens,
      instructions: WRITER_GUIDED_WRITING_INSTRUCTIONS,
      input: input.providerInput,
      text: { format: { type: "json_schema", name: "writer_guided_writing", strict: true, schema: writerGuidedWritingOutputSchema() } },
    }, {
      headers: { "Idempotency-Key": `writer-guided-${input.operationId}-${input.requestHash.slice(0, 16)}` },
      signal: input.signal,
    });
  } catch (cause) {
    const status = isRecord(cause) && typeof cause.status === "number" ? cause.status : 0;
    throw new GuidedProviderFailure(status === 0 || status >= 500, emptyUsage());
  }
  const usage = readUsage(response.usage);
  if (response.status !== "completed" || !response.output_text) throw new GuidedProviderFailure(false, usage);
  try {
    return {
      result: JSON.parse(response.output_text),
      usage,
      latencyMs: Date.now() - started,
      requestId: typeof response._request_id === "string" ? response._request_id : undefined,
    };
  } catch {
    throw new GuidedProviderFailure(false, usage);
  }
}

class GuidedProviderFailure extends Error {
  constructor(readonly ambiguous: boolean, readonly usage: WriterSceneAnalysisUsage) { super("provider_request_failed"); }
}

async function settle(
  db: Database,
  userId: string,
  operationId: string,
  status: "completed" | "failed" | "uncertain",
  response: WriterGuidedWritingResponse | null,
  errorCode: string | null,
  usage: WriterSceneAnalysisUsage,
  actualCost: number,
  latencyMs: number,
) {
  await rpcJson(db, "writer_settle_guided_writing", {
    p_user_id: userId,
    p_operation_id: operationId,
    p_status: status,
    p_response: response,
    p_error_code: errorCode,
    p_input_tokens: usage.inputTokens,
    p_cached_input_tokens: usage.cachedInputTokens,
    p_output_tokens: usage.outputTokens,
    p_reasoning_tokens: usage.reasoningTokens,
    p_actual_cost_microusd: actualCost,
    p_latency_ms: latencyMs,
  });
}

function normalizeSelection(value: { blockId: string; text: string } | null | undefined, blocks: Array<{ id: string }>) {
  if (!value?.text.trim() || !blocks.some((block) => block.id === value.blockId)) return null;
  return { blockId: value.blockId, text: value.text.trim().slice(0, 1_200) };
}

async function rpcJson(db: Database, name: string, args: Record<string, unknown>) {
  const result = await db.rpc(name, args);
  if (result.error) {
    const message = result.error.message ?? "";
    if (message.includes("GLOBAL_BUDGET")) throw new WriterGuidedWritingError("budget", "El límite técnico de Guided Writing está temporalmente agotado.", 503);
    if (message.includes("NOT_FOUND")) throw new WriterGuidedWritingError("not_found", "La conversación o el guion ya no existe.", 404);
    throw new WriterGuidedWritingError("storage", "No pudimos guardar Guided Writing.", 500);
  }
  return result.data as Record<string, unknown>;
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

function positiveInteger(value: unknown) { return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0; }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function logOperation(
  operationId: string,
  scriptId: string,
  scope: WriterGuidedWritingScope,
  status: string,
  usage: WriterSceneAnalysisUsage,
  costMicrousd: number,
  latencyMs: number,
) {
  console.info("writer_guided_writing", {
    operationId, scriptId, scope, model: WRITER_GUIDED_WRITING_MODEL,
    status, usage, costMicrousd, latencyMs,
  });
}
