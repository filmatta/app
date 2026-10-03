import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { loadWriterShotlist, WriterProductionError } from "@/lib/writer/production-server";
import { assertOwnedWriterScript } from "@/lib/writer/production-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveWriterSceneSources } from "@/lib/writer/script-assistant";

export const dynamic = "force-dynamic";

const SHOT_FIELDS = new Set([
  "shotType", "composition", "subject", "angle", "movement", "support", "lens", "setup",
  "durationSeconds", "status", "description", "intention", "notes", "sourceBlockId",
]);
const COLUMN_MAP: Record<string, string> = {
  shotType: "shot_type", composition: "composition", subject: "subject", angle: "angle",
  movement: "movement", support: "support", lens: "lens", setup: "setup",
  durationSeconds: "duration_seconds", status: "status", description: "description",
  intention: "intention", notes: "notes", sourceBlockId: "source_block_id",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  try { return writerJson(await loadWriterShotlist(session.supabase, session.user.id, id)); }
  catch (cause) { return productionError(cause); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value) || typeof body.value.action !== "string") {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  const owned = await session.supabase.from("writer_shotlists").select("id,revision")
    .eq("id", id).eq("owner_id", session.user.id).maybeSingle();
  if (owned.error || !owned.data) return writerJson({ error: "Shotlist no encontrada.", code: "not_found" }, 404);
  const admin = createAdminClient();

  if (body.value.action === "addGroup" && validUuid(body.value.operationId) && clean(body.value.title, 180)) {
    return rpcResult(session.supabase, "writer_add_shotlist_group", {
      p_shotlist_id: id, p_title: String(body.value.title).trim(), p_operation_id: body.value.operationId,
    });
  }
  if (body.value.action === "addShot" && validUuid(body.value.groupId) && validUuid(body.value.operationId)
    && ["manual", "assisted", "suggested"].includes(String(body.value.origin ?? "manual"))) {
    return rpcResult(session.supabase, "writer_add_shot", {
      p_shotlist_id: id, p_group_id: body.value.groupId, p_operation_id: body.value.operationId,
      p_origin: body.value.origin ?? "manual",
    });
  }
  if (body.value.action === "duplicateShot" && validUuid(body.value.shotId) && validUuid(body.value.operationId)) {
    return rpcResult(session.supabase, "writer_duplicate_shot", {
      p_shotlist_id: id, p_shot_id: body.value.shotId, p_operation_id: body.value.operationId,
    });
  }
  if (body.value.action === "reorderShot" && validUuid(body.value.shotId) && Number.isSafeInteger(body.value.targetIndex)) {
    return rpcResult(session.supabase, "writer_reorder_shot", {
      p_shotlist_id: id, p_shot_id: body.value.shotId, p_target_index: body.value.targetIndex,
    });
  }
  if (body.value.action === "deleteShots" && Array.isArray(body.value.shotIds)
    && body.value.shotIds.length > 0 && body.value.shotIds.length <= 500 && body.value.shotIds.every(validUuid)) {
    return rpcResult(session.supabase, "writer_delete_shots", { p_shotlist_id: id, p_shot_ids: body.value.shotIds });
  }
  if (body.value.action === "updateShot" && validUuid(body.value.shotId)
    && Number.isSafeInteger(body.value.expectedRevision) && isRecord(body.value.changes)) {
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body.value.changes)) {
      if (!SHOT_FIELDS.has(key) || !validShotValue(key, value)) return writerJson({ error: "Campo no válido.", code: "invalid" }, 400);
      update[COLUMN_MAP[key]] = value === "" && key !== "subject" ? null : value;
    }
    if (!Object.keys(update).length) return writerJson({ saved: true });
    update.revision = Number(body.value.expectedRevision) + 1;
    update.updated_at = new Date().toISOString();
    const result = await admin.from("writer_shotlist_shots").update(update)
      .eq("id", body.value.shotId).eq("shotlist_id", id).eq("owner_id", session.user.id)
      .eq("revision", body.value.expectedRevision).select("id,revision").maybeSingle();
    if (result.error) return writerJson({ error: "No pudimos guardar el plano.", code: "server_error" }, 500);
    if (!result.data) return writerJson({ error: "El plano cambió en otra pestaña.", code: "conflict" }, 409);
    await admin.from("writer_shotlists").update({ revision: Number(owned.data.revision) + 1, updated_at: new Date().toISOString() })
      .eq("id", id).eq("owner_id", session.user.id);
    return writerJson({ saved: true, revision: result.data.revision });
  }
  if (body.value.action === "bulkStatus" && Array.isArray(body.value.shotIds)
    && body.value.shotIds.length > 0 && body.value.shotIds.length <= 500 && body.value.shotIds.every(validUuid)
    && ["pending", "ready"].includes(String(body.value.status))) {
    const result = await admin.from("writer_shotlist_shots")
      .update({ status: body.value.status, updated_at: new Date().toISOString() })
      .eq("shotlist_id", id).eq("owner_id", session.user.id).in("id", body.value.shotIds).select("id");
    if (result.error) return writerJson({ error: "No pudimos actualizar la selección.", code: "server_error" }, 500);
    return writerJson({ saved: true, count: result.data?.length ?? 0 });
  }
  if (body.value.action === "rename" && clean(body.value.title, 160)) {
    const result = await admin.from("writer_shotlists")
      .update({ title: String(body.value.title).trim(), revision: Number(owned.data.revision) + 1, updated_at: new Date().toISOString() })
      .eq("id", id).eq("owner_id", session.user.id).eq("revision", owned.data.revision).select("id").maybeSingle();
    if (result.error || !result.data) return writerJson({ error: "La shotlist cambió en otra pestaña.", code: "conflict" }, 409);
    return writerJson({ saved: true });
  }
  if (body.value.action === "syncSource") {
    const current = await loadWriterShotlist(session.supabase, session.user.id, id);
    if (!current.shotlist.scriptId) return writerJson({ error: "Esta shotlist no tiene guion fuente.", code: "invalid" }, 400);
    const script = await assertOwnedWriterScript(session.supabase, session.user.id, current.shotlist.scriptId);
    const scenes = deriveWriterSceneSources(script.document);
    const groupByScene = new Map(current.shotlist.groups.flatMap((group) => group.sourceSceneId ? [[group.sourceSceneId, group] as const] : []));
    const manual = current.shotlist.groups.filter((group) => !group.sourceSceneId);
    for (const group of current.shotlist.groups) {
      await admin.from("writer_shotlist_groups").update({ position: 100_000 + group.position })
        .eq("id", group.id).eq("owner_id", session.user.id).eq("shotlist_id", id);
    }
    let position = 0;
    for (const scene of scenes) {
      const group = groupByScene.get(scene.sceneId);
      if (group) {
        await admin.from("writer_shotlist_groups").update({ source_scene_title: scene.heading, title: scene.heading, source_status: "linked", position, revision: group.revision + 1, updated_at: new Date().toISOString() })
          .eq("id", group.id).eq("owner_id", session.user.id).eq("shotlist_id", id);
      } else if (body.value.includeAdded === true) {
        await admin.from("writer_shotlist_groups").insert({ owner_id: session.user.id, shotlist_id: id, source_scene_id: scene.sceneId, source_scene_title: scene.heading, title: scene.heading, position, source_status: "linked", creation_operation_id: crypto.randomUUID() });
      }
      position += 1;
    }
    for (const group of current.shotlist.groups.filter((group) => group.sourceSceneId && !scenes.some((scene) => scene.sceneId === group.sourceSceneId))) {
      await admin.from("writer_shotlist_groups").update({ source_status: "missing", position, revision: group.revision + 1, updated_at: new Date().toISOString() })
        .eq("id", group.id).eq("owner_id", session.user.id).eq("shotlist_id", id);
      position += 1;
    }
    for (const group of manual) {
      await admin.from("writer_shotlist_groups").update({ position, revision: group.revision + 1, updated_at: new Date().toISOString() })
        .eq("id", group.id).eq("owner_id", session.user.id).eq("shotlist_id", id);
      position += 1;
    }
    await admin.from("writer_shotlists").update({ source_revision: script.revision, revision: Number(owned.data.revision) + 1, updated_at: new Date().toISOString() })
      .eq("id", id).eq("owner_id", session.user.id);
    return writerJson({ saved: true });
  }
  return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
}

