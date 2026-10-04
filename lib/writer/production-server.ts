import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateWriterDocument } from "./document.ts";
import { deriveWriterSceneSources } from "./script-assistant.ts";
import type {
  WriterBreakdownAppearance,
  WriterBreakdownCandidate,
  WriterBreakdownElement,
  WriterShot,
  WriterShotlist,
  WriterShotlistGroup,
} from "./production.ts";
import { detectWriterBreakdownRules, productionIdentityKey } from "./production.ts";

export class WriterProductionError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

export async function assertOwnedWriterScript(db: SupabaseClient, userId: string, scriptId: string) {
  const result = await db.from("writer_scripts")
    .select("id,title,document,revision")
    .eq("id", scriptId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (result.error || !result.data) throw new WriterProductionError("not_found", "Guion no encontrado.", 404);
  const validated = validateWriterDocument(result.data.document);
  if (!validated.ok) throw new WriterProductionError("invalid_document", "El guion guardado no es compatible.", 409);
  return {
    id: String(result.data.id),
    title: String(result.data.title),
    document: validated.document,
    revision: Number(result.data.revision),
  };
}

export async function loadWriterBreakdown(db: SupabaseClient, userId: string, scriptId: string) {
  const script = await assertOwnedWriterScript(db, userId, scriptId);
  const [elementsResult, appearancesResult, operationResult] = await Promise.all([
    db.from("writer_breakdown_elements")
      .select("id,script_id,category,name,status,source,canonical_identity_key,note,asset_id,fingerprint,revision,updated_at")
      .eq("owner_id", userId)
      .eq("script_id", scriptId)
      .order("updated_at", { ascending: false }),
    db.from("writer_breakdown_appearances")
      .select("id,element_id,scene_id,block_id,excerpt,nature,from_offset,to_offset,source_revision,stale")
      .eq("owner_id", userId)
      .eq("script_id", scriptId)
      .order("created_at", { ascending: true }),
    db.from("writer_production_operations")
      .select("scope,source_revision,status,error_code,updated_at,model")
      .eq("owner_id", userId).eq("script_id", scriptId).eq("kind", "breakdown_detect")
      .order("updated_at", { ascending: false }).limit(1),
  ]);
  if (elementsResult.error || appearancesResult.error || operationResult.error) {
    throw new WriterProductionError("storage", "No pudimos cargar los elementos detectados.", 500);
  }
  const appearancesByElement = new Map<string, WriterBreakdownAppearance[]>();
  for (const row of appearancesResult.data ?? []) {
    const elementId = String(row.element_id);
    const appearance: WriterBreakdownAppearance = {
      id: String(row.id),
      sceneId: row.scene_id ? String(row.scene_id) : null,
      blockId: row.block_id ? String(row.block_id) : null,
      excerpt: String(row.excerpt),
      nature: row.nature as WriterBreakdownAppearance["nature"],
      fromOffset: row.from_offset == null ? null : Number(row.from_offset),
      toOffset: row.to_offset == null ? null : Number(row.to_offset),
      sourceRevision: Number(row.source_revision),
      stale: Boolean(row.stale),
    };
    appearancesByElement.set(elementId, [...(appearancesByElement.get(elementId) ?? []), appearance]);
  }
  const elements: WriterBreakdownElement[] = (elementsResult.data ?? []).map((row) => ({
    id: String(row.id),
    scriptId: String(row.script_id),
    category: row.category as WriterBreakdownElement["category"],
    name: String(row.name),
    status: row.status as WriterBreakdownElement["status"],
    source: row.source as WriterBreakdownElement["source"],
    canonicalIdentityKey: row.canonical_identity_key ? String(row.canonical_identity_key) : null,
    note: row.note ? String(row.note) : null,
    assetId: row.asset_id ? String(row.asset_id) : null,
    fingerprint: String(row.fingerprint),
    revision: Number(row.revision),
    appearances: appearancesByElement.get(String(row.id)) ?? [],
  }));
  return {
    elements,
    pendingCount: elements.filter((element) => element.status === "suggested").length,
    analysis: operationResult.data?.[0] ? {
      scope: String(operationResult.data[0].scope),
      status: String(operationResult.data[0].status),
      sourceRevision: Number(operationResult.data[0].source_revision ?? 0),
      stale: Number(operationResult.data[0].source_revision ?? 0) !== script.revision,
      errorCode: operationResult.data[0].error_code ? String(operationResult.data[0].error_code) : null,
      model: String(operationResult.data[0].model),
      updatedAt: String(operationResult.data[0].updated_at),
    } : null,
  };
}

export async function detectAndStoreWriterBreakdown(
  db: SupabaseClient,
  userId: string,
  scriptId: string,
  options: { sceneIds?: ReadonlySet<string>; extraCandidates?: WriterBreakdownCandidate[]; scope?: "scene" | "changed" | "document"; recordLocalRun?: boolean; includeRules?: boolean; reconcileStale?: boolean; expectedRevision?: number } = {},
) {
  const script = await assertOwnedWriterScript(db, userId, scriptId);
  if (options.expectedRevision !== undefined && script.revision !== options.expectedRevision) {
    throw new WriterProductionError("stale", "El guion cambió durante la detección. Los resultados anteriores permanecen intactos.", 409);
  }
  const operationId = options.recordLocalRun ? randomUUID() : null;
  if (operationId) {
    const operation = await db.from("writer_production_operations").insert({
      id: operationId, owner_id: userId, script_id: scriptId, kind: "breakdown_detect",
      scope: options.scope ?? (options.sceneIds?.size === 1 ? "scene" : "document"),
      source_revision: script.revision,
      source_hash: createHash("sha256").update(JSON.stringify(script.document)).digest("hex"),
      request_hash: createHash("sha256").update(`local:${operationId}`).digest("hex"),
      model: "local-rules-v1", status: "processing", reserved_cost_microusd: 0,
    });
    if (operation.error) throw new WriterProductionError("storage", "No pudimos registrar la detección.", 500);
  }
  const candidates = [
    ...(options.includeRules === false ? [] : detectWriterBreakdownRules(script.document, options.sceneIds)),
    ...(options.extraCandidates ?? []),
  ].filter((candidate) => candidate.category !== "character");
  const fingerprints = [...new Set(candidates.map((candidate) => candidate.fingerprint))];
  const decisionResult = fingerprints.length
    ? await db.from("writer_breakdown_decisions")
      .select("fingerprint,decision")
      .eq("owner_id", userId).eq("script_id", scriptId).in("fingerprint", fingerprints)
    : { data: [], error: null };
  if (decisionResult.error) throw new WriterProductionError("storage", "No pudimos comprobar tus decisiones previas.", 500);
  const dismissed = new Set((decisionResult.data ?? [])
    .filter((row) => row.decision === "dismissed")
    .map((row) => String(row.fingerprint)));
  const accepted = candidates.filter((candidate) => !dismissed.has(candidate.fingerprint));
  for (const candidate of accepted) {
    const existing = await db.from("writer_breakdown_elements")
      .select("id,status")
      .eq("owner_id", userId).eq("script_id", scriptId).eq("fingerprint", candidate.fingerprint)
      .maybeSingle();
    if (existing.error) throw new WriterProductionError("storage", "No pudimos guardar los elementos detectados.", 500);
    let elementId = existing.data?.id ? String(existing.data.id) : null;
    if (!elementId) {
      const created = await db.from("writer_breakdown_elements").insert({
        owner_id: userId,
        script_id: scriptId,
        category: candidate.category,
        name: candidate.name,
        normalized_name: productionIdentityKey(candidate.name),
        status: candidate.category === "location" || candidate.category === "character" ? "confirmed" : "suggested",
        source: candidate.category === "character" ? "character_identity" : candidate.source,
        canonical_identity_key: candidate.canonicalIdentityKey ?? null,
        fingerprint: candidate.fingerprint,
      }).select("id").single();
      if (created.error || !created.data) throw new WriterProductionError("storage", "No pudimos guardar los elementos detectados.", 500);
      elementId = String(created.data.id);
    }
    const sourceHash = createHash("sha256").update(candidate.excerpt).digest("hex");
    const appearance = await db.from("writer_breakdown_appearances").upsert({
      owner_id: userId,
      script_id: scriptId,
      element_id: elementId,
      scene_id: candidate.sceneId,
      block_id: candidate.blockId,
      excerpt: candidate.excerpt,
      nature: candidate.nature,
      from_offset: candidate.fromOffset ?? null,
      to_offset: candidate.toOffset ?? null,
      source_revision: script.revision,
      source_hash: sourceHash,
      stale: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "element_id,block_id,from_offset,nature" });
    if (appearance.error) throw new WriterProductionError("storage", "No pudimos guardar la evidencia de los elementos detectados.", 500);
  }
  const automatedElements = options.reconcileStale === false ? null : await db.from("writer_breakdown_elements")
    .select("id")
    .eq("owner_id", userId)
    .eq("script_id", scriptId)
    .neq("source", "user");
  if (automatedElements?.error) {
    throw new WriterProductionError("storage", "No pudimos reconciliar la evidencia anterior.", 500);
  }
  const automatedElementIds = (automatedElements?.data ?? []).map((row) => String(row.id));
  if (automatedElementIds.length) {
    let staleQuery = db.from("writer_breakdown_appearances")
      .update({ stale: true, updated_at: new Date().toISOString() })
      .eq("owner_id", userId)
      .eq("script_id", scriptId)
      .in("element_id", automatedElementIds)
      .lt("source_revision", script.revision);
    if (options.sceneIds?.size) staleQuery = staleQuery.in("scene_id", [...options.sceneIds]);
    const staleResult = await staleQuery;
    if (staleResult.error) {
      throw new WriterProductionError("storage", "No pudimos reconciliar la evidencia anterior.", 500);
    }
  }
  if (operationId) {
    const completed = await db.from("writer_production_operations").update({
      status: "completed", actual_cost_microusd: 0, settled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", operationId).eq("owner_id", userId);
    if (completed.error) throw new WriterProductionError("storage", "No pudimos finalizar la detección.", 500);
  }
  return { detected: accepted.length, skippedByDecision: candidates.length - accepted.length, revision: script.revision };
}

export async function listWriterShotlists(db: SupabaseClient, userId: string, scriptId?: string) {
  let query = db.from("writer_shotlists")
    .select("id,script_id,title,source_revision,revision,updated_at")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });
  if (scriptId) query = query.eq("script_id", scriptId);
  const result = await query;
  if (result.error) throw new WriterProductionError("storage", "No pudimos cargar tus shotlists.", 500);
  return (result.data ?? []).map((row) => ({
    id: String(row.id),
    scriptId: row.script_id ? String(row.script_id) : null,
    title: String(row.title),
    sourceRevision: row.source_revision == null ? null : Number(row.source_revision),
    revision: Number(row.revision),
    updatedAt: String(row.updated_at),
  }));
}

export async function loadWriterShotlist(db: SupabaseClient, userId: string, shotlistId: string) {
  const shotlistResult = await db.from("writer_shotlists")
    .select("id,script_id,title,source_revision,revision,updated_at")
    .eq("id", shotlistId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (shotlistResult.error || !shotlistResult.data) {
    throw new WriterProductionError("not_found", "Shotlist no encontrada.", 404);
  }
  const [groupsResult, shotsResult] = await Promise.all([
    db.from("writer_shotlist_groups")
      .select("id,shotlist_id,source_scene_id,source_scene_title,title,position,source_status,revision")
      .eq("owner_id", userId)
      .eq("shotlist_id", shotlistId)
      .order("position", { ascending: true }),
    db.from("writer_shotlist_shots")
      .select("id,shotlist_id,group_id,source_block_id,origin,shot_type,composition,subject,angle,movement,support,lens,setup,duration_seconds,status,description,intention,notes,asset_id,position,source_revision,revision")
      .eq("owner_id", userId)
      .eq("shotlist_id", shotlistId)
      .order("position", { ascending: true }),
  ]);
  if (groupsResult.error || shotsResult.error) {
    throw new WriterProductionError("storage", "No pudimos cargar la Shotlist.", 500);
  }
  const shotsByGroup = new Map<string, WriterShot[]>();
  for (const row of shotsResult.data ?? []) {
    const shot = mapWriterShot(row as Record<string, unknown>);
    shotsByGroup.set(shot.groupId, [...(shotsByGroup.get(shot.groupId) ?? []), shot]);
  }
  const groups: WriterShotlistGroup[] = (groupsResult.data ?? []).map((row) => ({
    id: String(row.id),
    shotlistId: String(row.shotlist_id),
    sourceSceneId: row.source_scene_id ? String(row.source_scene_id) : null,
    sourceSceneTitle: row.source_scene_title ? String(row.source_scene_title) : null,
    title: String(row.title),
    position: Number(row.position),
    sourceStatus: row.source_status as WriterShotlistGroup["sourceStatus"],
    revision: Number(row.revision),
    shots: shotsByGroup.get(String(row.id)) ?? [],
  }));
  const shotlist: WriterShotlist = {
    id: String(shotlistResult.data.id),
    scriptId: shotlistResult.data.script_id ? String(shotlistResult.data.script_id) : null,
    title: String(shotlistResult.data.title),
    sourceRevision: shotlistResult.data.source_revision == null ? null : Number(shotlistResult.data.source_revision),
    revision: Number(shotlistResult.data.revision),
    groups,
  };
  const sourceChanges = shotlist.scriptId
    ? await writerShotlistSourceChanges(db, userId, shotlist)
    : { renamed: [], reordered: false, missing: [], added: [] };
  return { shotlist, sourceChanges };
}

export async function writerShotlistSourceChanges(db: SupabaseClient, userId: string, shotlist: WriterShotlist) {
  if (!shotlist.scriptId) return { renamed: [], reordered: false, missing: [], added: [] };
  const script = await assertOwnedWriterScript(db, userId, shotlist.scriptId);
  const scenes = deriveWriterSceneSources(script.document);
  const sceneById = new Map(scenes.map((scene, index) => [scene.sceneId, { ...scene, index }]));
  const linked = shotlist.groups.filter((group) => group.sourceSceneId);
  const renamed = linked.flatMap((group) => {
    const scene = group.sourceSceneId ? sceneById.get(group.sourceSceneId) : null;
    return scene && scene.heading.trim() !== group.sourceSceneTitle?.trim()
      ? [{ groupId: group.id, sceneId: scene.sceneId, title: scene.heading }]
      : [];
  });
  const missing = linked.filter((group) => !group.sourceSceneId || !sceneById.has(group.sourceSceneId)).map((group) => group.id);
  const existingIds = new Set(linked.flatMap((group) => group.sourceSceneId ? [group.sourceSceneId] : []));
  const added = scenes.filter((scene) => !existingIds.has(scene.sceneId)).map((scene) => ({ sceneId: scene.sceneId, title: scene.heading }));
  const sourceOrder = linked.flatMap((group) => {
    const scene = group.sourceSceneId ? sceneById.get(group.sourceSceneId) : null;
    return scene ? [scene.index] : [];
  });
  const reordered = sourceOrder.some((value, index) => index > 0 && value < sourceOrder[index - 1]);
  return { renamed, reordered, missing, added, sourceRevision: script.revision };
}

export function mapWriterShot(row: Record<string, unknown>): WriterShot {
  return {
    id: String(row.id),
    shotlistId: String(row.shotlist_id),
    groupId: String(row.group_id),
    sourceBlockId: row.source_block_id ? String(row.source_block_id) : null,
    origin: row.origin as WriterShot["origin"],
    shotType: String(row.shot_type),
    composition: row.composition ? String(row.composition) : null,
    subject: String(row.subject ?? ""),
    angle: String(row.angle),
    movement: String(row.movement),
    support: row.support ? String(row.support) : null,
    lens: row.lens ? String(row.lens) : null,
    setup: row.setup ? String(row.setup) : null,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    status: row.status as WriterShot["status"],
    description: row.description ? String(row.description) : null,
    intention: row.intention ? String(row.intention) : null,
    notes: row.notes ? String(row.notes) : null,
    assetId: row.asset_id ? String(row.asset_id) : null,
    position: Number(row.position),
    sourceRevision: row.source_revision == null ? null : Number(row.source_revision),
    revision: Number(row.revision),
  };
}
