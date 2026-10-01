import "server-only";

import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateWriterDocument } from "./document";
import { calculateWriterSceneAnalysisCost, countWriterSceneAnalysisTokens, estimateWriterSceneAnalysisMaximumCost, type WriterSceneAnalysisUsage } from "./script-assistant-accounting";
import { deriveWriterSceneSources, writerSceneSourceHash } from "./script-assistant";
import {
  WRITER_SETUP_PAYOFF_MODEL,
  WRITER_SETUP_PAYOFF_VERSION,
  validateWriterSetupPayoffOutput,
  writerSetupPayoffOutputSchema,
  writerSetupPayoffProviderInput,
  writerSetupPayoffSourceHash,
  type WriterNarrativeElement,
  type WriterNarrativeLink,
  type WriterSetupPayoffAnalysis,
  type WriterSetupPayoffPayload,
} from "./setup-payoff";

const MAX_OUTPUT_TOKENS = 5_000;
const MAX_INPUT_CHARACTERS = 300_000;
const GLOBAL_BUDGET_MICRO_USD = 10_000_000;

export const WRITER_SETUP_PAYOFF_INSTRUCTIONS = `Eres el analista Setup / Payoff de FILMATTA. Revisa el guion completo sin escribir, reescribir ni sugerir escenas o diálogos.
Detecta sólo relaciones narrativas razonablemente relevantes. Un setup puede ser objeto, información, regla, promesa, amenaza, habilidad, limitación, relación, comportamiento, pregunta, elemento visual, expectativa, condición, decisión o motivo. Un payoff puede cumplir, contradecir deliberadamente, revelar, usar, transformar, resolver o mostrar una consecuencia/callback.
El usuario es la autoridad: formula candidatos, no conclusiones. Prioriza precisión sobre cantidad y evita observaciones atmosféricas triviales. Usa unresolved para un setup sin resolución plausible y orphan para un payoff sin preparación clara. Una aparición puede participar en varias relaciones.
Cada candidato debe citar un sceneId y blockId proporcionados. Usa fragmentos breves literales. La explicación debe ser una frase breve, sin razonamiento interno ni puntuación de calidad. No devuelvas porcentajes.`;

type Database = ReturnType<typeof createAdminClient>;

export type WriterSetupPayoffProvider = (input: {
  operationId: string;
  requestHash: string;
  scenes: ReturnType<typeof deriveWriterSceneSources>;
  maxOutputTokens: number;
  signal?: AbortSignal;
}) => Promise<{ result: unknown; usage: WriterSceneAnalysisUsage; latencyMs: number; requestId?: string }>;

export class WriterSetupPayoffError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

