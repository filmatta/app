import "server-only";

import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateWriterDocument } from "./document";
import { calculateWriterSceneAnalysisCost, countWriterSceneAnalysisTokens, estimateWriterSceneAnalysisMaximumCost, type WriterSceneAnalysisUsage } from "./script-assistant-accounting";
import { deriveWriterSceneSources } from "./script-assistant";
import {
  WRITER_NARRATIVE_PULSE_MIN_SCENES, WRITER_NARRATIVE_PULSE_MODEL, WRITER_NARRATIVE_PULSE_VERSION,
  buildWriterPulseContext, validateWriterPulseOutput, writerNarrativePulseSourceHash, writerPulseOutputSchema, writerPulseProviderInput,
  type WriterNarrativePulsePayload, type WriterNarrativePulseState, type WriterPulseMilestoneStatus, type WriterPulseMilestoneType,
} from "./narrative-pulse";
import {
  classifyWriterProviderFailure,
  logWriterProviderDiagnostic,
  writerProviderCacheKey,
  writerProviderLedgerErrorCode,
  type WriterProviderFailureMetadata,
  type WriterProviderStage,
} from "./provider-diagnostics";

const MAX_OUTPUT_TOKENS = 7_000;
const MAX_INPUT_CHARACTERS = 180_000;
const GLOBAL_BUDGET_MICRO_USD = 10_000_000;

export const WRITER_NARRATIVE_PULSE_INSTRUCTIONS = `Eres el lector de Narrative Pulse de FILMATTA. Describe la evolución comparativa de intensidad narrativa escena por escena; no evalúes calidad, pacing, estructura correcta ni salud del guion.
Considera amenaza/peligro, conflicto/presión, stakes/consecuencias, intensidad emocional, revelación/cambio de comprensión y urgencia/acción. La intensidad global es una lectura contextual, no una media rígida de las dimensiones: una sola dimensión decisiva puede sostener una escena intensa. Las dimensiones explican y permiten revisar la lectura; no uses pesos fijos. La intensidad es relativa dentro de este guion y nunca una calificación. Detecta pocos hitos plausibles y zonas amplias; no impongas tres actos ni inventes hitos ausentes.
Usa exclusivamente los sceneId recibidos y devuelve exactamente un punto por escena, en el mismo orden. Las notas y explicaciones deben ser breves, descriptivas y sin razonamiento interno. Las relaciones Setup/Payoff confirmadas son hechos; las sugeridas sólo contexto. Los cambios O-O-C son contexto, no una fórmula de intensidad.`;

type Database = ReturnType<typeof createAdminClient>;
export type WriterPulseProvider = (input: { operationId: string; requestHash: string; cacheKey: string; context: ReturnType<typeof buildWriterPulseContext>; maxOutputTokens: number; signal?: AbortSignal }) => Promise<{ result: unknown; usage: WriterSceneAnalysisUsage; latencyMs: number; requestId?: string }>;

export class WriterNarrativePulseError extends Error { constructor(readonly code: string, message: string, readonly status: number) { super(message); } }

