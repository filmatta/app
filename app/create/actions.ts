"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createProject, CreateProjectError } from "@/lib/create/project";
import { getCreateProjectContext } from "@/lib/create/project";
import { createEmptyWriterDocument, WRITER_SCHEMA_VERSION } from "@/lib/writer/document";
import { recordCreateEvent, reportCreateFailure } from "@/lib/create/telemetry";
import { isCreateUuid } from "@/lib/create/uuid";

export async function createProjectAction(name: string, entryModule: string, operationId: string): Promise<
  | { ok: true; id: string }
  | { ok: false; message: string }
> {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return { ok: false, message: "Inicia sesión para crear un proyecto." };
  try {
    const result = await createProject(db, auth.data.user.id, name, entryModule, operationId);
    recordCreateEvent("project_created", { userId: auth.data.user.id, projectId: result.id });
    revalidatePath("/create");
    return { ok: true, ...result };
  } catch (cause) {
    reportCreateFailure("project", "create", cause);
    if (cause instanceof CreateProjectError) return { ok: false, message: cause.message };
    return { ok: false, message: "No pudimos crear el proyecto." };
  }
}

export async function createWriterInProjectAction(projectId: string, operationId: string): Promise<
  | { ok: true; writerId: string }
  | { ok: false; message: string }
> {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return { ok: false, message: "Inicia sesión para crear un guion." };
  if (!isCreateUuid(operationId)) {
    return { ok: false, message: "Solicitud inválida." };
  }
  try {
    const project = await getCreateProjectContext(db, auth.data.user.id, projectId);
    const created = await db.rpc("writer_create_project_script_v1", {
      p_project_id: projectId,
      p_operation_id: operationId,
      p_title: project.name,
      p_document: createEmptyWriterDocument(),
      p_schema_version: WRITER_SCHEMA_VERSION,
    });
    if (created.error || typeof created.data !== "string") return { ok: false, message: "No pudimos crear el guion en este proyecto." };
    return { ok: true, writerId: created.data };
  } catch (cause) {
    reportCreateFailure("writer", "create_in_project", cause, projectId);
    if (cause instanceof CreateProjectError) return { ok: false, message: cause.message };
    return { ok: false, message: "No pudimos crear el guion en este proyecto." };
  }
}

export async function createShotlistInProjectAction(projectId: string, scriptId: string, operationId: string): Promise<
  | { ok: true; shotlistId: string }
  | { ok: false; message: string }
> {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return { ok: false, message: "Inicia sesión para crear una Shotlist." };
  if (!isCreateUuid(operationId)) {
    return { ok: false, message: "Solicitud inválida." };
  }
  try {
    const project = await getCreateProjectContext(db, auth.data.user.id, projectId);
    if (!project.writers.some((writer) => writer.id === scriptId)) {
      return { ok: false, message: "Selecciona un guion de este proyecto." };
    }
    const created = await db.rpc("writer_create_project_shotlist_v1", {
      p_project_id: projectId,
      p_script_id: scriptId,
      p_title: `${project.name} · Shotlist`,
      p_operation_id: operationId,
    });
    if (created.error || typeof created.data !== "string") return { ok: false, message: "No pudimos crear la Shotlist." };
    revalidatePath(`/create/projects/${projectId}`);
    return { ok: true, shotlistId: created.data };
  } catch (cause) {
    reportCreateFailure("shotlist", "create_in_project", cause, projectId);
    if (cause instanceof CreateProjectError) return { ok: false, message: cause.message };
    return { ok: false, message: "No pudimos crear la Shotlist." };
  }
}