export async function executeWriterSetupPayoffAnalysis(
  userId: string,
  request: { scriptId: string; sourceHash: string; operationId?: string; signal?: AbortSignal },
  dependencies: { db?: Database; readDb?: Database; provider?: WriterSetupPayoffProvider } = {},
) {
  const db = dependencies.db ?? createAdminClient();
  const readDb = dependencies.readDb ?? db;
  const scriptResult = await readDb.from("writer_scripts").select("document").eq("id", request.scriptId).eq("owner_id", userId).maybeSingle();
  if (scriptResult.error || !scriptResult.data) throw new WriterSetupPayoffError("not_found", "Guion no encontrado.", 404);
  const validated = validateWriterDocument(scriptResult.data.document);
  if (!validated.ok) throw new WriterSetupPayoffError("invalid_document", "El guion guardado no es compatible.", 409);
  const scenes = deriveWriterSceneSources(validated.document);
  if (scenes.length < 2) throw new WriterSetupPayoffError("not_enough_scenes", "Setup / Payoff necesita al menos dos escenas guardadas.", 422);
  const sourceHash = await writerSetupPayoffSourceHash(validated.document);
  if (sourceHash !== request.sourceHash) throw new WriterSetupPayoffError("stale", "El guion cambió. Espera a que se guarde antes de analizarlo.", 409);
  const providerInput = writerSetupPayoffProviderInput(scenes);
  if (providerInput.length > MAX_INPUT_CHARACTERS) {
    throw new WriterSetupPayoffError("document_too_large", "Este guion supera el límite seguro de Setup / Payoff V1.", 413);
  }
  const requestHash = sha256(JSON.stringify({
    version: WRITER_SETUP_PAYOFF_VERSION,
    model: WRITER_SETUP_PAYOFF_MODEL,
    reasoning: "none",
    instructions: WRITER_SETUP_PAYOFF_INSTRUCTIONS,
    input: providerInput,
  }));
  const maximumCost = estimateWriterSceneAnalysisMaximumCost(
    countWriterSceneAnalysisTokens(`${WRITER_SETUP_PAYOFF_INSTRUCTIONS}\n${providerInput}`),
    MAX_OUTPUT_TOKENS,
  );
  const operationId = request.operationId ?? randomUUID();
  const reserved = await rpcJson(db, "writer_reserve_setup_payoff_analysis", {
    p_user_id: userId, p_operation_id: operationId, p_script_id: request.scriptId,
    p_source_hash: sourceHash, p_analysis_version: WRITER_SETUP_PAYOFF_VERSION,
    p_model: WRITER_SETUP_PAYOFF_MODEL, p_request_hash: requestHash,
    p_max_cost_microusd: maximumCost, p_global_budget_microusd: GLOBAL_BUDGET_MICRO_USD,
  });
  if (reserved.status === "fresh") return { ...(await loadSetupPayoffState(readDb, userId, request.scriptId)), cached: true, providerCalls: 0, costMicrousd: 0, latencyMs: 0 };
  if (reserved.status === "analyzing") return { pending: true, cached: false, providerCalls: 0, costMicrousd: 0, latencyMs: 0 };
  if (reserved.status === "uncertain") throw new WriterSetupPayoffError("uncertain", "Una llamada anterior necesita conciliación antes de reintentarse.", 409);
  if (reserved.status !== "reserved") throw new WriterSetupPayoffError("reservation", "No pudimos preparar el análisis.", 409);

  let response: Awaited<ReturnType<WriterSetupPayoffProvider>>;
  try {
    response = await (dependencies.provider ?? openAiSetupPayoffProvider)({ operationId, requestHash, scenes, maxOutputTokens: MAX_OUTPUT_TOKENS, signal: request.signal });
  } catch (cause) {
    const ambiguous = cause instanceof ProviderFailure ? cause.ambiguous : true;
    const usage = cause instanceof ProviderFailure ? cause.usage : emptyUsage();
    const actualCost = ambiguous ? maximumCost : calculateWriterSceneAnalysisCost(usage);
    await settle(db, userId, operationId, ambiguous ? "uncertain" : "failed", {}, "provider_request_failed", usage, actualCost, 0);
    logOperation(operationId, request.scriptId, ambiguous ? "uncertain" : "failed", usage, actualCost, 0);
    throw new WriterSetupPayoffError("provider", "No pudimos analizar Setup / Payoff ahora.", 503);
  }

  let payload: WriterSetupPayoffPayload;
  try {
    payload = validateWriterSetupPayoffOutput(response.result, scenes);
  } catch {
    const actualCost = calculateWriterSceneAnalysisCost(response.usage);
    await settle(db, userId, operationId, "failed", {}, "provider_invalid_output", response.usage, actualCost, response.latencyMs);
    throw new WriterSetupPayoffError("invalid_output", "No pudimos validar el análisis Setup / Payoff.", 503);
  }
  try {
    await persistSuggestions(db, userId, request.scriptId, scenes, payload);
  } catch {
    const actualCost = calculateWriterSceneAnalysisCost(response.usage);
    await settle(db, userId, operationId, "failed", {}, "storage_failed", response.usage, actualCost, response.latencyMs);
    throw new WriterSetupPayoffError("storage", "No pudimos guardar las relaciones detectadas.", 500);
  }
  const actualCost = calculateWriterSceneAnalysisCost(response.usage);
  const summary = { elements: payload.elements.length, links: payload.links.length };
  await settle(db, userId, operationId, "completed", summary, null, response.usage, actualCost, response.latencyMs);
  logOperation(operationId, request.scriptId, "completed", response.usage, actualCost, response.latencyMs);
  return { ...(await loadSetupPayoffState(readDb, userId, request.scriptId)), cached: false, providerCalls: 1, costMicrousd: actualCost, latencyMs: response.latencyMs };
}

