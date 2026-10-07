import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { loadWriterShotlist, WriterProductionError } from "@/lib/writer/production-server";
import { assertOwnedWriterScript } from "@/lib/writer/production-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveWriterSceneSources } from "@/lib/writer/script-assistant";
import { deleteShotsWithStoryboard, storyboardDeleteImpact } from "@/lib/storyboard/server";
import { runStoryboardAssetCleanup } from "@/lib/storyboard/assets";
import { createHash } from "node:crypto";

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
    const created = await rpcCall(session.supabase, "writer_add_shotlist_group", {
      p_shotlist_id: id, p_title: String(body.value.title).trim(), p_operation_id: body.value.operationId,
    });
    if (!created.ok) return created.response;
    if (Number.isSafeInteger(body.value.targetIndex) && !await reorderGroups(admin, session.user.id, id, String(created.id), Number(body.value.targetIndex))) {
      return writerJson({ error: "La escena se creó, pero no pudimos ubicarla. Reintenta para completar el orden.", code: "partial" }, 409);
    }
    return writerJson({ saved: true, id: created.id });
  }
  if (body.value.action === "addShot" && validUuid(body.value.groupId) && validUuid(body.value.operationId)
    && ["manual", "assisted", "suggested"].includes(String(body.value.origin ?? "manual"))) {
    const created = await rpcCall(session.supabase, "writer_add_shot", {
      p_shotlist_id: id, p_group_id: body.value.groupId, p_operation_id: body.value.operationId,
      p_origin: body.value.origin ?? "manual",
    });
    if (!created.ok) return created.response;
    if (Number.isSafeInteger(body.value.targetIndex)) {
      const reordered = await rpcCall(session.supabase, "writer_reorder_shot", { p_shotlist_id: id, p_shot_id: created.id, p_target_index: body.value.targetIndex });
      if (!reordered.ok) return reordered.response;
    }
    return writerJson({ saved: true, id: created.id });
  }
  if (body.value.action === "duplicateShot" && validUuid(body.value.shotId) && validUuid(body.value.operationId)) {
    return rpcResult(session.supabase, "writer_duplicate_shot", {
      p_shotlist_id: id, p_shot_id: body.value.shotId, p_operation_id: body.value.operationId,
    });
  }
  if (body.value.action === "duplicateGroup" && validUuid(body.value.groupId) && validUuid(body.value.operationId)) {
    const group = await session.supabase.from("writer_shotlist_groups").select("id,title,position").eq("id", body.value.groupId).eq("shotlist_id", id).eq("owner_id", session.user.id).maybeSingle();
    if (group.error || !group.data) return writerJson({ error: "Escena no encontrada.", code: "not_found" }, 404);
    const shots = await session.supabase.from("writer_shotlist_shots").select("source_block_id,shot_type,composition,subject,angle,movement,support,lens,setup,duration_seconds,description,intention,notes,position,source_revision").eq("group_id", body.value.groupId).eq("shotlist_id", id).eq("owner_id", session.user.id).order("position");
    if (shots.error) return writerJson({ error: "No pudimos cargar el grupo.", code: "server_error" }, 500);
    const created = await rpcCall(session.supabase, "writer_add_shotlist_group", { p_shotlist_id: id, p_title: `${String(group.data.title).slice(0, 168)} · copia`, p_operation_id: body.value.operationId });
    if (!created.ok) return created.response;
    const groupId = String(created.id);
    const copies = (shots.data ?? []).map((shot, index) => ({
      owner_id: session.user.id, shotlist_id: id, group_id: groupId, source_block_id: null,
      origin: "manual", shot_type: shot.shot_type, composition: shot.composition, subject: shot.subject,
      angle: shot.angle, movement: shot.movement, support: shot.support, lens: shot.lens, setup: shot.setup,
      duration_seconds: shot.duration_seconds, status: "pending", description: shot.description, intention: shot.intention,
      notes: shot.notes, asset_id: null, position: Number(shot.position),
      creation_operation_id: deterministicUuid(String(body.value.operationId), `shot:${index}`), source_revision: null,
    }));
    if (copies.length) {
      const inserted = await admin.from("writer_shotlist_shots").insert(copies);
      if (inserted.error) {
        await admin.from("writer_shotlist_groups").delete().eq("id", groupId).eq("owner_id", session.user.id).eq("shotlist_id", id);
        return writerJson({ error: "No pudimos duplicar todos los planos.", code: "server_error" }, 500);
      }
    }
    if (!await reorderGroups(admin, session.user.id, id, groupId, Number(group.data.position) + 1)) {
      return writerJson({ error: "El grupo se duplicó, pero no pudimos ubicarlo. Reintenta para completar el orden.", code: "partial" }, 409);
    }
    return writerJson({ saved: true, id: groupId });
  }
  if (body.value.action === "reorderShot" && validUuid(body.value.shotId) && Number.isSafeInteger(body.value.targetIndex)) {
    return rpcResult(session.supabase, "writer_reorder_shot", {
      p_shotlist_id: id, p_shot_id: body.value.shotId, p_target_index: body.value.targetIndex,
    });
  }
  if (body.value.action === "deleteShots" && Array.isArray(body.value.shotIds)
    && body.value.shotIds.length > 0 && body.value.shotIds.length <= 500 && body.value.shotIds.every(validUuid)) {
    const impact = await storyboardDeleteImpact(session.supabase, session.user.id, id, body.value.shotIds);
    if (impact.panels > 0) {
      if (body.value.deleteStoryboard !== true) {
        return writerJson({
          error: `Estos planos tienen ${impact.panels} panel(es) de storyboard y ${impact.approvals} aprobación(es).`,
          code: "storyboard_dependencies",
          impact,
        }, 409);
      }
      try {
        const result = await deleteShotsWithStoryboard({
          db: session.supabase,
          userId: session.user.id,
          shotlistId: id,
          shotIds: body.value.shotIds,
        });
        const { assetIds, ...deleted } = result;
        const cleanup = await runStoryboardAssetCleanup(session.user.id, assetIds);
        return writerJson({ saved: true, deleted, cleanup });
      } catch (cause) {
        return productionError(cause);
      }
    }
    return rpcResult(session.supabase, "writer_delete_shots", { p_shotlist_id: id, p_shot_ids: body.value.shotIds });
  }
  if (body.value.action === "deleteGroup" && validUuid(body.value.groupId)) {
    const group = await session.supabase.from("writer_shotlist_groups").select("id").eq("id", body.value.groupId).eq("shotlist_id", id).eq("owner_id", session.user.id).maybeSingle();
    if (group.error || !group.data) return writerJson({ error: "Escena no encontrada.", code: "not_found" }, 404);
    const shots = await session.supabase.from("writer_shotlist_shots").select("id").eq("group_id", body.value.groupId).eq("shotlist_id", id).eq("owner_id", session.user.id);
    if (shots.error) return writerJson({ error: "No pudimos comprobar el grupo.", code: "server_error" }, 500);
    const shotIds = (shots.data ?? []).map((shot) => String(shot.id));
    const impact = shotIds.length ? await storyboardDeleteImpact(session.supabase, session.user.id, id, shotIds) : { panels: 0, approvals: 0 };
    if (impact.panels > 0 && body.value.deleteStoryboard !== true) return writerJson({ error: `Este grupo tiene ${impact.panels} panel(es) de storyboard y ${impact.approvals} aprobación(es).`, code: "storyboard_dependencies", impact }, 409);
    if (impact.panels > 0) {
      const deleted = await deleteShotsWithStoryboard({ db: session.supabase, userId: session.user.id, shotlistId: id, shotIds });
      await runStoryboardAssetCleanup(session.user.id, deleted.assetIds);
    }
    const removed = await admin.from("writer_shotlist_groups").delete().eq("id", body.value.groupId).eq("shotlist_id", id).eq("owner_id", session.user.id);
    if (removed.error) return writerJson({ error: "No pudimos eliminar el grupo.", code: "server_error" }, 500);
    return writerJson({ saved: true, deleted: true });
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
    try {
    if (typeof body.value.expectedRevision !== "number" || body.value.expectedRevision !== Number(owned.data.revision))
      return writerJson({ error: "La shotlist cambió en otra pestaña. Actualiza la vista y reintenta.", code: "conflict" }, 409);
    const current = await loadWriterShotlist(session.supabase, session.user.id, id);
    if (!current.shotlist.scriptId) return writerJson({ error: "Esta shotlist no tiene guion fuente.", code: "invalid" }, 400);
    const script = await assertOwnedWriterScript(session.supabase, session.user.id, current.shotlist.scriptId);
    const scenes = deriveWriterSceneSources(script.document);
    const sceneById = new Map(scenes.map((scene) => [scene.sceneId, scene]));
    let updatedGroups = 0;
    let missingGroups = 0;
    for (const group of current.shotlist.groups) {
      if (!group.sourceSceneId) continue;
      const scene = sceneById.get(group.sourceSceneId);
      if (!scene) missingGroups += 1;
      const heading = scene?.heading.slice(0, 180) ?? null;
      const changed = scene
        ? group.sourceSceneTitle !== heading || group.sourceStatus !== "linked"
        : group.sourceStatus !== "missing";
      if (!changed) continue;
      const fields = scene
        ? { source_scene_title: heading, title: group.title === group.sourceSceneTitle ? heading : group.title, source_status: "linked" }
        : { source_status: "missing" };
      const result = await admin.from("writer_shotlist_groups")
        .update({ ...fields, revision: group.revision + 1, updated_at: new Date().toISOString() })
        .eq("id", group.id).eq("owner_id", session.user.id).eq("shotlist_id", id).eq("revision", group.revision)
        .select("id").maybeSingle();
      if (result.error || !result.data) return writerJson({ error: "No pudimos actualizar todos los vínculos. Reintenta; los planos se conservaron.", code: "conflict" }, 409);
      updatedGroups += 1;
    }
    const latestScript = await assertOwnedWriterScript(session.supabase, session.user.id, script.id);
    if (latestScript.revision !== script.revision) return writerJson({ error: "El guion cambió durante la actualización. Reintenta.", code: "conflict" }, 409);
    const accepted = await admin.from("writer_shotlists")
      .update({ source_revision: script.revision, revision: Number(owned.data.revision) + 1, updated_at: new Date().toISOString() })
      .eq("id", id).eq("owner_id", session.user.id).eq("revision", owned.data.revision).eq("script_id", script.id)
      .select("id").maybeSingle();
    if (accepted.error || !accepted.data) return writerJson({ error: "No pudimos confirmar la revisión del guion. Reintenta.", code: "conflict" }, 409);
    const linkedIds = new Set(current.shotlist.groups.flatMap((group) => group.sourceSceneId ? [group.sourceSceneId] : []));
    return writerJson({ saved: true, updatedGroups, missingGroups, addedScenes: scenes.filter((scene) => !linkedIds.has(scene.sceneId)).length, sourceRevision: script.revision });
    } catch (cause) { return productionError(cause); }
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

async function rpcCall(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<{ ok: true; id: unknown } | { ok: false; response: Response }> {
  const result = await db.rpc(name, args);
  if (!result.error) return { ok: true, id: result.data ?? null };
  const message = result.error.message ?? "";
  if (message.includes("NOT_FOUND")) return { ok: false, response: writerJson({ error: "Recurso no encontrado.", code: "not_found" }, 404) };
  if (result.error.code === "22023" || message.includes("INVALID")) return { ok: false, response: writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) };
  return { ok: false, response: writerJson({ error: "No pudimos guardar el cambio.", code: "server_error" }, 500) };
}

async function reorderGroups(admin: ReturnType<typeof createAdminClient>, userId: string, shotlistId: string, groupId: string, requestedIndex: number) {
  const rows = await admin.from("writer_shotlist_groups").select("id,position").eq("owner_id", userId).eq("shotlist_id", shotlistId).order("position");
  if (rows.error || !rows.data) return false;
  const ids = rows.data.map((row) => String(row.id)).filter((id) => id !== groupId);
  ids.splice(Math.max(0, Math.min(requestedIndex, ids.length)), 0, groupId);
  for (const [index, targetId] of ids.entries()) {
    const moved = await admin.from("writer_shotlist_groups").update({ position: 100_000 + index }).eq("id", targetId).eq("owner_id", userId).eq("shotlist_id", shotlistId);
    if (moved.error) return false;
  }
  for (const [index, targetId] of ids.entries()) {
    const moved = await admin.from("writer_shotlist_groups").update({ position: index, updated_at: new Date().toISOString() }).eq("id", targetId).eq("owner_id", userId).eq("shotlist_id", shotlistId);
    if (moved.error) return false;
  }
  return true;
}

function deterministicUuid(root: string, label: string) {
  const hex = createHash("sha256").update(`${root}:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
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
