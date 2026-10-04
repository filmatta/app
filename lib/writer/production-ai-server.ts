import "server-only";

import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { WRITER_SCRIPT_ASSISTANT_MODEL } from "./script-assistant.ts";
import { calculateWriterSceneAnalysisCost, countWriterSceneAnalysisTokens, estimateWriterSceneAnalysisMaximumCost, type WriterSceneAnalysisUsage } from "./script-assistant-accounting.ts";
import { assertOwnedWriterScript, loadWriterShotlist, WriterProductionError } from "./production-server.ts";
import { validateWriterBreakdownCandidates } from "./production.ts";
import { deriveWriterSceneSources } from "./script-assistant.ts";
import {
  classifyWriterProviderFailure,
  logWriterProviderDiagnostic,
  writerProviderCacheKey,
  writerProviderLedgerErrorCode,
  type WriterProviderFailureMetadata,
} from "./provider-diagnostics.ts";

const MAX_OUTPUT_TOKENS = 2_200;
const MAX_OPERATION_COST_MICRO_USD = 200_000;
const VERSION = "writer-production-v1";

export class WriterProductionAiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

export async function analyzeBreakdownWithAi(input: {
  userId: string; scriptId: string; sceneIds?: string[]; operationId?: string; readDb: SupabaseClient; signal?: AbortSignal; force?: boolean;
}) {
  assertEnabled(input.operationId ?? "unassigned");
  const script = await assertOwnedWriterScript(input.readDb, input.userId, input.scriptId);
  const allowed = input.sceneIds?.length ? new Set(input.sceneIds) : null;
  const scenes = deriveWriterSceneSources(script.document).filter((scene) => !allowed || allowed.has(scene.sceneId));
  if (!scenes.length) throw new WriterProductionAiError("empty", "No hay escenas válidas en este ámbito.", 400);
  if (scenes.length > 12) throw new WriterProductionAiError("too_large", "La detección asistida procesa hasta 12 escenas por operación. Usa Escena actual o divide el ámbito.", 413);
  const providerInput = JSON.stringify({ scenes: scenes.map((scene) => ({ sceneId: scene.sceneId, heading: scene.heading, blocks: scene.blocks })) });
  if (providerInput.length > 70_000) throw new WriterProductionAiError("too_large", "Analiza menos escenas por operación.", 413);
  const instructions = "Detecta sólo elementos de producción explícitamente sostenidos por el texto. No inventes. Devuelve referencias exactas a sceneId y blockId. Distingue present, used, mentioned e inferred. No propongas equipo de cámara.";
  const output = await executeOperation({ userId: input.userId, scriptId: input.scriptId, sourceRevision: script.revision, kind: "breakdown_detect", scope: input.sceneIds?.length === 1 ? "scene" : "document", source: providerInput, instructions, schema: breakdownSchema(), operationId: input.operationId, signal: input.signal, force: input.force });
  const candidates = validateWriterBreakdownCandidates((output.result as { candidates?: unknown }).candidates, script.document);
  return { candidates, operationId: output.operationId, ...output.metrics };
}