async function rpcResult(db: SupabaseClient, name: string, args: Record<string, unknown>) {
  const result = await db.rpc(name, args);
  if (result.error) {
    const message = result.error.message ?? "";
    if (message.includes("NOT_FOUND")) return writerJson({ error: "Recurso no encontrado.", code: "not_found" }, 404);
    if (result.error.code === "22023" || message.includes("INVALID")) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
    return writerJson({ error: "No pudimos guardar el cambio.", code: "server_error" }, 500);
  }
  return writerJson({ saved: true, id: result.data ?? null });
}

function validShotValue(key: string, value: unknown) {
  if (key === "durationSeconds") return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 86_400);
  if (key === "status") return value === "pending" || value === "ready";
  if (key === "sourceBlockId") return value === null || validUuid(value);
  if (value === null) return key !== "shotType" && key !== "subject" && key !== "angle" && key !== "movement";
  if (typeof value !== "string") return false;
  const max = key === "subject" ? 500 : key === "description" || key === "notes" ? 4_000 : key === "intention" ? 2_000 : 80;
  return value.length <= max && (key === "subject" || value.trim().length > 0 || !["shotType", "angle", "movement"].includes(key));
}

function clean(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= max;
}

function productionError(cause: unknown) {
  if (cause instanceof WriterProductionError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
  return writerJson({ error: "No pudimos cargar la shotlist.", code: "server_error" }, 500);
}