export async function executeWriterNarrativePulse(
  userId: string,
  request: { scriptId: string; sourceHash: string; operationId?: string; signal?: AbortSignal },
  dependencies: { db?: Database; readDb?: Database; provider?: WriterPulseProvider } = {},
) {
  const db = dependencies.db ?? createAdminClient();
  const readDb = dependencies.readDb ?? db;
  const scriptResult = await readDb.from("writer_scripts").select("document").eq("id", request.scriptId).eq("owner_id", userId).maybeSingle();
  if (scriptResult.error || !scriptResult.data) throw new WriterNarrativePulseError("not_found", "Guion no encontrado.", 404);
  const validated = validateWriterDocument(scriptResult.data.document);
  if (!validated.ok) throw new WriterNarrativePulseError("invalid_document", "El guion guardado no es compatible.", 409);
  const scenes = deriveWriterSceneSources(validated.document);
  if (scenes.length < WRITER_NARRATIVE_PULSE_MIN_SCENES) throw new WriterNarrativePulseError("not_enough_scenes", "Narrative Pulse necesita más escenas para producir una lectura útil.", 422);
  const sourceHash = await writerNarrativePulseSourceHash(validated.document);
  if (sourceHash !== request.sourceHash) throw new WriterNarrativePulseError("stale", "El guion cambió. Espera a que se guarde antes de analizarlo.", 409);
  const operationId = request.operationId ?? randomUUID();
  let context: Awaited<ReturnType<typeof loadPulseContext>>;
  try { context = await loadPulseContext(readDb, userId, request.scriptId, scenes); }
  catch (cause) {
    logPulseDiagnostic(operationId, "context_build", false, {
      ...classifyWriterProviderFailure(cause, { outboundAttempted: false }), failureOrigin: "pre_provider",
    });
    throw cause;
  }
  const providerInput = writerPulseProviderInput(context);
  if (providerInput.length > MAX_INPUT_CHARACTERS) throw new WriterNarrativePulseError("document_too_large", "Este guion supera el límite seguro de Narrative Pulse V1.", 413);
  const requestHash = sha256(JSON.stringify({ version: WRITER_NARRATIVE_PULSE_VERSION, model: WRITER_NARRATIVE_PULSE_MODEL, instructions: WRITER_NARRATIVE_PULSE_INSTRUCTIONS, input: providerInput }));
  const maximumCost = estimateWriterSceneAnalysisMaximumCost(countWriterSceneAnalysisTokens(`${WRITER_NARRATIVE_PULSE_INSTRUCTIONS}\n${providerInput}`), MAX_OUTPUT_TOKENS);
  const reserved = await rpcJson(db, "writer_reserve_narrative_pulse", {
    p_user_id: userId, p_operation_id: operationId, p_script_id: request.scriptId, p_source_hash: sourceHash,
    p_analysis_version: WRITER_NARRATIVE_PULSE_VERSION, p_model: WRITER_NARRATIVE_PULSE_MODEL, p_request_hash: requestHash,
    p_max_cost_microusd: maximumCost, p_global_budget_microusd: GLOBAL_BUDGET_MICRO_USD,
  });
  if (reserved.status === "fresh") return { ...(await loadWriterNarrativePulseState(readDb, userId, request.scriptId)), cached: true, providerCalls: 0, costMicrousd: 0, latencyMs: 0 };
  if (reserved.status === "analyzing") return { pending: true, providerCalls: 0, costMicrousd: 0, latencyMs: 0 };
  if (reserved.status === "uncertain") throw new WriterNarrativePulseError("uncertain", "Una llamada anterior necesita conciliación antes de reintentarse.", 409);
  if (reserved.status !== "reserved" || typeof reserved.analysisId !== "string") throw new WriterNarrativePulseError("reservation", "No pudimos preparar el análisis.", 409);
  let response: Awaited<ReturnType<WriterPulseProvider>>;
  try { response = await (dependencies.provider ?? openAiPulseProvider)({ operationId, requestHash, cacheKey: writerProviderCacheKey("writer-pulse", userId, request.scriptId, sourceHash), context, maxOutputTokens: MAX_OUTPUT_TOKENS, signal: request.signal }); }
  catch (cause) {
    const failure = cause instanceof ProviderFailure
      ? cause
      : ProviderFailure.fromUnknown(cause, request.signal?.aborted === true);
    const usage = failure.usage ?? emptyUsage();
    const uncertain = !failure.usageReceived && failure.outboundAttempted;
    const cost = uncertain ? maximumCost : calculateWriterSceneAnalysisCost(usage);
    const status = uncertain ? "uncertain" : "failed";
    await settle(db, userId, operationId, status, writerProviderLedgerErrorCode(failure.metadata), usage, cost, failure.elapsedMs ?? 0);
    logOperation(operationId, request.scriptId, status, failure.usage, cost, failure.elapsedMs, failure.metadata);
    throw new WriterNarrativePulseError("provider", "No pudimos analizar Narrative Pulse ahora.", 503);
  }
  let payload: WriterNarrativePulsePayload;
  try { payload = validateWriterPulseOutput(response.result, scenes); }
  catch {
    const cost = calculateWriterSceneAnalysisCost(response.usage);
    logPulseDiagnostic(operationId, "validation", true, {
      providerErrorCode: "provider_invalid_output",
      providerRequestId: response.requestId ?? null,
      failureOrigin: "validation",
    }, response.latencyMs, true);
    await settle(db, userId, operationId, "failed", "provider_invalid_output", response.usage, cost, response.latencyMs);
    throw new WriterNarrativePulseError("invalid_output", "No pudimos validar el análisis Narrative Pulse.", 503);
  }
  try { await persistPulse(db, userId, request.scriptId, String(reserved.analysisId), sourceHash, payload); }
  catch {
    const cost = calculateWriterSceneAnalysisCost(response.usage);
    logPulseDiagnostic(operationId, "persist", true, {
      providerErrorCode: "storage_failed",
      providerRequestId: response.requestId ?? null,
      failureOrigin: "persistence",
    }, response.latencyMs, true);
    await settle(db, userId, operationId, "failed", "storage_failed", response.usage, cost, response.latencyMs);
    throw new WriterNarrativePulseError("storage", "No pudimos guardar Narrative Pulse.", 500);
  }
  const actualCost = calculateWriterSceneAnalysisCost(response.usage);
  await settle(db, userId, operationId, "completed", null, response.usage, actualCost, response.latencyMs);
  logOperation(operationId, request.scriptId, "completed", response.usage, actualCost, response.latencyMs);
  return {
    ...(await loadWriterNarrativePulseState(readDb, userId, request.scriptId)),
    cached: false,
    providerCalls: 1,
    costMicrousd: actualCost,
    latencyMs: response.latencyMs,
    usage: {
      inputTokens: response.usage.inputTokens,
      cachedInputTokens: response.usage.cachedInputTokens,
      cacheWriteTokens: response.usage.cacheWriteTokens ?? 0,
      outputTokens: response.usage.outputTokens,
    },
  };
}

