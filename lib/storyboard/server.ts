import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapWriterShot } from "@/lib/writer/production-server";
import type { WriterShot, WriterShotlist, WriterShotlistGroup } from "@/lib/writer/production";
import {
  storyboardContentKind,
  validateStoryboardDocument,
} from "./document";
import { storyboardContentHash, storyboardShotContextHash } from "./hash";
import {
  emptyStoryboardDocument,
  STORYBOARD_SCHEMA_VERSION,
  type StoryboardBoard,
  type StoryboardPanel,
  type StoryboardRevision,
} from "./types";

type DbRow = Record<string, unknown>;

export class StoryboardError extends Error {
  constructor(
    public code: "invalid" | "not_found" | "conflict" | "forbidden" | "storage" | "too_large",
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function loadStoryboardBoard(
  db: SupabaseClient,
  userId: string,
  shotlistId: string,
): Promise<StoryboardBoard> {
  const shotlist = await loadStoryboardShotlist(db, userId, shotlistId);
  const panelRows = await loadAllRows(db, "storyboard_panels", "id,shotlist_id,shot_id,position,current_revision_id", {
    owner_id: userId,
    shotlist_id: shotlistId,
  });
  const panelIds = panelRows.map((row) => String(row.id));
  const revisionIds = panelRows.flatMap((row) => row.current_revision_id ? [String(row.current_revision_id)] : []);
  const [revisionRows, approvalRows, renderRows, acknowledgementRows] = await Promise.all([
    loadRowsByIds(db, "storyboard_panel_revisions", "id,panel_id,revision_number,schema_version,base_asset_id,visual_note,logical_width,logical_height,content_kind,content_hash,source_shot_revision,source_context_hash,created_at", "id", revisionIds),
    loadRowsByIds(db, "storyboard_panel_approvals", "panel_id,revision_id,approved_at", "panel_id", panelIds),
    loadRowsByIds(db, "storyboard_panel_renders", "panel_id,revision_id,status,asset_id,updated_at", "panel_id", panelIds),
    loadRowsByIds(db, "storyboard_panel_context_acknowledgements", "panel_id,revision_id,source_context_hash,acknowledged_at", "panel_id", panelIds),
  ]);
  const revisions = new Map(revisionRows.map((row) => [String(row.id), row]));
  const approvals = new Set(approvalRows.map((row) => `${row.panel_id}:${row.revision_id}`));
  const latestRender = latestByPanel(renderRows);
  const latestAcknowledgement = latestByPanel(acknowledgementRows);
  const panelsByShot = new Map<string, StoryboardPanel[]>();
  for (const panelRow of panelRows) {
    const revisionRow = revisions.get(String(panelRow.current_revision_id));
    if (!revisionRow) continue;
    const panel = mapPanelSummary(panelRow, revisionRow, approvals, latestRender, latestAcknowledgement);
    panelsByShot.set(panel.shotId, [...(panelsByShot.get(panel.shotId) ?? []), panel]);
  }
  for (const panels of panelsByShot.values()) panels.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  return {
    shotlist: { id: shotlist.id, title: shotlist.title, scriptId: shotlist.scriptId, revision: shotlist.revision },
    groups: shotlist.groups.map((group) => ({
      id: group.id,
      title: group.title,
      position: group.position,
      sourceStatus: group.sourceStatus,
      sourceSceneId: group.sourceSceneId,
      shots: group.shots.map((shot) => ({
        ...shotBrief(shot),
        contextHash: storyboardShotContextHash(shot),
        panels: panelsByShot.get(shot.id) ?? [],
      })),
    })),
  };
}

async function loadStoryboardShotlist(db: SupabaseClient, userId: string, shotlistId: string): Promise<WriterShotlist> {
  const shotlistResult = await db.from("writer_shotlists")
    .select("id,script_id,title,source_revision,revision")
    .eq("id", shotlistId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (shotlistResult.error || !shotlistResult.data) {
    throw new StoryboardError("not_found", "Shotlist no encontrada.", 404);
  }
  const [groupRows, shotRows] = await Promise.all([
    loadAllRows(db, "writer_shotlist_groups", "id,shotlist_id,source_scene_id,source_scene_title,title,position,source_status,revision", {
      owner_id: userId,
      shotlist_id: shotlistId,
    }),
    loadAllRows(db, "writer_shotlist_shots", "id,shotlist_id,group_id,source_block_id,origin,shot_type,composition,subject,angle,movement,support,lens,setup,duration_seconds,status,description,intention,notes,asset_id,position,source_revision,revision", {
      owner_id: userId,
      shotlist_id: shotlistId,
    }),
  ]);
  const shotsByGroup = new Map<string, WriterShot[]>();
  for (const row of shotRows) {
    const shot = mapWriterShot(row);
    shotsByGroup.set(shot.groupId, [...(shotsByGroup.get(shot.groupId) ?? []), shot]);
  }
  for (const shots of shotsByGroup.values()) shots.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const groups: WriterShotlistGroup[] = groupRows.map((row) => ({
    id: String(row.id),
    shotlistId: String(row.shotlist_id),
    sourceSceneId: row.source_scene_id ? String(row.source_scene_id) : null,
    sourceSceneTitle: row.source_scene_title ? String(row.source_scene_title) : null,
    title: String(row.title),
    position: Number(row.position),
    sourceStatus: row.source_status as WriterShotlistGroup["sourceStatus"],
    revision: Number(row.revision),
    shots: shotsByGroup.get(String(row.id)) ?? [],
  })).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return {
    id: String(shotlistResult.data.id),
    scriptId: shotlistResult.data.script_id ? String(shotlistResult.data.script_id) : null,
    title: String(shotlistResult.data.title),
    sourceRevision: shotlistResult.data.source_revision == null ? null : Number(shotlistResult.data.source_revision),
    revision: Number(shotlistResult.data.revision),
    groups,
  };
}

export async function loadStoryboardShot(
  db: SupabaseClient,
  userId: string,
  shotlistId: string,
  shotId: string,
) {
  const board = await loadStoryboardBoard(db, userId, shotlistId);
  const group = board.groups.find((candidate) => candidate.shots.some((shot) => shot.id === shotId));
  const shot = group?.shots.find((candidate) => candidate.id === shotId);
  if (!group || !shot) throw new StoryboardError("not_found", "Plano no encontrado.", 404);
  const revisionIds = shot.panels.map((panel) => panel.currentRevisionId);
  const rows = await loadRowsByIds(db, "storyboard_panel_revisions", "id,document", "id", revisionIds);
  const documents = new Map(rows.map((row) => [String(row.id), row.document]));
  for (const panel of shot.panels) {
    const validated = validateStoryboardDocument(documents.get(panel.currentRevisionId));
    if (!validated.ok) throw new StoryboardError("storage", "El dibujo guardado no es compatible.", 500);
    panel.currentRevision.document = validated.document;
  }
  return { board, group, shot };
}

export async function createStoryboardPanel(input: {
  db: SupabaseClient;
  userId: string;
  shotlistId: string;
  shotId: string;
  operationId: string;
  document?: unknown;
  visualNote?: unknown;
}) {
  const shot = await ownedShot(input.db, input.userId, input.shotlistId, input.shotId);
  const snapshot = await prepareSnapshot(input.db, input.userId, shot, input.document ?? emptyStoryboardDocument(), input.visualNote);
  const result = await createAdminClient().rpc("storyboard_create_panel", {
    p_actor_id: input.userId,
    p_shotlist_id: input.shotlistId,
    p_shot_id: input.shotId,
    p_operation_id: input.operationId,
    ...rpcSnapshot(snapshot),
  });
  return rpcRow(result, "No pudimos crear el panel.");
}

export async function saveStoryboardPanel(input: {
  db: SupabaseClient;
  userId: string;
  shotlistId: string;
  panelId: string;
  expectedRevisionId: string;
  operationId: string;
  document: unknown;
  visualNote?: unknown;
}) {
  const panel = await ownedPanel(input.db, input.userId, input.shotlistId, input.panelId);
  const shot = await ownedShot(input.db, input.userId, input.shotlistId, String(panel.shot_id));
  const snapshot = await prepareSnapshot(input.db, input.userId, shot, input.document, input.visualNote);
  const result = await createAdminClient().rpc("storyboard_save_panel_revision", {
    p_actor_id: input.userId,
    p_panel_id: input.panelId,
    p_expected_revision_id: input.expectedRevisionId,
    p_operation_id: input.operationId,
    ...rpcSnapshot(snapshot),
  });
  return rpcRow(result, "No pudimos guardar el panel.");
}

export async function duplicateStoryboardPanel(input: {
  db: SupabaseClient;
  userId: string;
  shotlistId: string;
  panelId: string;
  operationId: string;
}) {
  await ownedPanel(input.db, input.userId, input.shotlistId, input.panelId);
  const result = await createAdminClient().rpc("storyboard_duplicate_panel", {
    p_actor_id: input.userId,
    p_panel_id: input.panelId,
    p_operation_id: input.operationId,
  });
  return rpcRow(result, "No pudimos duplicar el panel.");
}

export async function reorderStoryboardPanels(input: {
  db: SupabaseClient;
  userId: string;
  shotlistId: string;
  shotId: string;
  panelIds: string[];
}) {
  await ownedShot(input.db, input.userId, input.shotlistId, input.shotId);
  const result = await createAdminClient().rpc("storyboard_reorder_panels", {
    p_actor_id: input.userId,
    p_shotlist_id: input.shotlistId,
    p_shot_id: input.shotId,
    p_panel_ids: input.panelIds,
  });
  if (result.error) throw rpcError(result.error, "No pudimos ordenar los paneles.");
  return true;
}

export async function approveStoryboardPanel(input: {
  db: SupabaseClient;
  userId: string;
  shotlistId: string;
  panelId: string;
  revisionId: string;
}) {
  await ownedPanel(input.db, input.userId, input.shotlistId, input.panelId);
  const result = await createAdminClient().rpc("storyboard_approve_panel", {
    p_actor_id: input.userId,
    p_panel_id: input.panelId,
    p_revision_id: input.revisionId,
  });
  if (result.error) throw rpcError(result.error, "No pudimos aprobar el panel.");
  return String(result.data);
}

export async function acknowledgeStoryboardContext(input: {
  db: SupabaseClient;
  userId: string;
  shotlistId: string;
  panelId: string;
  revisionId: string;
}) {
  const panel = await ownedPanel(input.db, input.userId, input.shotlistId, input.panelId);
  const shot = await ownedShot(input.db, input.userId, input.shotlistId, String(panel.shot_id));
  const result = await createAdminClient().rpc("storyboard_acknowledge_panel_context", {
    p_actor_id: input.userId,
    p_panel_id: input.panelId,
    p_revision_id: input.revisionId,
    p_source_shot_revision: Number(shot.revision),
    p_source_context_hash: storyboardShotContextHash(mapShotRow(shot)),
  });
  if (result.error) throw rpcError(result.error, "No pudimos reconocer el cambio del plano.");
  return String(result.data);
}

export async function deleteStoryboardPanel(input: {
  db: SupabaseClient;
  userId: string;
  shotlistId: string;
  panelId: string;
}) {
  await ownedPanel(input.db, input.userId, input.shotlistId, input.panelId);
  const assetIds = await storyboardPanelAssetIds(input.db, input.userId, [input.panelId]);
  const result = await createAdminClient().rpc("storyboard_delete_panels", {
    p_actor_id: input.userId,
    p_shotlist_id: input.shotlistId,
    p_panel_ids: [input.panelId],
  });
  if (result.error) throw rpcError(result.error, "No pudimos eliminar el panel.");
  return { deleted: Number(result.data ?? 0), assetIds };
}

export async function storyboardDeleteImpact(db: SupabaseClient, userId: string, shotlistId: string, shotIds: string[]) {
  const panels = await db.from("storyboard_panels").select("id").eq("owner_id", userId).eq("shotlist_id", shotlistId).in("shot_id", shotIds);
  if (panels.error) throw new StoryboardError("storage", "No pudimos revisar las dependencias.", 500);
  const panelIds = (panels.data ?? []).map((row) => String(row.id));
  let approvals = 0;
  if (panelIds.length) {
    const result = await db.from("storyboard_panel_approvals").select("id", { count: "exact", head: true }).eq("owner_id", userId).in("panel_id", panelIds);
    if (result.error) throw new StoryboardError("storage", "No pudimos revisar las aprobaciones.", 500);
    approvals = result.count ?? 0;
  }
  return { shots: shotIds.length, panels: panelIds.length, approvals };
}

export async function deleteShotsWithStoryboard(input: {
  db: SupabaseClient;
  userId: string;
  shotlistId: string;
  shotIds: string[];
}) {
  for (const shotId of input.shotIds) await ownedShot(input.db, input.userId, input.shotlistId, shotId);
  const panelRows = await loadRowsByValues(input.db, "storyboard_panels", "id", "shot_id", input.shotIds, {
    owner_id: input.userId,
    shotlist_id: input.shotlistId,
  });
  const assetIds = await storyboardPanelAssetIds(input.db, input.userId, panelRows.map((row) => String(row.id)));
  const result = await createAdminClient().rpc("storyboard_delete_shots_with_panels", {
    p_actor_id: input.userId,
    p_shotlist_id: input.shotlistId,
    p_shot_ids: input.shotIds,
  });
  if (result.error) throw rpcError(result.error, "No pudimos eliminar los planos y su storyboard.");
  return { ...(result.data as { shots: number; panels: number; approvals: number }), assetIds };
}

async function storyboardPanelAssetIds(db: SupabaseClient, userId: string, panelIds: string[]) {
  if (!panelIds.length) return [];
  const [revisions, renders] = await Promise.all([
    loadRowsByValues(db, "storyboard_panel_revisions", "id,base_asset_id", "panel_id", panelIds, { owner_id: userId }),
    loadRowsByValues(db, "storyboard_panel_renders", "id,asset_id", "panel_id", panelIds, { owner_id: userId }),
  ]);
  return [...new Set([
    ...revisions.flatMap((row) => row.base_asset_id ? [String(row.base_asset_id)] : []),
    ...renders.flatMap((row) => row.asset_id ? [String(row.asset_id)] : []),
  ])];
}

async function prepareSnapshot(db: SupabaseClient, userId: string, shotRow: DbRow, value: unknown, noteValue: unknown) {
  const validated = validateStoryboardDocument(value);
  if (!validated.ok) {
    const code = validated.reason.includes("2 MB") ? "too_large" : "invalid";
    throw new StoryboardError(code, validated.reason, code === "too_large" ? 413 : 400);
  }
  const visualNote = typeof noteValue === "string" ? noteValue.trim() || null : noteValue == null ? null : undefined;
  if (visualNote === undefined || (visualNote && visualNote.length > 4_000)) {
    throw new StoryboardError("invalid", "La nota visual no es válida.", 400);
  }
  const baseAssetId = validated.document.reference?.assetId ?? null;
  if (baseAssetId) {
    const asset = await db.from("writer_production_assets").select("id,status").eq("id", baseAssetId).eq("owner_id", userId).eq("status", "ready").maybeSingle();
    if (asset.error || !asset.data) throw new StoryboardError("not_found", "Referencia no disponible.", 404);
  }
  const shot = mapShotRow(shotRow);
  return {
    document: validated.document,
    visualNote,
    baseAssetId,
    logicalWidth: validated.document.frame.width,
    logicalHeight: validated.document.frame.height,
    contentKind: storyboardContentKind(validated.document),
    contentHash: storyboardContentHash(validated.document, visualNote),
    sourceShotRevision: shot.revision,
    sourceContextHash: storyboardShotContextHash(shot),
  };
}

function rpcSnapshot(snapshot: Awaited<ReturnType<typeof prepareSnapshot>>) {
  return {
    p_document: snapshot.document,
    p_schema_version: STORYBOARD_SCHEMA_VERSION,
    p_base_asset_id: snapshot.baseAssetId,
    p_visual_note: snapshot.visualNote,
    p_logical_width: snapshot.logicalWidth,
    p_logical_height: snapshot.logicalHeight,
    p_content_kind: snapshot.contentKind,
    p_content_hash: snapshot.contentHash,
    p_source_shot_revision: snapshot.sourceShotRevision,
    p_source_context_hash: snapshot.sourceContextHash,
  };
}

async function ownedPanel(db: SupabaseClient, userId: string, shotlistId: string, panelId: string) {
  const result = await db.from("storyboard_panels").select("id,shot_id,current_revision_id").eq("id", panelId).eq("owner_id", userId).eq("shotlist_id", shotlistId).maybeSingle();
  if (result.error || !result.data) throw new StoryboardError("not_found", "Panel no encontrado.", 404);
  return result.data as DbRow;
}

async function ownedShot(db: SupabaseClient, userId: string, shotlistId: string, shotId: string) {
  const result = await db.from("writer_shotlist_shots")
    .select("id,shotlist_id,group_id,position,revision,shot_type,composition,subject,angle,movement,lens,description,intention,notes,asset_id")
    .eq("id", shotId).eq("owner_id", userId).eq("shotlist_id", shotlistId).maybeSingle();
  if (result.error || !result.data) throw new StoryboardError("not_found", "Plano no encontrado.", 404);
  return result.data as DbRow;
}

function mapShotRow(row: DbRow) {
  return {
    subject: String(row.subject ?? ""),
    shotType: String(row.shot_type ?? "General"),
    composition: row.composition ? String(row.composition) : null,
    angle: String(row.angle ?? "A nivel"),
    movement: String(row.movement ?? "Fijo"),
    lens: row.lens ? String(row.lens) : null,
    description: row.description ? String(row.description) : null,
    intention: row.intention ? String(row.intention) : null,
    notes: row.notes ? String(row.notes) : null,
    assetId: row.asset_id ? String(row.asset_id) : null,
    revision: Number(row.revision),
  };
}

function shotBrief(shot: WriterShot) {
  return {
    id: shot.id,
    groupId: shot.groupId,
    position: shot.position,
    revision: shot.revision,
    shotType: shot.shotType,
    composition: shot.composition,
    subject: shot.subject,
    angle: shot.angle,
    movement: shot.movement,
    lens: shot.lens,
    description: shot.description,
    intention: shot.intention,
    notes: shot.notes,
    assetId: shot.assetId,
  };
}

function mapPanelSummary(
  panel: DbRow,
  revision: DbRow,
  approvals: Set<string>,
  renders: Map<string, DbRow>,
  acknowledgements: Map<string, DbRow>,
): StoryboardPanel {
  const panelId = String(panel.id);
  const revisionId = String(revision.id);
  const render = renders.get(panelId);
  const acknowledgement = acknowledgements.get(panelId);
  const currentRevision: StoryboardRevision = {
    id: revisionId,
    panelId,
    revisionNumber: Number(revision.revision_number),
    schemaVersion: Number(revision.schema_version),
    baseAssetId: revision.base_asset_id ? String(revision.base_asset_id) : null,
    visualNote: revision.visual_note ? String(revision.visual_note) : null,
    logicalWidth: Number(revision.logical_width),
    logicalHeight: Number(revision.logical_height),
    contentKind: revision.content_kind as StoryboardRevision["contentKind"],
    contentHash: String(revision.content_hash),
    sourceShotRevision: Number(revision.source_shot_revision),
    sourceContextHash: String(revision.source_context_hash),
    createdAt: String(revision.created_at),
  };
  const renderIsCurrent = render && String(render.revision_id) === revisionId;
  return {
    id: panelId,
    shotlistId: String(panel.shotlist_id),
    shotId: String(panel.shot_id),
    position: Number(panel.position),
    currentRevisionId: revisionId,
    currentRevision,
    approvedRevisionId: approvals.has(`${panelId}:${revisionId}`) ? revisionId : null,
    acknowledgedContextHash: acknowledgement && String(acknowledgement.revision_id) === revisionId ? String(acknowledgement.source_context_hash) : null,
    previewAssetId: renderIsCurrent && render?.status === "ready" && render.asset_id ? String(render.asset_id) : null,
    previewRevisionId: renderIsCurrent ? String(render?.revision_id) : null,
    renderStatus: renderIsCurrent ? render?.status as StoryboardPanel["renderStatus"] : "missing",
  };
}

function latestByPanel(rows: DbRow[]) {
  const result = new Map<string, DbRow>();
  for (const row of rows) {
    const key = String(row.panel_id);
    const current = result.get(key);
    const at = String(row.updated_at ?? row.acknowledged_at ?? "");
    const currentAt = String(current?.updated_at ?? current?.acknowledged_at ?? "");
    if (!current || at > currentAt) result.set(key, row);
  }
  return result;
}

async function loadAllRows(db: SupabaseClient, table: string, columns: string, filters: Record<string, string>) {
  const rows: DbRow[] = [];
  for (let from = 0; ; from += 500) {
    let query = db.from(table).select(columns);
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const result = await query.order("id", { ascending: true }).range(from, from + 499);
    if (result.error) throw new StoryboardError("storage", "No pudimos cargar el storyboard.", 500);
    rows.push(...((result.data ?? []) as unknown as DbRow[]));
    if ((result.data?.length ?? 0) < 500) break;
  }
  return rows;
}

async function loadRowsByIds(db: SupabaseClient, table: string, columns: string, field: string, ids: string[]) {
  const rows: DbRow[] = [];
  for (let index = 0; index < ids.length; index += 250) {
    const result = await db.from(table).select(columns).in(field, ids.slice(index, index + 250));
    if (result.error) throw new StoryboardError("storage", "No pudimos cargar el storyboard.", 500);
    rows.push(...((result.data ?? []) as unknown as DbRow[]));
  }
  return rows;
}

async function loadRowsByValues(
  db: SupabaseClient,
  table: string,
  columns: string,
  field: string,
  values: string[],
  filters: Record<string, string>,
) {
  const rows: DbRow[] = [];
  for (let index = 0; index < values.length; index += 100) {
    const chunk = values.slice(index, index + 100);
    for (let from = 0; ; from += 500) {
      let query = db.from(table).select(columns).in(field, chunk);
      for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
      const result = await query.order("id", { ascending: true }).range(from, from + 499);
      if (result.error) throw new StoryboardError("storage", "No pudimos revisar los assets del storyboard.", 500);
      rows.push(...((result.data ?? []) as unknown as DbRow[]));
      if ((result.data?.length ?? 0) < 500) break;
    }
  }
  return rows;
}

function rpcRow(result: { data: unknown; error: { code?: string; message?: string } | null }, fallback: string) {
  if (result.error) throw rpcError(result.error, fallback);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") throw new StoryboardError("storage", fallback, 500);
  const value = row as DbRow;
  return {
    panelId: String(value.panel_id),
    revisionId: String(value.revision_id),
    revisionNumber: Number(value.revision_number),
    noOp: Boolean(value.no_op),
  };
}

function rpcError(error: { code?: string; message?: string }, fallback: string) {
  const message = error.message ?? "";
  if (message.includes("REVISION_CONFLICT") || error.code === "40001") return new StoryboardError("conflict", "El panel cambió en otra pestaña.", 409);
  if (message.includes("NOT_FOUND")) return new StoryboardError("not_found", "Recurso no encontrado.", 404);
  if (message.includes("EMPTY_APPROVAL")) return new StoryboardError("invalid", "Un panel vacío no se puede aprobar.", 400);
  if (message.includes("INVALID") || error.code === "22023") return new StoryboardError("invalid", "Solicitud no válida.", 400);
  return new StoryboardError("storage", fallback, 500);
}