export async function loadSetupPayoffState(db: Database, userId: string, scriptId: string) {
  const [elements, links, analyses] = await Promise.all([
    db.from("writer_narrative_elements").select("id,script_id,scene_id,block_id,element_type,category,label,excerpt,explanation,status,source,source_hash,fingerprint,confidence,updated_at")
      .eq("owner_id", userId).eq("script_id", scriptId).order("updated_at", { ascending: false }).limit(300),
    db.from("writer_narrative_links").select("id,script_id,setup_element_id,payoff_element_id,status,source,explanation,confidence,updated_at")
      .eq("owner_id", userId).eq("script_id", scriptId).order("updated_at", { ascending: false }).limit(300),
    db.from("writer_setup_payoff_analyses").select("source_hash,analysis_version,model,status,error_code,updated_at")
      .eq("owner_id", userId).eq("script_id", scriptId).order("updated_at", { ascending: false }).limit(1),
  ]);
  if (elements.error || links.error || analyses.error) throw new WriterSetupPayoffError("storage", "No pudimos cargar Setup / Payoff.", 500);
  return {
    elements: (elements.data ?? []).map(mapElement),
    links: (links.data ?? []).map(mapLink),
    analysis: analyses.data?.[0] ? mapAnalysis(analyses.data[0]) : null,
  };
}

