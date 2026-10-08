import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import {
  WRITER_BREAKDOWN_CATEGORIES,
  productionIdentityKey,
  type WriterBreakdownCategory,
} from "@/lib/writer/production";
import {
  assertOwnedWriterScript,
  detectAndStoreWriterBreakdown,
  loadWriterBreakdown,
  WriterProductionError,
} from "@/lib/writer/production-server";
import {
  analyzeBreakdownWithAi,
  finalizeWriterProductionAiOperation,
  WriterProductionAiError,
} from "@/lib/writer/production-ai-server";
import { deriveWriterSceneSources } from "@/lib/writer/script-assistant";
import { normalizeManualTagSelection } from "@/lib/writer/breakdown-tagging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  try {
    return writerJson(await loadWriterBreakdown(createAdminClient(), session.user.id, id));
  } catch (cause) {
    return productionError(cause, "No pudimos cargar los elementos detectados.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value)) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  try {
    if (body.value.action === "detectAll" && validUuid(body.value.operationId)) {
      const script = await assertOwnedWriterScript(session.supabase, session.user.id, id);
      const db = createAdminClient();
      const local = await detectAndStoreWriterBreakdown(db, session.user.id, id, {
        scope: "document",
        recordLocalRun: true,
        reconcileStale: true,
        expectedRevision: script.revision,
      });
      const sceneIds = deriveWriterSceneSources(script.document).map((scene) => scene.sceneId);
      const batches = Array.from({ length: Math.ceil(sceneIds.length / 12) }, (_, index) => sceneIds.slice(index * 12, index * 12 + 12));
      let processedScenes = 0;
      let costMicrousd = 0;
      let latencyMs = 0;
      let reusedScenes = 0;
      let inputTokens = 0;
      let cachedInputTokens = 0;
      let cacheWriteTokens = 0;
      let outputTokens = 0;
      const candidates = [];
      let errorCode: string | null = null;
      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const childOperationId = deterministicBatchId(String(body.value.operationId), index);
        try {
          const analysis = await analyzeBreakdownWithAi({
            userId: session.user.id,
            scriptId: id,
            sceneIds: batch,
            operationId: childOperationId,
            readDb: session.supabase,
            signal: request.signal,
            force: body.value.force === true,
          });
          candidates.push(...analysis.candidates);
          costMicrousd += Number(analysis.costMicrousd ?? 0);
          latencyMs += Number(analysis.latencyMs ?? 0);
          inputTokens += Number(analysis.inputTokens ?? 0);
          cachedInputTokens += Number(analysis.cachedInputTokens ?? 0);
          cacheWriteTokens += Number(analysis.cacheWriteTokens ?? 0);
          outputTokens += Number(analysis.outputTokens ?? 0);
          processedScenes += batch.length;
          if (analysis.reused) reusedScenes += batch.length;
          else {
            await detectAndStoreWriterBreakdown(db, session.user.id, id, {
              sceneIds: new Set(batch),
              extraCandidates: analysis.candidates,
              includeRules: false,
              expectedRevision: script.revision,
            });
            await finalizeWriterProductionAiOperation(session.user.id, analysis.operationId);
          }
        } catch (cause) {
          errorCode = cause instanceof WriterProductionAiError ? cause.code : "server_error";
          await db.from("writer_production_operations").update({
            status: "partial",
            error_code: `partial:${processedScenes}:${sceneIds.length}:${errorCode}`,
            updated_at: new Date().toISOString(),
          }).eq("id", childOperationId).eq("owner_id", session.user.id).eq("status", "processing");
          break;
        }
      }
      return writerJson({
        ...local,
        candidates,
        processedScenes,
        totalScenes: sceneIds.length,
        reusedScenes,
        partial: processedScenes < sceneIds.length,
        errorCode,
        metrics: { costMicrousd, latencyMs, inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens },
        breakdown: await loadWriterBreakdown(db, session.user.id, id),
      });
    }
    if (body.value.action === "detect") {
      if (!['scene', 'changed', 'document'].includes(String(body.value.scope))) {
        return writerJson({ error: "Ámbito no válido.", code: "invalid" }, 400);
      }
      const sceneIds = body.value.scope === "scene" && validUuid(body.value.sceneId)
        ? new Set([body.value.sceneId])
        : undefined;
      if (body.value.scope === "scene" && !sceneIds) return writerJson({ error: "Escena no válida.", code: "invalid" }, 400);
      // V1 always runs safe local rules. AI is a separate, explicit action and is
      // never triggered by opening the panel or by autosave.
      await assertOwnedWriterScript(session.supabase, session.user.id, id);
      const result = await detectAndStoreWriterBreakdown(createAdminClient(), session.user.id, id, { sceneIds, scope: String(body.value.scope) as "scene" | "changed" | "document", recordLocalRun: true });
      return writerJson({ ...result, analysis: "deterministic", breakdown: await loadWriterBreakdown(createAdminClient(), session.user.id, id) });
    }
    if (body.value.action === "detectAi" && validUuid(body.value.operationId)
      && ["scene", "changed", "document"].includes(String(body.value.scope))) {
      const sceneIds = body.value.scope === "scene" && validUuid(body.value.sceneId) ? [body.value.sceneId] : undefined;
      if (body.value.scope === "scene" && !sceneIds) return writerJson({ error: "Escena no válida.", code: "invalid" }, 400);
      const analysis = await analyzeBreakdownWithAi({
        userId: session.user.id, scriptId: id, sceneIds, operationId: body.value.operationId,
        readDb: session.supabase, signal: request.signal,
      });
      if (analysis.reused) {
        return writerJson({ ...analysis, analysis: "ai", breakdown: await loadWriterBreakdown(createAdminClient(), session.user.id, id) });
      }
      const stored = await detectAndStoreWriterBreakdown(createAdminClient(), session.user.id, id, { sceneIds: sceneIds ? new Set(sceneIds) : undefined, extraCandidates: analysis.candidates });
      await finalizeWriterProductionAiOperation(session.user.id, analysis.operationId);
      return writerJson({ ...stored, ...analysis, analysis: "ai", breakdown: await loadWriterBreakdown(createAdminClient(), session.user.id, id) });
    }
    if (body.value.action === "manual" && isCategory(body.value.category) && clean(body.value.name, 160)) {
      const script = await assertOwnedWriterScript(session.supabase, session.user.id, id);
      const db = createAdminClient();
      const sceneId = body.value.sceneId == null ? null : body.value.sceneId;
      if (sceneId !== null && !validUuid(sceneId)) return writerJson({ error: "Escena no válida.", code: "invalid" }, 400);
      const blockId = body.value.blockId == null ? null : body.value.blockId;
      const fromOffset = body.value.fromOffset;
      const toOffset = body.value.toOffset;
      const selected = blockId !== null;
      if (selected && (!validUuid(blockId) || !sceneId || !Number.isInteger(fromOffset) || !Number.isInteger(toOffset))) {
        return writerJson({ error: "Selección inválida.", code: "invalid" }, 400);
      }
      const scene = sceneId ? deriveWriterSceneSources(script.document).find((item) => item.sceneId === sceneId) : null;
      const block = selected ? scene?.blocks.find((item) => item.id === blockId) : null;
      const name = String(body.value.name).trim();
      const validatedSelection = block ? normalizeManualTagSelection(block.text, Number(fromOffset), Number(toOffset)) : null;
      if (selected && (!validatedSelection || validatedSelection.name !== name
        || validatedSelection.fromOffset !== Number(fromOffset) || validatedSelection.toOffset !== Number(toOffset))) {
        return writerJson({ error: "La selección cambió. Selecciona el texto otra vez.", code: "stale", }, 409);
      }
      const normalized = productionIdentityKey(name);
      const match = await db.from("writer_breakdown_elements").select("id,status,revision")
        .eq("owner_id", session.user.id).eq("script_id", id)
        .eq("category", body.value.category).eq("normalized_name", normalized)
        .neq("status", "dismissed").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (match.error) throw new WriterProductionError("storage", "No pudimos buscar el elemento existente.", 500);
      let elementId = match.data?.id ? String(match.data.id) : null;
      if (!elementId) {
        const element = await db.from("writer_breakdown_elements").insert({
          owner_id: session.user.id, script_id: id, category: body.value.category,
          name, normalized_name: normalized, status: "confirmed", source: "user",
          fingerprint: `user:${randomUUID()}`,
        }).select("id").single();
        if (element.error || !element.data) throw new WriterProductionError("storage", "No pudimos añadir el elemento.", 500);
        elementId = String(element.data.id);
      } else if (match.data?.status !== "confirmed") {
        const promote = await db.from("writer_breakdown_elements")
          .update({ status: "confirmed", revision: Number(match.data?.revision) + 1, updated_at: new Date().toISOString() })
          .eq("id", elementId).eq("owner_id", session.user.id).eq("revision", match.data?.revision);
        if (promote.error) throw new WriterProductionError("storage", "No pudimos confirmar el elemento.", 500);
      }
      if (sceneId) {
        const sourceHash = "0".repeat(64);
        const appearance = await db.from("writer_breakdown_appearances").upsert({
          owner_id: session.user.id, script_id: id, element_id: elementId, scene_id: sceneId,
          block_id: blockId, excerpt: selected ? name : "Añadido manualmente a la escena.", nature: "inferred",
          from_offset: selected ? Number(fromOffset) : null, to_offset: selected ? Number(toOffset) : null,
          source_revision: script.revision, source_hash: sourceHash,
          stale: false, updated_at: new Date().toISOString(),
        }, { onConflict: "element_id,block_id,from_offset,nature" });
        if (appearance.error) throw new WriterProductionError("storage", "No pudimos vincular la escena.", 500);
      }
      return writerJson({ created: true, id: elementId, reused: Boolean(match.data), breakdown: await loadWriterBreakdown(db, session.user.id, id) }, 201);
    }
    return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  } catch (cause) {
    if (cause instanceof WriterProductionAiError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
    return productionError(cause, "No pudimos actualizar los elementos detectados.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value) || !validUuid(body.value.elementId)) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  try {
    await assertOwnedWriterScript(session.supabase, session.user.id, id);
    const db = createAdminClient();
    const current = await db.from("writer_breakdown_elements")
      .select("id,fingerprint,revision").eq("id", body.value.elementId).eq("script_id", id).eq("owner_id", session.user.id).maybeSingle();
    if (current.error || !current.data) return writerJson({ error: "Elemento no encontrado.", code: "not_found" }, 404);
    if (body.value.action === "status" && ["confirmed", "dismissed", "suggested"].includes(String(body.value.status))) {
      const status = String(body.value.status);
      const saved = await db.from("writer_breakdown_elements")
        .update({ status, revision: Number(current.data.revision) + 1, updated_at: new Date().toISOString() })
        .eq("id", current.data.id).eq("owner_id", session.user.id).eq("revision", current.data.revision).select("id").maybeSingle();
      if (saved.error || !saved.data) return writerJson({ error: "El elemento cambió en otra pestaña.", code: "conflict" }, 409);
      const decision = await db.from("writer_breakdown_decisions").upsert({
        owner_id: session.user.id, script_id: id, fingerprint: current.data.fingerprint,
        decision: status === "suggested" ? "restored" : status, target_element_id: current.data.id,
        decided_at: new Date().toISOString(),
      }, { onConflict: "owner_id,script_id,fingerprint" });
      if (decision.error) throw new WriterProductionError("storage", "No pudimos conservar tu decisión.", 500);
    } else if (body.value.action === "edit") {
      const update: Record<string, unknown> = { revision: Number(current.data.revision) + 1, updated_at: new Date().toISOString() };
      if (body.value.name !== undefined) {
        if (!clean(body.value.name, 160)) return writerJson({ error: "Nombre no válido.", code: "invalid" }, 400);
        update.name = String(body.value.name).trim();
        update.normalized_name = productionIdentityKey(String(body.value.name));
      }
      if (body.value.category !== undefined) {
        if (!isCategory(body.value.category)) return writerJson({ error: "Categoría no válida.", code: "invalid" }, 400);
        update.category = body.value.category;
      }
      if (body.value.note !== undefined) {
        if (typeof body.value.note !== "string" || body.value.note.length > 2_000) return writerJson({ error: "Nota no válida.", code: "invalid" }, 400);
        update.note = body.value.note.trim() || null;
      }
      const saved = await db.from("writer_breakdown_elements").update(update)
        .eq("id", current.data.id).eq("owner_id", session.user.id).eq("revision", current.data.revision).select("id").maybeSingle();
      if (saved.error || !saved.data) return writerJson({ error: "El elemento cambió en otra pestaña.", code: "conflict" }, 409);
    } else {
      return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
    }
    return writerJson({ saved: true, breakdown: await loadWriterBreakdown(createAdminClient(), session.user.id, id) });
  } catch (cause) {
    return productionError(cause, "No pudimos guardar esta decisión.");
  }
}

function isCategory(value: unknown): value is WriterBreakdownCategory {
  return typeof value === "string" && (WRITER_BREAKDOWN_CATEGORIES as readonly string[]).includes(value);
}

function clean(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= max;
}

function deterministicBatchId(operationId: string, index: number) {
  const bytes = Buffer.from(createHash("sha256").update(`${operationId}:${index}`).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function productionError(cause: unknown, fallback: string) {
  if (cause instanceof WriterProductionError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
  return writerJson({ error: fallback, code: "server_error" }, 500);
}
