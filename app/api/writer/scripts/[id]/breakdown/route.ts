import { randomUUID } from "node:crypto";
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
import { analyzeBreakdownWithAi, WriterProductionAiError } from "@/lib/writer/production-ai-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  try {
    return writerJson(await loadWriterBreakdown(session.supabase, session.user.id, id));
  } catch (cause) {
    return productionError(cause, "No pudimos cargar el Breakdown.");
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
      const result = await detectAndStoreWriterBreakdown(createAdminClient(), session.user.id, id, { sceneIds });
      return writerJson({ ...result, analysis: "deterministic", breakdown: await loadWriterBreakdown(session.supabase, session.user.id, id) });
    }
    if (body.value.action === "detectAi" && validUuid(body.value.operationId)
      && ["scene", "changed", "document"].includes(String(body.value.scope))) {
      const sceneIds = body.value.scope === "scene" && validUuid(body.value.sceneId) ? [body.value.sceneId] : undefined;
      if (body.value.scope === "scene" && !sceneIds) return writerJson({ error: "Escena no válida.", code: "invalid" }, 400);
      const analysis = await analyzeBreakdownWithAi({
        userId: session.user.id, scriptId: id, sceneIds, operationId: body.value.operationId,
        readDb: session.supabase, signal: request.signal,
      });
      const stored = await detectAndStoreWriterBreakdown(createAdminClient(), session.user.id, id, { sceneIds: sceneIds ? new Set(sceneIds) : undefined, extraCandidates: analysis.candidates });
      return writerJson({ ...stored, ...analysis, analysis: "ai", breakdown: await loadWriterBreakdown(session.supabase, session.user.id, id) });
    }
    if (body.value.action === "manual" && isCategory(body.value.category) && clean(body.value.name, 160)) {
      const script = await assertOwnedWriterScript(session.supabase, session.user.id, id);
      const db = createAdminClient();
      const sceneId = body.value.sceneId == null ? null : body.value.sceneId;
      if (sceneId !== null && !validUuid(sceneId)) return writerJson({ error: "Escena no válida.", code: "invalid" }, 400);
      const element = await db.from("writer_breakdown_elements").insert({
        owner_id: session.user.id,
        script_id: id,
        category: body.value.category,
        name: String(body.value.name).trim(),
        normalized_name: productionIdentityKey(String(body.value.name)),
        status: "confirmed",
        source: "user",
        fingerprint: `user:${randomUUID()}`,
      }).select("id").single();
      if (element.error || !element.data) throw new WriterProductionError("storage", "No pudimos añadir el elemento.", 500);
      if (sceneId) {
        const sourceHash = "0".repeat(64);
        const appearance = await db.from("writer_breakdown_appearances").insert({
          owner_id: session.user.id, script_id: id, element_id: element.data.id, scene_id: sceneId,
          block_id: null, excerpt: "Añadido manualmente a la escena.", nature: "inferred",
          source_revision: script.revision, source_hash: sourceHash,
        });
        if (appearance.error) throw new WriterProductionError("storage", "No pudimos vincular la escena.", 500);
      }
      return writerJson({ created: true, id: element.data.id, breakdown: await loadWriterBreakdown(session.supabase, session.user.id, id) }, 201);
    }
    return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  } catch (cause) {
    if (cause instanceof WriterProductionAiError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
    return productionError(cause, "No pudimos actualizar el Breakdown.");
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
    return writerJson({ saved: true, breakdown: await loadWriterBreakdown(session.supabase, session.user.id, id) });
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

function productionError(cause: unknown, fallback: string) {
  if (cause instanceof WriterProductionError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
  return writerJson({ error: fallback, code: "server_error" }, 500);
}