export async function createShotlistProposals(input: {
  userId: string; shotlistId: string; groupIds: string[]; mode: "assisted" | "suggested"; briefing?: string;
  operationId?: string; readDb: SupabaseClient; signal?: AbortSignal;
}) {
  assertEnabled(input.operationId ?? "unassigned");
  const state = await loadWriterShotlist(input.readDb, input.userId, input.shotlistId);
  const selected = state.shotlist.groups.filter((group) => input.groupIds.includes(group.id)).slice(0, 12);
  if (!selected.length) throw new WriterProductionAiError("empty", "Selecciona al menos una escena.", 400);
  let scenes: ReturnType<typeof deriveWriterSceneSources> = [];
  if (state.shotlist.scriptId) {
    const script = await assertOwnedWriterScript(input.readDb, input.userId, state.shotlist.scriptId);
    scenes = deriveWriterSceneSources(script.document);
  }
  const sceneById = new Map(scenes.map((scene) => [scene.sceneId, scene]));
  const providerInput = JSON.stringify({ mode: input.mode, briefing: input.briefing?.slice(0, 2_000) || null, groups: selected.map((group) => ({ groupId: group.id, title: group.title, scene: group.sourceSceneId ? sceneById.get(group.sourceSceneId) ?? null : null, existingShots: group.shots.map((shot) => ({ shotType: shot.shotType, subject: shot.subject, angle: shot.angle, movement: shot.movement })) })) });
  if (providerInput.length > 75_000) throw new WriterProductionAiError("too_large", "Reduce el ámbito de la propuesta.", 413);
  const instructions = "Propón cobertura cinematográfica revisable. No cambies el guion. Usa sólo groupId y sourceBlockId proporcionados. Focal, movimiento y duración son sugerencias editables. No repitas planos existentes de forma obvia.";
  const output = await executeOperation({ userId: input.userId, scriptId: state.shotlist.scriptId, shotlistId: input.shotlistId, kind: input.mode === "assisted" ? "shotlist_assisted" : "shotlist_suggested", scope: "selected", source: providerInput, instructions, schema: shotSchema(), operationId: input.operationId, signal: input.signal });
  const validGroups = new Map(selected.map((group) => [group.id, group]));
  const raw = Array.isArray((output.result as { shots?: unknown }).shots) ? (output.result as { shots: unknown[] }).shots : [];
  const proposals = raw.flatMap((value) => {
    if (!record(value) || typeof value.groupId !== "string" || !validGroups.has(value.groupId)
      || typeof value.shotType !== "string" || typeof value.subject !== "string" || typeof value.angle !== "string" || typeof value.movement !== "string") return [];
    const group = validGroups.get(value.groupId)!;
    const sourceBlockId = typeof value.sourceBlockId === "string" && group.sourceSceneId && sceneById.get(group.sourceSceneId)?.blocks.some((block) => block.id === value.sourceBlockId) ? value.sourceBlockId : null;
    const payload = {
      shotType: clean(value.shotType, 80, "Plano general"), subject: clean(value.subject, 500, ""),
      angle: clean(value.angle, 80, "A nivel"), movement: clean(value.movement, 80, "Fijo"),
      lens: nullable(value.lens, 40), setup: nullable(value.setup, 40),
      durationSeconds: typeof value.durationSeconds === "number" && value.durationSeconds >= 0 && value.durationSeconds <= 86_400 ? value.durationSeconds : null,
      description: nullable(value.description, 4_000), intention: nullable(value.intention, 2_000), sourceBlockId,
    };
    return [{ groupId: value.groupId, sourceBlockId, payload, fingerprint: sha256(`${value.groupId}:${JSON.stringify(payload)}`).slice(0, 64) }];
  });
  const admin = createAdminClient();
  for (const proposal of proposals) {
    const saved = await admin.from("writer_shotlist_proposals").upsert({
      owner_id: input.userId, shotlist_id: input.shotlistId, group_id: proposal.groupId,
      operation_id: output.operationId, source_block_id: proposal.sourceBlockId,
      fingerprint: proposal.fingerprint, payload: proposal.payload, status: "pending", updated_at: new Date().toISOString(),
    }, { onConflict: "owner_id,shotlist_id,fingerprint" });
    if (saved.error) throw new WriterProductionAiError("storage", "No pudimos guardar las propuestas.", 500);
  }
  return { proposals: await loadProposals(admin, input.userId, input.shotlistId), ...output.metrics };
}

export async function loadProposals(db: SupabaseClient, userId: string, shotlistId: string) {
  const result = await db.from("writer_shotlist_proposals").select("id,group_id,source_block_id,payload,status,created_at")
    .eq("owner_id", userId).eq("shotlist_id", shotlistId).order("created_at", { ascending: true });
  if (result.error) throw new WriterProductionError("storage", "No pudimos cargar las propuestas.", 500);
  return result.data ?? [];
}