async function persistSuggestions(db: Database, userId: string, scriptId: string, scenes: ReturnType<typeof deriveWriterSceneSources>, payload: WriterSetupPayoffPayload) {
  const sceneHashes = new Map(await Promise.all(scenes.map(async (scene) => [scene.sceneId, await writerSceneSourceHash(scene)] as const)));
  const existingResult = await db.from("writer_narrative_elements").select("id,scene_id,fingerprint,status,source,source_hash")
    .eq("owner_id", userId).eq("script_id", scriptId);
  if (existingResult.error) throw existingResult.error;
  const existing = new Map((existingResult.data ?? []).map((row) => [String(row.fingerprint), row]));
  const candidateFingerprint = new Map(payload.elements.map((candidate) => [candidate.candidateId, elementFingerprint(candidate)]));

  const changedConfirmedElementIds: string[] = [];
  for (const row of existingResult.data ?? []) {
    if (row.source !== "ai" || row.status !== "confirmed") continue;
    const hash = sceneHashes.get(String(row.scene_id));
    if (hash === row.source_hash) continue;
    const updated = await db.from("writer_narrative_elements")
      .update({ status: "needs_review", updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("owner_id", userId);
    if (updated.error) throw updated.error;
    changedConfirmedElementIds.push(String(row.id));
  }
  if (changedConfirmedElementIds.length) {
    const changedLinks = await db.from("writer_narrative_links")
      .update({ status: "needs_review", updated_at: new Date().toISOString() })
      .eq("owner_id", userId).eq("script_id", scriptId).eq("status", "confirmed")
      .or(`setup_element_id.in.(${changedConfirmedElementIds.join(",")}),payoff_element_id.in.(${changedConfirmedElementIds.join(",")})`);
    if (changedLinks.error) throw changedLinks.error;
  }
  const removable = (existingResult.data ?? []).filter((row) => row.source === "ai" && ["suggested", "unresolved", "orphan"].includes(String(row.status))).map((row) => row.id);
  if (removable.length) {
    const removed = await db.from("writer_narrative_elements").delete().in("id", removable).eq("owner_id", userId);
    if (removed.error) throw removed.error;
  }

  const preserved = new Map([...existing.entries()].filter(([, row]) => !removable.includes(row.id)));
  const insertedByFingerprint = new Map<string, string>();
  const rows = payload.elements.flatMap((candidate) => {
    const fingerprint = candidateFingerprint.get(candidate.candidateId)!;
    const retained = preserved.get(fingerprint);
    if (retained) { insertedByFingerprint.set(fingerprint, String(retained.id)); return []; }
    return [{
      owner_id: userId, script_id: scriptId, scene_id: candidate.sceneId, block_id: candidate.blockId,
      element_type: candidate.type, category: candidate.category, label: candidate.label, excerpt: candidate.excerpt,
      explanation: candidate.explanation, status: candidate.disposition, source: "ai", source_hash: sceneHashes.get(candidate.sceneId),
      fingerprint, analysis_version: WRITER_SETUP_PAYOFF_VERSION, confidence: candidate.confidence,
    }];
  });
  if (rows.length) {
    const inserted = await db.from("writer_narrative_elements").insert(rows).select("id,fingerprint");
    if (inserted.error) throw inserted.error;
    for (const row of inserted.data ?? []) insertedByFingerprint.set(String(row.fingerprint), String(row.id));
  }

  const linksResult = await db.from("writer_narrative_links").select("id,fingerprint,status,source").eq("owner_id", userId).eq("script_id", scriptId);
  if (linksResult.error) throw linksResult.error;
  const removableLinks = (linksResult.data ?? []).filter((row) => row.source === "ai" && row.status === "suggested").map((row) => row.id);
  if (removableLinks.length) {
    const removed = await db.from("writer_narrative_links").delete().in("id", removableLinks).eq("owner_id", userId);
    if (removed.error) throw removed.error;
  }
  const existingLinkFingerprints = new Set((linksResult.data ?? []).filter((row) => !removableLinks.includes(row.id)).map((row) => String(row.fingerprint)));
  const linkRows = payload.links.flatMap((link) => {
    const setupFingerprint = candidateFingerprint.get(link.setupCandidateId)!;
    const payoffFingerprint = candidateFingerprint.get(link.payoffCandidateId)!;
    const setupId = insertedByFingerprint.get(setupFingerprint);
    const payoffId = insertedByFingerprint.get(payoffFingerprint);
    const fingerprint = linkFingerprint(setupFingerprint, payoffFingerprint);
    if (!setupId || !payoffId || existingLinkFingerprints.has(fingerprint)) return [];
    return [{ owner_id: userId, script_id: scriptId, setup_element_id: setupId, payoff_element_id: payoffId,
      status: "suggested", source: "ai", fingerprint, explanation: link.explanation, confidence: link.confidence }];
  });
  if (linkRows.length) {
    const inserted = await db.from("writer_narrative_links").insert(linkRows);
    if (inserted.error) throw inserted.error;
  }
}

async function openAiSetupPayoffProvider(input: Parameters<WriterSetupPayoffProvider>[0]) {
  if (!process.env.OPENAI_API_KEY) throw new ProviderFailure(false, emptyUsage());
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 90_000 });
  const started = Date.now();
  let response;
  try {
    response = await client.responses.create({
      model: WRITER_SETUP_PAYOFF_MODEL, reasoning: { effort: "none" }, store: false,
      max_output_tokens: input.maxOutputTokens, instructions: WRITER_SETUP_PAYOFF_INSTRUCTIONS,
      input: writerSetupPayoffProviderInput(input.scenes),
      text: { format: { type: "json_schema", name: "writer_setup_payoff", strict: true, schema: writerSetupPayoffOutputSchema() } },
    }, { headers: { "Idempotency-Key": `writer-setup-payoff-${input.operationId}-${input.requestHash.slice(0, 16)}` }, signal: input.signal });
  } catch (cause) {
    const status = isRecord(cause) && typeof cause.status === "number" ? cause.status : 0;
    throw new ProviderFailure(status === 0 || status >= 500, emptyUsage());
  }
  const usage = readUsage(response.usage);
  if (response.status !== "completed" || !response.output_text) throw new ProviderFailure(false, usage);
  try { return { result: JSON.parse(response.output_text), usage, latencyMs: Date.now() - started,
    ...(typeof response._request_id === "string" ? { requestId: response._request_id } : {}) }; }
  catch { throw new ProviderFailure(false, usage); }
}

class ProviderFailure extends Error {
  constructor(readonly ambiguous: boolean, readonly usage: WriterSceneAnalysisUsage) { super("provider_request_failed"); }
}

