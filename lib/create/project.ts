import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCreateUuid } from "./uuid";

export type CreateEntryModule = "writer" | "shotlist" | "storyboard" | "production";
export type CreateArtifact = { id: string; title: string; projectId: string; updatedAt?: string };
export type CreateProjectListItem = {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  activityAt: string;
  entryModule: CreateEntryModule | null;
  coverImagePath: string | null;
  modules: CreateEntryModule[];
};
export type CreateProjectContext = {
  id: string;
  name: string;
  ownerId: string;
  writers: CreateArtifact[];
  shotlists: (CreateArtifact & { scriptId: string | null })[];
  storyboards: (CreateArtifact & { panelCount: number })[];
  productions: CreateArtifact[];
  entryModule?: CreateEntryModule | null;
  coverImagePath?: string | null;
  updatedAt?: string;
  createdAt?: string;
};

export class CreateProjectError extends Error {
  constructor(readonly code: "invalid" | "not_found" | "storage", message: string) { super(message); }
}

const ENTRY_MODULES: CreateEntryModule[] = ["writer", "shotlist", "storyboard", "production"];

export function isCreateEntryModule(value: string): value is CreateEntryModule {
  return ENTRY_MODULES.includes(value as CreateEntryModule);
}

export async function createProject(db: SupabaseClient, ownerId: string, name: string, entryModule: string, operationId: string) {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 160 || !isCreateUuid(operationId) || !isCreateEntryModule(entryModule)) {
    throw new CreateProjectError("invalid", "Revisa el nombre y el punto de entrada del proyecto.");
  }
  const created = await db.rpc("create_workspace_project_v1", {
    p_operation_id: operationId, p_title: cleanName, p_entry_module: entryModule,
  });
  if (created.error || typeof created.data !== "string" || !isCreateUuid(created.data)) {
    throw new CreateProjectError("storage", "No pudimos crear el proyecto. Intenta de nuevo.");
  }
  const owned = await db.from("projects").select("id").eq("id", created.data)
    .eq("owner_id", ownerId).eq("create_enabled", true).maybeSingle();
  if (owned.error || !owned.data) throw new CreateProjectError("storage", "No pudimos confirmar el proyecto creado.");
  return { id: created.data };
}

export async function listCreateProjects(db: SupabaseClient, ownerId: string): Promise<CreateProjectListItem[]> {
  const projects = await db.from("projects").select("id,title,created_at,updated_at,entry_module,cover_image_path").eq("owner_id", ownerId)
    .eq("create_enabled", true).neq("lifecycle_status", "archived").order("updated_at", { ascending: false });
  if (projects.error) throw new CreateProjectError("storage", "No pudimos cargar tus proyectos.");
  if (!projects.data?.length) return [];
  const [scripts, shotlists, panels, productions] = await Promise.all([
    db.from("writer_scripts").select("project_id,updated_at").eq("owner_id", ownerId).not("project_id", "is", null),
    db.from("writer_shotlists").select("project_id,updated_at").eq("owner_id", ownerId).not("project_id", "is", null),
    db.from("storyboard_panels").select("project_id,updated_at,current_revision_id").eq("owner_id", ownerId).not("project_id", "is", null),
    db.from("production_plans").select("project_id,updated_at").eq("owner_id", ownerId).not("project_id", "is", null),
  ]);
  if (scripts.error || shotlists.error || panels.error || productions.error) {
    throw new CreateProjectError("storage", "No pudimos cargar la actividad de tus proyectos.");
  }
  const modules = new Map<string, Set<CreateEntryModule>>();
  const activity = new Map<string, string>();
  function record(projectId: unknown, updatedAt: unknown, module: CreateEntryModule) {
    if (!projectId) return;
    const id = String(projectId);
    modules.set(id, (modules.get(id) ?? new Set<CreateEntryModule>()).add(module));
    const timestamp = String(updatedAt ?? "");
    if (timestamp > (activity.get(id) ?? "")) activity.set(id, timestamp);
  }
  for (const row of scripts.data ?? []) record(row.project_id, row.updated_at, "writer");
  for (const row of shotlists.data ?? []) record(row.project_id, row.updated_at, "shotlist");
  for (const row of panels.data ?? []) if (row.current_revision_id) record(row.project_id, row.updated_at, "storyboard");
  for (const row of productions.data ?? []) record(row.project_id, row.updated_at, "production");
  return projects.data.map((row) => {
    const id = String(row.id);
    const entryModule = typeof row.entry_module === "string" && isCreateEntryModule(row.entry_module) ? row.entry_module : null;
    const present = modules.get(id) ?? new Set<CreateEntryModule>();
    if (entryModule) present.add(entryModule);
    return {
      id, name: String(row.title), updatedAt: String(row.updated_at), createdAt: String(row.created_at),
      activityAt: [String(row.updated_at), activity.get(id) ?? ""].sort().at(-1)!,
      entryModule, coverImagePath: row.cover_image_path ? String(row.cover_image_path) : null,
      modules: ENTRY_MODULES.filter((module) => present.has(module)),
    };
  }).sort((a, b) => b.activityAt.localeCompare(a.activityAt));
}

