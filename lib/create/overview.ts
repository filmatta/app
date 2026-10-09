import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateWriterDocument } from "@/lib/writer/document";
import { deriveWriterSceneSources } from "@/lib/writer/script-assistant";
import { CreateProjectError, type CreateProjectContext } from "./project";

export type CreateProjectOverview = {
  scriptScenes: number | null;
  scriptUpdatedAt: string | null;
  coveredScenes: number | null;
  totalScenes: number | null;
  visualizedShots: number | null;
  totalShots: number | null;
  scheduledShots: number | null;
  productionDays: number;
  activityAt: string;
};

export async function getCreateProjectOverview(
  db: SupabaseClient,
  ownerId: string,
  project: CreateProjectContext,
): Promise<CreateProjectOverview> {
  const [scripts, shotlists, panels, productions] = await Promise.all([
    db.from("writer_scripts").select("id,document,updated_at").eq("owner_id", ownerId).eq("project_id", project.id),
    db.from("writer_shotlists").select("id,updated_at").eq("owner_id", ownerId).eq("project_id", project.id),
    db.from("storyboard_panels").select("id,shot_id,current_revision_id,updated_at").eq("owner_id", ownerId).eq("project_id", project.id),
    db.from("production_plans").select("id,updated_at").eq("owner_id", ownerId).eq("project_id", project.id),
  ]);
  if (scripts.error || shotlists.error || panels.error || productions.error) {
    throw new CreateProjectError("storage", "No pudimos cargar el estado del proyecto.");
  }
  const sceneIds = new Set<string>();
  let validScriptCount = 0;
  for (const script of scripts.data ?? []) {
    const parsed = validateWriterDocument(script.document);
    if (!parsed.ok) continue;
    validScriptCount += 1;
    for (const scene of deriveWriterSceneSources(parsed.document)) {
      if (scene.blocks.some((block) => block.text.trim())) sceneIds.add(scene.sceneId);
    }
  }
  const shotlistIds = (shotlists.data ?? []).map((row) => String(row.id));
  const productionIds = (productions.data ?? []).map((row) => String(row.id));
  const revisionIds = (panels.data ?? []).flatMap((row) => row.current_revision_id ? [String(row.current_revision_id)] : []);
  const [groups, shots, revisions, days, schedule] = await Promise.all([
    shotlistIds.length ? db.from("writer_shotlist_groups").select("id,source_scene_id").eq("owner_id", ownerId).in("shotlist_id", shotlistIds) : null,
    shotlistIds.length ? db.from("writer_shotlist_shots").select("id,group_id").eq("owner_id", ownerId).in("shotlist_id", shotlistIds) : null,
    revisionIds.length ? db.from("storyboard_panel_revisions").select("id,content_kind").eq("owner_id", ownerId).in("id", revisionIds) : null,
    productionIds.length ? db.from("production_days").select("id").eq("owner_id", ownerId).in("production_id", productionIds) : null,
    productionIds.length ? db.from("production_schedule_items").select("source_shot_id,day_id").eq("owner_id", ownerId).in("production_id", productionIds).not("day_id", "is", null).not("source_shot_id", "is", null) : null,
  ]);
  if (groups?.error || shots?.error || revisions?.error || days?.error || schedule?.error) {
    throw new CreateProjectError("storage", "No pudimos cargar las métricas del proyecto.");
  }
  const shotIds = new Set((shots?.data ?? []).map((row) => String(row.id)));
  const groupScenes = new Map((groups?.data ?? []).map((row) => [String(row.id), row.source_scene_id ? String(row.source_scene_id) : null]));
  const coveredScenes = new Set<string>();
  for (const shot of shots?.data ?? []) {
    const sceneId = groupScenes.get(String(shot.group_id));
    if (sceneId && sceneIds.has(sceneId)) coveredScenes.add(sceneId);
  }
  const visualRevisions = new Set((revisions?.data ?? []).filter((row) => row.content_kind !== "empty").map((row) => String(row.id)));
  const visualizedShots = new Set<string>();
  for (const panel of panels.data ?? []) {
    if (panel.current_revision_id && visualRevisions.has(String(panel.current_revision_id)) && shotIds.has(String(panel.shot_id))) {
      visualizedShots.add(String(panel.shot_id));
    }
  }
  const scheduledShots = new Set((schedule?.data ?? [])
    .filter((row) => row.source_shot_id && shotIds.has(String(row.source_shot_id)))
    .map((row) => String(row.source_shot_id)));
  const activityAt = [project.updatedAt ?? "", ...(scripts.data ?? []).map((row) => String(row.updated_at)),
    ...(shotlists.data ?? []).map((row) => String(row.updated_at)), ...(panels.data ?? []).map((row) => String(row.updated_at)),
    ...(productions.data ?? []).map((row) => String(row.updated_at))].sort().at(-1) ?? project.updatedAt ?? "";
  return {
    scriptScenes: validScriptCount ? sceneIds.size : null,
    scriptUpdatedAt: (scripts.data ?? []).map((row) => String(row.updated_at)).sort().at(-1) ?? null,
    coveredScenes: validScriptCount ? coveredScenes.size : null,
    totalScenes: validScriptCount ? sceneIds.size : null,
    visualizedShots: shotIds.size ? visualizedShots.size : null,
    totalShots: shotIds.size || shotlistIds.length ? shotIds.size : null,
    scheduledShots: shotIds.size ? scheduledShots.size : null,
    productionDays: days?.data?.length ?? 0,
    activityAt,
  };
}