async function settle(db: Database, userId: string, operationId: string, status: "completed" | "failed" | "uncertain", summary: Record<string, unknown>, errorCode: string | null, usage: WriterSceneAnalysisUsage, actualCost: number, latencyMs: number) {
  await rpcJson(db, "writer_settle_setup_payoff_analysis", {
    p_user_id: userId, p_operation_id: operationId, p_status: status, p_summary: summary, p_error_code: errorCode,
    p_input_tokens: usage.inputTokens, p_cached_input_tokens: usage.cachedInputTokens, p_output_tokens: usage.outputTokens,
    p_reasoning_tokens: usage.reasoningTokens, p_actual_cost_microusd: actualCost, p_latency_ms: latencyMs,
  });
}

export function mapElement(row: Record<string, unknown>): WriterNarrativeElement {
  return { id: String(row.id), scriptId: String(row.script_id), sceneId: String(row.scene_id), blockId: row.block_id ? String(row.block_id) : null,
    type: row.element_type as WriterNarrativeElement["type"], category: row.category ? String(row.category) : null,
    label: String(row.label), excerpt: String(row.excerpt), explanation: row.explanation ? String(row.explanation) : null,
    status: row.status as WriterNarrativeElement["status"], source: row.source as WriterNarrativeElement["source"],
    sourceHash: row.source_hash ? String(row.source_hash) : null, fingerprint: String(row.fingerprint),
    confidence: row.confidence as WriterNarrativeElement["confidence"], updatedAt: String(row.updated_at) };
}

export function mapLink(row: Record<string, unknown>): WriterNarrativeLink {
  return { id: String(row.id), scriptId: String(row.script_id), setupElementId: String(row.setup_element_id), payoffElementId: String(row.payoff_element_id),
    status: row.status as WriterNarrativeLink["status"], source: row.source as WriterNarrativeLink["source"],
    explanation: row.explanation ? String(row.explanation) : null, confidence: row.confidence as WriterNarrativeLink["confidence"], updatedAt: String(row.updated_at) };
}

export function mapAnalysis(row: Record<string, unknown>): NonNullable<WriterSetupPayoffAnalysis> {
  return { sourceHash: String(row.source_hash), analysisVersion: String(row.analysis_version), model: String(row.model),
    status: row.status as NonNullable<WriterSetupPayoffAnalysis>["status"], errorCode: row.error_code ? String(row.error_code) : null, updatedAt: String(row.updated_at) };
}

function elementFingerprint(candidate: WriterSetupPayoffPayload["elements"][number]) {
  return `ai:${sha256([candidate.type, candidate.sceneId, candidate.blockId, candidate.label.toLocaleLowerCase("es-MX")].join("\u0000")).slice(0, 40)}`;
}
function linkFingerprint(setupFingerprint: string, payoffFingerprint: string) { return `ai:${sha256(`${setupFingerprint}\u0000${payoffFingerprint}`).slice(0, 40)}`; }
function logOperation(operationId: string, scriptId: string, status: string, usage: WriterSceneAnalysisUsage, costMicrousd: number, latencyMs: number) {
  console.info("writer_setup_payoff_analysis", { operationId, scriptId, model: WRITER_SETUP_PAYOFF_MODEL, status, usage, costMicrousd, latencyMs });
}
async function rpcJson(db: Database, name: string, args: Record<string, unknown>) {
  const response = await db.rpc(name, args);
  if (response.error) {
    const message = response.error.message ?? "";
    if (message.includes("GLOBAL_BUDGET")) throw new WriterSetupPayoffError("budget", "El límite técnico de análisis está temporalmente agotado.", 503);
    if (message.includes("NOT_FOUND")) throw new WriterSetupPayoffError("not_found", "Guion no encontrado.", 404);
    throw new WriterSetupPayoffError("storage", "No pudimos guardar Setup / Payoff.", 500);
  }
  return response.data as Record<string, unknown>;
}
function readUsage(value: unknown): WriterSceneAnalysisUsage {
  if (!isRecord(value)) return emptyUsage();
  const input = isRecord(value.input_tokens_details) ? value.input_tokens_details : {};
  const output = isRecord(value.output_tokens_details) ? value.output_tokens_details : {};
  return { inputTokens: positive(value.input_tokens), cachedInputTokens: positive(input.cached_tokens), outputTokens: positive(value.output_tokens), reasoningTokens: positive(output.reasoning_tokens) };
}
function positive(value: unknown) { return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0; }
function emptyUsage(): WriterSceneAnalysisUsage { return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 }; }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