async function executeOperation(input: { userId: string; scriptId?: string | null; sourceRevision?: number | null; shotlistId?: string; kind: string; scope: string; source: string; instructions: string; schema: Record<string, unknown>; operationId?: string; signal?: AbortSignal; force?: boolean }) {
  const sourceHash = sha256(`${VERSION}:${WRITER_SCRIPT_ASSISTANT_MODEL}:${input.instructions}:${input.source}`);
  let operationId = input.operationId ?? randomUUID();
  const ownerScope = `${input.userId}:${input.scriptId ?? input.shotlistId ?? "none"}`;
  const requestHash = sha256(`${ownerScope}:${sourceHash}:${input.kind}:${input.scope}`);
  const estimated = estimateWriterSceneAnalysisMaximumCost(countWriterSceneAnalysisTokens(`${input.instructions}\n${input.source}`), MAX_OUTPUT_TOKENS);
  if (estimated > MAX_OPERATION_COST_MICRO_USD) throw new WriterProductionAiError("budget", "La operación excede el límite técnico de US$0.20.", 413);
  const admin = createAdminClient();
  const existing = await admin.from("writer_production_operations").select("id,status,actual_cost_microusd,latency_ms")
    .eq("owner_id", input.userId).eq("request_hash", requestHash).eq("model", WRITER_SCRIPT_ASSISTANT_MODEL).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!input.force && existing.data?.status === "completed" && input.kind === "breakdown_detect") return { operationId: String(existing.data.id), result: { candidates: [] }, metrics: { reused: true, cached: true, costMicrousd: 0, latencyMs: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } };
  if (existing.data?.id) operationId = String(existing.data.id);
  const reserved = await admin.from("writer_production_operations").upsert({
    id: operationId, owner_id: input.userId, script_id: input.scriptId ?? null, shotlist_id: input.shotlistId ?? null,
    kind: input.kind, scope: input.scope, source_revision: input.sourceRevision ?? null, source_hash: sourceHash, request_hash: requestHash,
    model: WRITER_SCRIPT_ASSISTANT_MODEL, status: "processing", reserved_cost_microusd: estimated, updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (reserved.error) throw new WriterProductionAiError("storage", "No pudimos reservar la operación.", 500);
  const started = Date.now(); let usage = emptyUsage();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 90_000 });
  let response;
  logProductionDiagnostic(operationId, "outbound_attempt", true);
  try {
    response = await client.responses.create({
      model: WRITER_SCRIPT_ASSISTANT_MODEL, reasoning: { effort: "none" }, store: false,
      max_output_tokens: MAX_OUTPUT_TOKENS, instructions: input.instructions, input: input.source,
      prompt_cache_key: writerProviderCacheKey("writer-production", input.userId, input.scriptId ?? input.shotlistId ?? "none", input.kind, sourceHash),
      text: { format: { type: "json_schema", name: "writer_production", strict: true, schema: input.schema } },
    }, { headers: { "Idempotency-Key": `writer-production-${operationId}-${requestHash.slice(0, 16)}` }, signal: input.signal });
  } catch (cause) {
    const metadata = classifyWriterProviderFailure(cause, { outboundAttempted: true, aborted: input.signal?.aborted });
    const latency = Date.now() - started;
    const cost = estimated;
    logProductionDiagnostic(operationId, "response_headers", true, metadata, latency, false);
    await admin.from("writer_production_operations").update({ status: "uncertain", actual_cost_microusd: cost, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, latency_ms: latency, error_code: writerProviderLedgerErrorCode(metadata), settled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", operationId).eq("owner_id", input.userId);
    throw new WriterProductionAiError("provider", "No pudimos obtener una propuesta ahora.", 503);
  }
  usage = readUsage(response.usage);
  const requestId = typeof response._request_id === "string" ? response._request_id : null;
  if (response.status !== "completed" || !response.output_text) {
    const metadata: WriterProviderFailureMetadata = { providerStatus: null, providerErrorCode: `response_${response.status}`, providerErrorType: null, providerErrorParam: null, providerRequestId: requestId, failureOrigin: "response" };
    const cost = calculateWriterSceneAnalysisCost(usage); const latency = Date.now() - started;
    logProductionDiagnostic(operationId, "response_body", true, metadata, latency, true);
    await admin.from("writer_production_operations").update({ status: "failed", actual_cost_microusd: cost, input_tokens: usage.inputTokens, cached_input_tokens: usage.cachedInputTokens, output_tokens: usage.outputTokens, reasoning_tokens: usage.reasoningTokens, latency_ms: latency, error_code: writerProviderLedgerErrorCode(metadata), settled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", operationId).eq("owner_id", input.userId);
    throw new WriterProductionAiError("provider", "No pudimos obtener una propuesta ahora.", 503);
  }
  let result: unknown;
  try { result = JSON.parse(response.output_text) as unknown; }
  catch {
    const metadata: WriterProviderFailureMetadata = { providerStatus: null, providerErrorCode: "invalid_json", providerErrorType: null, providerErrorParam: null, providerRequestId: requestId, failureOrigin: "parse" };
    const cost = calculateWriterSceneAnalysisCost(usage); const latency = Date.now() - started;
    logProductionDiagnostic(operationId, "parse", true, metadata, latency, true);
    await admin.from("writer_production_operations").update({ status: "failed", actual_cost_microusd: cost, input_tokens: usage.inputTokens, cached_input_tokens: usage.cachedInputTokens, output_tokens: usage.outputTokens, reasoning_tokens: usage.reasoningTokens, latency_ms: latency, error_code: writerProviderLedgerErrorCode(metadata), settled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", operationId).eq("owner_id", input.userId);
    throw new WriterProductionAiError("provider", "No pudimos obtener una propuesta ahora.", 503);
  }
  const cost = calculateWriterSceneAnalysisCost(usage); const latency = Date.now() - started;
  const measured = await admin.from("writer_production_operations").update({ status: "processing", actual_cost_microusd: cost, input_tokens: usage.inputTokens, cached_input_tokens: usage.cachedInputTokens, output_tokens: usage.outputTokens, reasoning_tokens: usage.reasoningTokens, latency_ms: latency, updated_at: new Date().toISOString() }).eq("id", operationId).eq("owner_id", input.userId);
  if (measured.error) {
    logProductionDiagnostic(operationId, "persist", true, { providerStatus: null, providerErrorCode: "ledger_update_failed", providerErrorType: null, providerErrorParam: null, providerRequestId: requestId, failureOrigin: "persistence" }, latency, true);
    throw new WriterProductionAiError("storage", "No pudimos registrar el resultado del análisis.", 500);
  }
  console.info("writer_production_operation", { operationId, kind: input.kind, model: WRITER_SCRIPT_ASSISTANT_MODEL, status: "provider_completed", usage, costMicrousd: cost, latencyMs: latency, providerRequestId: requestId });
  return { operationId, result, metrics: { reused: false, cached: false, costMicrousd: cost, latencyMs: latency, inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens, cacheWriteTokens: usage.cacheWriteTokens ?? 0, outputTokens: usage.outputTokens } };
}

export async function finalizeWriterProductionAiOperation(userId: string, operationId: string) {
  const admin = createAdminClient();
  const completed = await admin.from("writer_production_operations").update({
    status: "completed",
    error_code: null,
    settled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", operationId).eq("owner_id", userId).eq("status", "processing").select("id").maybeSingle();
  if (completed.error || !completed.data) {
    throw new WriterProductionAiError("storage", "No pudimos finalizar el análisis guardado.", 500);
  }
}

function assertEnabled(operationId: string) {
  if (process.env.WRITER_PRODUCTION_AI_ENABLED !== "enabled" || !process.env.OPENAI_API_KEY) {
    logProductionDiagnostic(operationId, "feature_gate", false, { providerStatus: null, providerErrorCode: process.env.WRITER_PRODUCTION_AI_ENABLED === "enabled" ? "openai_key_missing" : "feature_disabled", providerErrorType: null, providerErrorParam: null, providerRequestId: null, failureOrigin: "configuration" });
    throw new WriterProductionAiError("disabled", "La asistencia de producción no está habilitada en este entorno.", 503);
  }
}
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function clean(value: unknown, max: number, fallback: string) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback; }
function nullable(value: unknown, max: number) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function emptyUsage(): WriterSceneAnalysisUsage { return { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 }; }
function readUsage(value: unknown): WriterSceneAnalysisUsage { if (!record(value)) return emptyUsage(); const i = record(value.input_tokens_details) ? value.input_tokens_details : {}; const o = record(value.output_tokens_details) ? value.output_tokens_details : {}; return { inputTokens: Number(value.input_tokens ?? 0), cachedInputTokens: Number(i.cached_tokens ?? 0), cacheWriteTokens: Number(i.cache_write_tokens ?? 0), outputTokens: Number(value.output_tokens ?? 0), reasoningTokens: Number(o.reasoning_tokens ?? 0) }; }
function breakdownSchema() { return { type: "object", additionalProperties: false, required: ["candidates"], properties: { candidates: { type: "array", maxItems: 120, items: { type: "object", additionalProperties: false, required: ["name", "category", "sceneId", "blockId", "excerpt", "nature"], properties: { name: { type: "string", maxLength: 160 }, category: { type: "string", enum: ["character", "prop", "location", "wardrobe", "vehicle", "animal", "extra", "makeup", "practical_effect", "visual_effect", "stunt", "sound_music", "other"] }, sceneId: { type: "string" }, blockId: { type: "string" }, excerpt: { type: "string", maxLength: 500 }, nature: { type: "string", enum: ["present", "used", "mentioned", "inferred"] } } } } } }; }
function shotSchema() { return { type: "object", additionalProperties: false, required: ["shots"], properties: { shots: { type: "array", maxItems: 120, items: { type: "object", additionalProperties: false, required: ["groupId", "sourceBlockId", "shotType", "subject", "angle", "movement", "lens", "setup", "durationSeconds", "description", "intention"], properties: { groupId: { type: "string" }, sourceBlockId: { type: ["string", "null"] }, shotType: { type: "string", maxLength: 80 }, subject: { type: "string", maxLength: 500 }, angle: { type: "string", maxLength: 80 }, movement: { type: "string", maxLength: 80 }, lens: { type: ["string", "null"], maxLength: 40 }, setup: { type: ["string", "null"], maxLength: 40 }, durationSeconds: { type: ["number", "null"], minimum: 0, maximum: 86400 }, description: { type: ["string", "null"], maxLength: 4000 }, intention: { type: ["string", "null"], maxLength: 2000 } } } } } }; }
function logProductionDiagnostic(operationId: string, stage: Parameters<typeof logWriterProviderDiagnostic>[0]["stage"], outboundAttempted: boolean, metadata?: Partial<WriterProviderFailureMetadata>, elapsedMs?: number | null, usageReceived = false) { logWriterProviderDiagnostic({ diagnosticRunId: operationId, operationId, feature: "breakdown", stage, outboundAttempted, requestedModel: WRITER_SCRIPT_ASSISTANT_MODEL, elapsedMs, usageReceived, ...(metadata ?? {}) }); }
