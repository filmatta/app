import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmptyWriterDocument, WRITER_SCHEMA_VERSION } from "@/lib/writer/document";

export type CreateArtifact = { id: string; title: string; projectId: string };
export type CreateProjectContext = {
  id: string;
  name: string;
  ownerId: string;
  writers: CreateArtifact[];
  shotlists: (CreateArtifact & { scriptId: string | null })[];
  storyboards: (CreateArtifact & { panelCount: number })[];
  productions: CreateArtifact[];
};

export class CreateProjectError extends Error {
  constructor(readonly code: "invalid" | "not_found" | "storage", message: string) { super(message); }
}

export async function createProject(db: SupabaseClient, ownerId: string, name: string, operationId: string) {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 160 || !UUID.test(operationId)) {
    throw new CreateProjectError("invalid", "Escribe un nombre de proyecto válido.");
  }
  // Writer's insert trigger creates the private Project in the same transaction.
  const created = await db.rpc("writer_create_script", {
    p_operation_id: operationId,
    p_title: cleanName,
    p_document: createEmptyWriterDocument(),
    p_schema_version: WRITER_SCHEMA_VERSION,
  });
  if (created.error) throw new CreateProjectError("storage", "No pudimos crear el proyecto y su guion.");
  const row = Array.isArray(created.data) ? created.data[0] : created.data;
  const writerId = row?.id ? String(row.id) : null;
  if (!writerId) throw new CreateProjectError("storage", "No pudimos abrir el guion inicial.");
  const writer = await db.from("writer_scripts").select("id,project_id")
    .eq("id", writerId).eq("owner_id", ownerId).maybeSingle();
  if (writer.error || !writer.data?.project_id) throw new CreateProjectError("storage", "No pudimos resolver el contexto del proyecto.");
  return { id: String(writer.data.project_id), writerId };
}

export async function listCreateProjects(db: SupabaseClient, ownerId: string) {
  const [projects, writers, shotlists, productions] = await Promise.all([
    db.from("projects").select("id,title,updated_at").eq("owner_id", ownerId).neq("lifecycle_status", "archived").order("updated_at", { ascending: false }),
    db.from("writer_scripts").select("project_id").eq("owner_id", ownerId).not("project_id", "is", null),
    db.from("writer_shotlists").select("project_id").eq("owner_id", ownerId).not("project_id", "is", null),
    db.from("production_plans").select("project_id").eq("owner_id", ownerId).not("project_id", "is", null),
  ]);
  if (projects.error || writers.error || shotlists.error || productions.error) {
    throw new CreateProjectError("storage", "No pudimos cargar tus proyectos Create.");
  }
  const activeIds = new Set([...writers.data ?? [], ...shotlists.data ?? [], ...productions.data ?? []].map((row) => String(row.project_id)));
  return (projects.data ?? []).filter((row) => activeIds.has(String(row.id)))
    .map((row) => ({ id: String(row.id), name: String(row.title), updatedAt: String(row.updated_at) }));
}

export async function getCreateProjectContext(db: SupabaseClient, ownerId: string, projectId: string): Promise<CreateProjectContext> {
  if (!UUID.test(projectId)) throw new CreateProjectError("not_found", "Proyecto no encontrado.");
  const project = await db.from("projects").select("id,owner_id,title,lifecycle_status")
    .eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (project.error || !project.data || project.data.lifecycle_status === "archived") {
    throw new CreateProjectError("not_found", "Proyecto no encontrado.");
  }
  const [writers, shotlists, panels, productions] = await Promise.all([
    db.from("writer_scripts").select("id,title,project_id").eq("owner_id", ownerId).eq("project_id", projectId).order("updated_at", { ascending: false }),
    db.from("writer_shotlists").select("id,title,script_id,project_id").eq("owner_id", ownerId).eq("project_id", projectId).order("updated_at", { ascending: false }),
    db.from("storyboard_panels").select("id,shotlist_id").eq("owner_id", ownerId).eq("project_id", projectId),
    db.from("production_plans").select("id,name,project_id").eq("owner_id", ownerId).eq("project_id", projectId).order("updated_at", { ascending: false }),
  ]);
  if (writers.error || shotlists.error || panels.error || productions.error) {
    throw new CreateProjectError("storage", "No pudimos cargar los módulos del proyecto.");
  }
  const panelCount = new Map<string, number>();
  for (const panel of panels.data ?? []) {
    const shotlistId = String(panel.shotlist_id);
    panelCount.set(shotlistId, (panelCount.get(shotlistId) ?? 0) + 1);
  }
  const shotlistItems = (shotlists.data ?? []).map((row) => ({
    id: String(row.id), title: String(row.title), projectId,
    scriptId: row.script_id ? String(row.script_id) : null,
  }));
  return {
    id: projectId,
    name: String(project.data.title),
    ownerId,
    writers: (writers.data ?? []).map((row) => ({ id: String(row.id), title: String(row.title), projectId })),
    shotlists: shotlistItems,
    storyboards: shotlistItems.map((row) => ({ id: row.id, title: row.title, projectId, panelCount: panelCount.get(row.id) ?? 0 })),
    productions: (productions.data ?? []).map((row) => ({ id: String(row.id), title: String(row.name), projectId })),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