export async function loadWriterNarrativePulseState(db: Database, userId: string, scriptId: string): Promise<WriterNarrativePulseState> {
  const script = await db.from("writer_scripts").select("document").eq("id", scriptId).eq("owner_id", userId).maybeSingle();
  if (script.error || !script.data) throw new WriterNarrativePulseError("not_found", "Guion no encontrado.", 404);
  const valid = validateWriterDocument(script.data.document);
  const currentSourceHash = valid.ok ? await writerNarrativePulseSourceHash(valid.document) : null;
  const sceneIds = new Set(valid.ok ? deriveWriterSceneSources(valid.document).map((scene) => scene.sceneId) : []);
  const analysisResult = await db.from("writer_narrative_pulse_analyses").select("id,source_hash,analysis_version,model,status,error_code,updated_at").eq("owner_id", userId).eq("script_id", scriptId).order("updated_at", { ascending: false }).limit(1);
  if (analysisResult.error) throw new WriterNarrativePulseError("storage", "No pudimos cargar Narrative Pulse.", 500);
  const analysisRow = analysisResult.data?.[0] as Record<string, unknown> | undefined;
  const analysisId = analysisRow ? String(analysisRow.id) : null;
  const [pointsResult, zonesResult, milestonesResult] = await Promise.all([
    analysisId ? db.from("writer_narrative_pulse_points").select("id,analysis_id,scene_id,intensity,signals,note,dimensions,evidence").eq("owner_id", userId).eq("analysis_id", analysisId) : Promise.resolve({ data: [], error: null }),
    analysisId ? db.from("writer_narrative_pulse_zones").select("id,analysis_id,start_scene_id,end_scene_id,zone_type,note").eq("owner_id", userId).eq("analysis_id", analysisId) : Promise.resolve({ data: [], error: null }),
    db.from("writer_narrative_pulse_milestones").select("id,script_id,scene_id,milestone_type,label,explanation,status,source,source_hash,fingerprint,moved_by_user,updated_at").eq("owner_id", userId).eq("script_id", scriptId).order("updated_at", { ascending: true }),
  ]);
  if (pointsResult.error || zonesResult.error || milestonesResult.error) throw new WriterNarrativePulseError("storage", "No pudimos cargar Narrative Pulse.", 500);
  return {
    currentSourceHash,
    analysis: analysisRow ? { id: String(analysisRow.id), sourceHash: String(analysisRow.source_hash), analysisVersion: String(analysisRow.analysis_version), model: String(analysisRow.model), status: analysisRow.status as NonNullable<WriterNarrativePulseState["analysis"]>["status"], errorCode: analysisRow.error_code ? String(analysisRow.error_code) : null, updatedAt: String(analysisRow.updated_at) } : null,
    points: (pointsResult.data ?? []).map((row: Record<string, unknown>) => ({ id: String(row.id), analysisId: String(row.analysis_id), sceneId: String(row.scene_id), intensity: Number(row.intensity), signals: Array.isArray(row.signals) ? row.signals as never : [], note: String(row.note), dimensions: isRecord(row.dimensions) ? row.dimensions as never : {}, evidence: Array.isArray(row.evidence) ? row.evidence.map(String) : [] })),
    zones: (zonesResult.data ?? []).map((row: Record<string, unknown>) => ({ id: String(row.id), analysisId: String(row.analysis_id), startSceneId: String(row.start_scene_id), endSceneId: String(row.end_scene_id), type: row.zone_type as never, note: String(row.note) })),
    milestones: (milestonesResult.data ?? []).map((row: Record<string, unknown>) => ({ id: String(row.id), scriptId: String(row.script_id), sceneId: String(row.scene_id), type: row.milestone_type as WriterPulseMilestoneType, label: String(row.label), explanation: row.explanation ? String(row.explanation) : null, status: sceneIds.has(String(row.scene_id)) ? row.status as WriterPulseMilestoneStatus : "needs_review", source: row.source as "ai" | "user", sourceHash: row.source_hash ? String(row.source_hash) : null, fingerprint: String(row.fingerprint), movedByUser: Boolean(row.moved_by_user), updatedAt: String(row.updated_at) })),
  };
}

