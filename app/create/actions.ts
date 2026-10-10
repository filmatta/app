"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createProject, CreateProjectError } from "@/lib/create/project";
import { getCreateProjectContext } from "@/lib/create/project";
import { createEmptyWriterDocument, WRITER_SCHEMA_VERSION } from "@/lib/writer/document";
import { recordCreateEvent, reportCreateFailure } from "@/lib/create/telemetry";
import { isCreateUuid } from "@/lib/create/uuid";
import type { CreateIntention, CreateOnboardingStatus } from "@/lib/create/onboarding";

const ONBOARDING_STATUSES: CreateOnboardingStatus[] = ["not_started", "intention_selected", "in_progress", "project_guided", "writer_opened", "completed", "skipped"];
const CREATE_INTENTIONS: CreateIntention[] = ["idea", "new_script", "existing_script"];

export async function saveCreateOnboardingAction(input: {
  status: CreateOnboardingStatus;
  intention?: CreateIntention | null;
  currentStep?: string | null;
  projectId?: string | null;
  writerId?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return { ok: false, message: "Inicia sesión para continuar." };
  if (!ONBOARDING_STATUSES.includes(input.status) || input.intention && !CREATE_INTENTIONS.includes(input.intention) || input.currentStep && input.currentStep.length > 80) return { ok: false, message: "Estado de onboarding inválido." };
  if (input.projectId) {
    try { await getCreateProjectContext(db, auth.data.user.id, input.projectId); }
    catch { return { ok: false, message: "El proyecto no está disponible." }; }
  }
  const payload: Record<string, unknown> = { owner_id: auth.data.user.id, status: input.status, updated_at: new Date().toISOString() };
  if (input.intention !== undefined) payload.intention = input.intention;
  if (input.currentStep !== undefined) payload.current_step = input.currentStep;
  if (input.projectId !== undefined) payload.project_id = input.projectId;
  if (input.writerId !== undefined) payload.writer_id = input.writerId;
  const saved = await db.from("create_onboarding_states").upsert(payload, { onConflict: "owner_id" });
  return saved.error ? { ok: false, message: "No pudimos guardar tu avance." } : { ok: true };
}

export async function saveCreateIdeaDraftAction(input: {
  idea: string;
  answers: Record<string, string>;
  currentQuestionId: string | null;
  currentStep: "capture" | "detail" | "ready";
}): Promise<{ ok: true; id: string; updatedAt: string } | { ok: false; message: string }> {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return { ok: false, message: "Inicia sesión para guardar tu idea." };
  if (input.idea.length > 10000 || !["capture", "detail", "ready"].includes(input.currentStep) || input.currentQuestionId && input.currentQuestionId.length > 80) return { ok: false, message: "Revisa el contenido del borrador." };
  const answers = Object.fromEntries(Object.entries(input.answers).filter(([key, value]) => key.length <= 80 && typeof value === "string" && value.length <= 10000));
  const updatedAt = new Date().toISOString();
  const current = await db.from("create_idea_drafts").select("id").eq("owner_id", auth.data.user.id).is("archived_at", null).maybeSingle();
  if (current.error) return { ok: false, message: "No pudimos sincronizar el borrador." };
  const payload = { owner_id: auth.data.user.id, idea: input.idea, answers, current_question_id: input.currentQuestionId, current_step: input.currentStep, updated_at: updatedAt };
  const saved = current.data
    ? await db.from("create_idea_drafts").update(payload).eq("id", current.data.id).eq("owner_id", auth.data.user.id).is("archived_at", null).select("id").single()
    : await db.from("create_idea_drafts").insert(payload).select("id").single();
  return saved.error || !saved.data ? { ok: false, message: "No pudimos sincronizar el borrador." } : { ok: true, id: saved.data.id, updatedAt };
}

export async function archiveCompletedIdeaDraftAction(): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return { ok: false, message: "Inicia sesión para empezar otra idea." };
  const draft = await db.from("create_idea_drafts").select("id,project_id").eq("owner_id", auth.data.user.id).is("archived_at", null).maybeSingle();
  if (draft.error) return { ok: false, message: "No pudimos iniciar otra idea." };
  if (!draft.data) return { ok: true };
  if (!draft.data.project_id) return { ok: false, message: "Termina o recupera tu borrador antes de empezar otra idea." };
  const guide = await db.from("create_ideation_guides").select("id").eq("project_id", draft.data.project_id).eq("owner_id", auth.data.user.id).maybeSingle();
  if (guide.error || !guide.data) return { ok: false, message: "No pudimos confirmar que tu idea anterior esté guardada en su Project." };
  const archived = await db.from("create_idea_drafts").update({ archived_at: new Date().toISOString() }).eq("id", draft.data.id).eq("owner_id", auth.data.user.id).is("archived_at", null).select("id").maybeSingle();
  return archived.error || !archived.data ? { ok: false, message: "No pudimos iniciar otra idea." } : { ok: true };
}

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
    if (project.writers[0]) return { ok: true, writerId: project.writers[0].id };
    const created = await db.rpc("writer_create_project_script_v1", {
      p_project_id: projectId,
      p_operation_id: operationId,
      p_title: project.name,
      p_document: createEmptyWriterDocument(),
      p_schema_version: WRITER_SCHEMA_VERSION,
    });
    if (created.error || typeof created.data !== "string") {
      reportCreateFailure("writer", `rpc:${created.error?.code ?? "empty"}`, created.error, projectId);
      return { ok: false, message: created.error?.message === "PROJECT_UNAVAILABLE" ? "Este proyecto ya no está disponible." : "No pudimos crear el guion en este proyecto." };
    }
    revalidatePath(`/create/projects/${projectId}`);
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
