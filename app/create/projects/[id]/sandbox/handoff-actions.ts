"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCreateProjectContext } from "@/lib/create/project";
import { isIdeationSynthesis, isRecord } from "@/lib/create/ideation/contract";
import { addSandboxGuideMaterial, emptySandboxSynthesis } from "@/lib/create/sandbox/handoff";
import { createEmptyWriterDocument, WRITER_SCHEMA_VERSION } from "@/lib/writer/document";
import { isCreateUuid } from "@/lib/create/uuid";
import { recordCreateEvent } from "@/lib/create/telemetry";

type HandoffInput = {
  projectId: string;
  operationId: string;
  selectedPossibilityIds: string[];
  questions: string[];
  newDecisions: string[];
};
type Result = { ok: true; href: string; guideId: string } | { ok: false; message: string };

export async function applySandboxHandoffAction(input: HandoffInput): Promise<Result> {
  if (!isCreateUuid(input.projectId) || !isCreateUuid(input.operationId) ||
    !Array.isArray(input.selectedPossibilityIds) || input.selectedPossibilityIds.length > 30 ||
    input.selectedPossibilityIds.some((id) => !isCreateUuid(id)) ||
    new Set(input.selectedPossibilityIds).size !== input.selectedPossibilityIds.length ||
    !validLines(input.questions, 12) || !validLines(input.newDecisions, 8)) {
    return { ok: false, message: "Revisa la selección antes de preparar Writer." };
  }
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return { ok: false, message: "Inicia sesión para continuar." };
  let project;
  try { project = await getCreateProjectContext(db, auth.data.user.id, input.projectId); }
  catch { return { ok: false, message: "Este Project no está disponible." }; }
  recordCreateEvent("sandbox_handoff_started", { userId: auth.data.user.id, projectId: project.id });
  const [guideResult, selectedResult] = await Promise.all([
    db.from("create_ideation_guides").select("context,synthesis,updated_at").eq("project_id", project.id).eq("owner_id", auth.data.user.id).maybeSingle(),
    input.selectedPossibilityIds.length ? db.from("create_ideation_possibilities").select("id,content,state")
      .eq("project_id", project.id).eq("owner_id", auth.data.user.id).in("id", input.selectedPossibilityIds) :
      Promise.resolve({ data: [], error: null }),
  ]);
  if (guideResult.error || selectedResult.error) return { ok: false, message: "No pudimos cargar la guía actual." };
  const selected = selectedResult.data ?? [];
  if (selected.length !== input.selectedPossibilityIds.length ||
    selected.some((item) => item.state !== "canon" && item.state !== "maybe")) {
    return { ok: false, message: "Alguna posibilidad cambió de estado. Revisa la selección." };
  }
  let writerId = project.writers[0]?.id ?? null;
  if (!writerId) {
    const created = await db.rpc("writer_create_project_script_v1", {
      p_project_id: project.id, p_operation_id: input.operationId, p_title: project.name,
      p_document: createEmptyWriterDocument(), p_schema_version: WRITER_SCHEMA_VERSION,
    });
    if (created.error || typeof created.data !== "string" || !isCreateUuid(created.data))
      return { ok: false, message: "No pudimos preparar Writer. Reintenta; no duplicaremos el guion." };
    writerId = created.data;
  }
  const priorContext = isRecord(guideResult.data?.context) ? guideResult.data.context : {};
  const priorSynthesis = isIdeationSynthesis(guideResult.data?.synthesis)
    ? guideResult.data.synthesis : emptySandboxSynthesis(project.summary ?? "");
  const chosen = input.selectedPossibilityIds.map((id) => selected.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const nextContext = { ...priorContext, sandboxHandoff: {
    version: 1, selectedIds: input.selectedPossibilityIds,
    questions: input.questions.map((value) => value.trim()),
    newDecisions: input.newDecisions.map((value) => value.trim()),
    updatedAt: new Date().toISOString(),
  } };
  const nextSynthesis = addSandboxGuideMaterial(priorSynthesis, chosen, input.questions, input.newDecisions);
  if (!isIdeationSynthesis(nextSynthesis)) return { ok: false, message: "La guía supera el tamaño admitido. Reduce la selección." };
  const applied = await db.rpc("sandbox_apply_handoff_v1", {
    p_project_id: project.id, p_operation_id: input.operationId, p_writer_id: writerId,
    p_selected_ids: input.selectedPossibilityIds, p_expected_updated_at: guideResult.data?.updated_at ?? null,
    p_context: nextContext, p_synthesis: nextSynthesis,
  });
  if (applied.error || typeof applied.data !== "string") return { ok: false, message: "No pudimos guardar la guía. Reintenta; conservamos la versión anterior." };
  recordCreateEvent("sandbox_handoff_applied", { userId: auth.data.user.id, projectId: project.id, artifactId: applied.data });
  revalidatePath(`/create/projects/${project.id}/sandbox`);
  revalidatePath(`/writer/${writerId}`);
  return { ok: true, href: `/writer/${writerId}?project=${project.id}&sandbox=1`, guideId: applied.data };
}

function validLines(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every((item) => typeof item === "string" && item.trim().length <= 300);
}