export async function mutateWriterPulseMilestone(db: Database, userId: string, scriptId: string, input: Record<string, unknown>) {
  const script = await db.from("writer_scripts").select("document").eq("id", scriptId).eq("owner_id", userId).maybeSingle();
  if (script.error || !script.data) throw new WriterNarrativePulseError("not_found", "Guion no encontrado.", 404);
  const valid = validateWriterDocument(script.data.document); if (!valid.ok) throw new WriterNarrativePulseError("invalid_document", "Guion incompatible.", 409);
  const sceneIds = new Set(deriveWriterSceneSources(valid.document).map((scene) => scene.sceneId));
  if (input.action === "create") {
    const sceneId = uuid(input.sceneId); if (!sceneIds.has(sceneId)) throw new WriterNarrativePulseError("scene", "La escena ya no existe.", 409);
    const type = milestoneType(input.type); const label = text(input.label, 100);
    const fingerprint = `user:${randomUUID()}`;
    const inserted = await db.from("writer_narrative_pulse_milestones").insert({ owner_id: userId, script_id: scriptId, scene_id: sceneId, milestone_type: type, label, explanation: null, status: "manual", source: "user", fingerprint, moved_by_user: false }).select("id").single();
    if (inserted.error) throw new WriterNarrativePulseError("storage", "No pudimos guardar el hito.", 500);
    return { saved: true, id: inserted.data.id };
  }
  const milestoneId = uuid(input.milestoneId);
  if (input.action === "status") {
    if (!["confirmed", "dismissed"].includes(String(input.status))) throw new WriterNarrativePulseError("status", "Estado no válido.", 400);
    const update = await db.from("writer_narrative_pulse_milestones").update({ status: input.status, updated_at: new Date().toISOString() }).eq("id", milestoneId).eq("owner_id", userId).eq("script_id", scriptId);
    if (update.error) throw new WriterNarrativePulseError("storage", "No pudimos guardar la decisión.", 500); return { saved: true };
  }
  if (input.action === "move") {
    const sceneId = uuid(input.sceneId); if (!sceneIds.has(sceneId)) throw new WriterNarrativePulseError("scene", "La escena ya no existe.", 409);
    const update = await db.from("writer_narrative_pulse_milestones").update({ scene_id: sceneId, status: "confirmed", source: "user", moved_by_user: true, updated_at: new Date().toISOString() }).eq("id", milestoneId).eq("owner_id", userId).eq("script_id", scriptId);
    if (update.error) throw new WriterNarrativePulseError("storage", "No pudimos mover el hito.", 500); return { saved: true };
  }
  if (input.action === "rename") {
    const update = await db.from("writer_narrative_pulse_milestones").update({ label: text(input.label, 100), status: "confirmed", source: "user", updated_at: new Date().toISOString() }).eq("id", milestoneId).eq("owner_id", userId).eq("script_id", scriptId);
    if (update.error) throw new WriterNarrativePulseError("storage", "No pudimos renombrar el hito.", 500); return { saved: true };
  }
  throw new WriterNarrativePulseError("action", "Acción no válida.", 400);
}

