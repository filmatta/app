"use server";

import { createClient } from "@/lib/supabase/server";
import { createProject, CreateProjectError } from "@/lib/create/project";
import { getCreateProjectContext } from "@/lib/create/project";
import { createEmptyWriterDocument, WRITER_SCHEMA_VERSION } from "@/lib/writer/document";

export async function createProjectAction(name: string, operationId: string): Promise<
  | { ok: true; id: string; writerId: string }
  | { ok: false; message: string }
> {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return { ok: false, message: "Inicia sesión para crear un proyecto." };
  try {
    const result = await createProject(db, auth.data.user.id, name, operationId);
    return { ok: true, ...result };
  } catch (cause) {
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(operationId)) {
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
    if (cause instanceof CreateProjectError) return { ok: false, message: cause.message };
    return { ok: false, message: "No pudimos crear el guion en este proyecto." };
  }
}