export async function getCreateProjectContext(db: SupabaseClient, ownerId: string, projectId: string): Promise<CreateProjectContext> {
  if (!isCreateUuid(projectId)) throw new CreateProjectError("not_found", "Proyecto no encontrado.");
  const project = await db.from("projects").select("id,owner_id,title,lifecycle_status,entry_module,cover_image_path,updated_at,created_at")
    .eq("id", projectId).eq("owner_id", ownerId).eq("create_enabled", true).maybeSingle();
  if (project.error || !project.data || project.data.lifecycle_status === "archived") {
    throw new CreateProjectError("not_found", "Proyecto no encontrado.");
  }
  const [writers, shotlists, panels, productions] = await Promise.all([
    db.from("writer_scripts").select("id,title,project_id,updated_at").eq("owner_id", ownerId).eq("project_id", projectId).order("updated_at", { ascending: false }),
    db.from("writer_shotlists").select("id,title,script_id,project_id,updated_at").eq("owner_id", ownerId).eq("project_id", projectId).order("updated_at", { ascending: false }),
    db.from("storyboard_panels").select("id,shotlist_id,current_revision_id").eq("owner_id", ownerId).eq("project_id", projectId),
    db.from("production_plans").select("id,name,project_id,updated_at").eq("owner_id", ownerId).eq("project_id", projectId).order("updated_at", { ascending: false }),
  ]);
  if (writers.error || shotlists.error || panels.error || productions.error) {
    throw new CreateProjectError("storage", "No pudimos cargar los módulos del proyecto.");
  }
  const panelCount = new Map<string, number>();
  for (const panel of panels.data ?? []) {
    if (!panel.current_revision_id) continue;
    const shotlistId = String(panel.shotlist_id);
    panelCount.set(shotlistId, (panelCount.get(shotlistId) ?? 0) + 1);
  }
  const shotlistItems = (shotlists.data ?? []).map((row) => ({
    id: String(row.id), title: String(row.title), projectId,
    scriptId: row.script_id ? String(row.script_id) : null, updatedAt: String(row.updated_at),
  }));
  return {
    id: projectId,
    name: String(project.data.title),
    ownerId,
    entryModule: typeof project.data.entry_module === "string" && isCreateEntryModule(project.data.entry_module) ? project.data.entry_module : null,
    coverImagePath: project.data.cover_image_path ? String(project.data.cover_image_path) : null,
    updatedAt: String(project.data.updated_at), createdAt: String(project.data.created_at),
    writers: (writers.data ?? []).map((row) => ({ id: String(row.id), title: String(row.title), projectId, updatedAt: String(row.updated_at) })),
    shotlists: shotlistItems,
    storyboards: shotlistItems.map((row) => ({ id: row.id, title: row.title, projectId, panelCount: panelCount.get(row.id) ?? 0 })),
    productions: (productions.data ?? []).map((row) => ({ id: String(row.id), title: String(row.name), projectId, updatedAt: String(row.updated_at) })),
  };
}