async function loadPulseContext(db: Database, userId: string, scriptId: string, scenes: ReturnType<typeof deriveWriterSceneSources>) {
  const [elements, links, analyses, overrides] = await Promise.all([
    db.from("writer_narrative_elements").select("id,scene_id,label,status").eq("owner_id", userId).eq("script_id", scriptId).in("status", ["confirmed", "suggested", "unresolved", "orphan"]),
    db.from("writer_narrative_links").select("setup_element_id,payoff_element_id,status").eq("owner_id", userId).eq("script_id", scriptId).in("status", ["confirmed", "suggested"]),
    db.from("writer_scene_analyses").select("scene_id,auto_change,status").eq("owner_id", userId).eq("script_id", scriptId).in("status", ["completed", "partial"]),
    db.from("writer_scene_analysis_overrides").select("scene_id,change").eq("owner_id", userId).eq("script_id", scriptId),
  ]);
  const confirmedIds = new Set((links.data ?? []).filter((item) => item.status === "confirmed").flatMap((item) => [String(item.setup_element_id), String(item.payoff_element_id)]));
  const setupPayoff = (elements.data ?? []).filter((item) => item.status === "confirmed" || confirmedIds.has(String(item.id))).map((item) => ({ sceneId: String(item.scene_id), label: String(item.label), status: String(item.status) }));
  const overrideMap = new Map((overrides.data ?? []).map((item) => [String(item.scene_id), item.change ? String(item.change) : ""]));
  const changes = (analyses.data ?? []).flatMap((item) => { const change = overrideMap.get(String(item.scene_id)) ?? (item.auto_change ? String(item.auto_change) : ""); return change ? [{ sceneId: String(item.scene_id), change }] : []; });
  return buildWriterPulseContext(scenes, { setupPayoff, changes });
}

async function persistPulse(db: Database, userId: string, scriptId: string, analysisId: string, sourceHash: string, payload: WriterNarrativePulsePayload) {
  await Promise.all([
    db.from("writer_narrative_pulse_points").delete().eq("owner_id", userId).eq("analysis_id", analysisId),
    db.from("writer_narrative_pulse_zones").delete().eq("owner_id", userId).eq("analysis_id", analysisId),
  ]);
  const pointResult = await db.from("writer_narrative_pulse_points").insert(payload.scenes.map((point) => ({ analysis_id: analysisId, owner_id: userId, script_id: scriptId, scene_id: point.sceneId, intensity: point.intensity, signals: point.signals, note: point.note, dimensions: point.dimensions ?? {}, evidence: point.evidence ?? [] })));
  const zoneResult = payload.zones.length ? await db.from("writer_narrative_pulse_zones").insert(payload.zones.map((zone) => ({ analysis_id: analysisId, owner_id: userId, script_id: scriptId, start_scene_id: zone.startSceneId, end_scene_id: zone.endSceneId, zone_type: zone.type, note: zone.note }))) : { error: null };
  if (pointResult.error || zoneResult.error) throw pointResult.error ?? zoneResult.error;
  const existing = await db.from("writer_narrative_pulse_milestones").select("id,fingerprint,status,source").eq("owner_id", userId).eq("script_id", scriptId);
  if (existing.error) throw existing.error;
  const staleSuggestionIds = (existing.data ?? []).filter((row) => row.source === "ai" && row.status === "suggested").map((row) => String(row.id));
  if (staleSuggestionIds.length) {
    const removed = await db.from("writer_narrative_pulse_milestones").delete().eq("owner_id", userId).eq("script_id", scriptId).in("id", staleSuggestionIds);
    if (removed.error) throw removed.error;
  }
  const known = new Set((existing.data ?? []).filter((row) => !staleSuggestionIds.includes(String(row.id))).map((row) => String(row.fingerprint)));
  const suggestions = payload.milestones.flatMap((milestone) => { const fingerprint = `ai:${milestone.type}:${milestone.sceneId}`; return known.has(fingerprint) ? [] : [{ owner_id: userId, script_id: scriptId, scene_id: milestone.sceneId, milestone_type: milestone.type, label: milestone.label, explanation: milestone.explanation, status: "suggested", source: "ai", source_hash: sourceHash, fingerprint }]; });
  if (suggestions.length) { const inserted = await db.from("writer_narrative_pulse_milestones").insert(suggestions); if (inserted.error) throw inserted.error; }
}

async function openAiPulseProvider(input: Parameters<WriterPulseProvider>[0]) {
  if (!process.env.OPENAI_API_KEY) {
    const metadata: WriterProviderFailureMetadata = { providerStatus: null, providerErrorCode: "openai_key_missing", providerErrorType: null, providerErrorParam: null, providerRequestId: null, failureOrigin: "configuration" };
    logPulseDiagnostic(input.operationId, "feature_gate", false, metadata);
    throw new ProviderFailure(metadata, null, null, false);
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 120_000 }); const started = Date.now(); let response;
  logPulseDiagnostic(input.operationId, "outbound_attempt", true);
  try { response = await client.responses.create({ model: WRITER_NARRATIVE_PULSE_MODEL, reasoning: { effort: "none" }, store: false, prompt_cache_key: input.cacheKey, max_output_tokens: input.maxOutputTokens, instructions: WRITER_NARRATIVE_PULSE_INSTRUCTIONS, input: writerPulseProviderInput(input.context), text: { format: { type: "json_schema", name: "writer_narrative_pulse", strict: true, schema: writerPulseOutputSchema() } } }, { headers: { "Idempotency-Key": `writer-pulse-${input.operationId}-${input.requestHash.slice(0, 16)}` }, signal: input.signal }); }
  catch (cause) {
    const metadata = classifyWriterProviderFailure(cause, { outboundAttempted: true, aborted: input.signal?.aborted });
    const elapsedMs = Date.now() - started;
    logPulseDiagnostic(input.operationId, "response_headers", true, metadata, elapsedMs, false);
    throw new ProviderFailure(metadata, null, elapsedMs, true);
  }
  const usage = readUsage(response.usage);
  const requestId = typeof response._request_id === "string" ? response._request_id : null;
  if (response.status !== "completed" || !response.output_text) {
    const metadata: WriterProviderFailureMetadata = { providerStatus: null, providerErrorCode: `response_${response.status}`, providerErrorType: null, providerErrorParam: null, providerRequestId: requestId, failureOrigin: "response" };
    logPulseDiagnostic(input.operationId, "response_body", true, metadata, Date.now() - started, true);
    throw new ProviderFailure(metadata, usage, Date.now() - started, true);
  }
  try { return { result: JSON.parse(response.output_text), usage, latencyMs: Date.now() - started, ...(requestId ? { requestId } : {}) }; }
  catch {
    const metadata: WriterProviderFailureMetadata = { providerStatus: null, providerErrorCode: "invalid_json", providerErrorType: null, providerErrorParam: null, providerRequestId: requestId, failureOrigin: "parse" };
    logPulseDiagnostic(input.operationId, "parse", true, metadata, Date.now() - started, true);
    throw new ProviderFailure(metadata, usage, Date.now() - started, true);
  }
}

class ProviderFailure extends Error {
  constructor(readonly metadata: WriterProviderFailureMetadata, readonly usage: WriterSceneAnalysisUsage | null, readonly elapsedMs: number | null, readonly outboundAttempted: boolean) { super("provider_request_failed"); }
  get usageReceived() { return this.usage !== null; }
  static fromUnknown(cause: unknown, aborted: boolean) { return new ProviderFailure(classifyWriterProviderFailure(cause, { outboundAttempted: true, aborted }), null, null, true); }
}
async function settle(db: Database, userId: string, operationId: string, status: "completed" | "failed" | "uncertain", errorCode: string | null, usage: WriterSceneAnalysisUsage, cost: number, latency: number) { await rpcJson(db, "writer_settle_narrative_pulse", { p_user_id: userId, p_operation_id: operationId, p_status: status, p_error_code: errorCode, p_input_tokens: usage.inputTokens, p_cached_input_tokens: usage.cachedInputTokens, p_output_tokens: usage.outputTokens, p_reasoning_tokens: usage.reasoningTokens, p_actual_cost_microusd: cost, p_latency_ms: latency }); }
async function rpcJson(db: Database, name: string, args: Record<string, unknown>) { const result = await db.rpc(name, args); if (result.error) { if (String(result.error.message).includes("BUDGET")) throw new WriterNarrativePulseError("budget", "Narrative Pulse no está disponible por presupuesto ahora.", 429); throw result.error; } return (result.data ?? {}) as Record<string, unknown>; }
function readUsage(value: unknown): WriterSceneAnalysisUsage { const usage = isRecord(value) ? value : {}; const details = isRecord(usage.input_tokens_details) ? usage.input_tokens_details : {}; const output = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : {}; return { inputTokens: integer(usage.input_tokens), cachedInputTokens: integer(details.cached_tokens), cacheWriteTokens: integer(details.cache_write_tokens), outputTokens: integer(usage.output_tokens), reasoningTokens: integer(output.reasoning_tokens) }; }
function emptyUsage(): WriterSceneAnalysisUsage { return { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 }; }
function integer(value: unknown) { return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0; }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function uuid(value: unknown) { const result = String(value ?? ""); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(result)) throw new WriterNarrativePulseError("invalid", "Identificador no válido.", 400); return result; }
function text(value: unknown, limit: number) { const result = String(value ?? "").trim().replace(/\s+/gu, " "); if (!result || result.length > limit) throw new WriterNarrativePulseError("invalid", "Texto no válido.", 400); return result; }
function milestoneType(value: unknown) { const type = String(value) as WriterPulseMilestoneType; if (!["inciting_incident", "first_turning_point", "midpoint", "crisis", "climax", "resolution", "custom"].includes(type)) throw new WriterNarrativePulseError("invalid", "Tipo de hito no válido.", 400); return type; }
function logOperation(operationId: string, scriptId: string, status: string, usage: WriterSceneAnalysisUsage | null, cost: number, latency: number | null, metadata?: WriterProviderFailureMetadata) { console.info("writer_narrative_pulse", { operationId, scriptId, status, inputTokens: usage?.inputTokens ?? null, cachedInputTokens: usage?.cachedInputTokens ?? null, cacheWriteTokens: usage?.cacheWriteTokens ?? null, outputTokens: usage?.outputTokens ?? null, usageReceived: usage !== null, costMicrousd: cost, latencyMs: latency, providerStatus: metadata?.providerStatus ?? null, providerRequestId: metadata?.providerRequestId ?? null }); }
function logPulseDiagnostic(operationId: string, stage: WriterProviderStage, outboundAttempted: boolean, metadata?: Partial<WriterProviderFailureMetadata>, elapsedMs?: number | null, usageReceived = false) { logWriterProviderDiagnostic({ diagnosticRunId: operationId, operationId, feature: "narrative_pulse", stage, outboundAttempted, requestedModel: WRITER_NARRATIVE_PULSE_MODEL, elapsedMs, usageReceived, ...(metadata ?? {}) }); }
