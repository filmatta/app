"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createProject, getCreateProjectContext } from "@/lib/create/project";
import { createEmptyWriterDocument, WRITER_SCHEMA_VERSION } from "@/lib/writer/document";
import { analyzeIdea, IdeationAiError, synthesizeIdea, type IdeationUsage } from "@/lib/create/ideation/ai-server";
import { isIdeationAnalysis, isIdeationSynthesis, type IdeationAnalysis, type IdeationSynthesis } from "@/lib/create/ideation/contract";
import { isCreateUuid } from "@/lib/create/uuid";

type Failure = { ok: false; message: string };
type AnalysisResult = { ok: true; analysis: IdeationAnalysis; usage: IdeationUsage | null } | Failure;
type SynthesisResult = { ok: true; synthesis: IdeationSynthesis; usage: IdeationUsage | null } | Failure;

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function fail(cause: unknown): Failure { return { ok: false, message: cause instanceof IdeationAiError ? cause.message : "No pudimos completar la preparación. Reintenta; tu borrador está a salvo." }; }

export async function analyzeCreateIdeaAction(draftId: string): Promise<AnalysisResult> {
  if (!isCreateUuid(draftId)) return { ok: false, message: "Idea inválida." };
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, message: "Inicia sesión para preparar tu idea." };
  const draft = await db.from("create_idea_drafts").select("id,idea,analysis,analysis_hash,updated_at").eq("id", draftId).eq("owner_id", user.id).eq("status", "active").maybeSingle();
  if (draft.error || !draft.data?.idea?.trim()) return { ok: false, message: "Escribe una idea antes de continuar." };
  const ideaHash = hash(draft.data.idea);
  if (draft.data.analysis_hash === ideaHash && isIdeationAnalysis(draft.data.analysis)) return { ok: true, analysis: draft.data.analysis, usage: null };
  try {
    const { analysis, usage } = await analyzeIdea(draft.data.idea);
    const saved = await db.from("create_idea_drafts").update({ analysis, analysis_hash: ideaHash, synthesis: null, synthesis_hash: null, updated_at: new Date().toISOString() })
      .eq("id", draft.data.id).eq("owner_id", user.id).eq("status", "active").eq("updated_at", draft.data.updated_at).select("id").maybeSingle();
    if (saved.error || !saved.data) return { ok: false, message: "Tu idea cambió durante el análisis. Reintenta para analizar la versión más reciente." };
    return { ok: true, analysis, usage };
  } catch (cause) { return fail(cause); }
}

export async function synthesizeCreateIdeaAction(draftId: string): Promise<SynthesisResult> {
  if (!isCreateUuid(draftId)) return { ok: false, message: "Idea inválida." };
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, message: "Inicia sesión para preparar tu idea." };
  const draft = await db.from("create_idea_drafts").select("id,idea,answers,analysis,analysis_hash,synthesis,synthesis_hash,updated_at").eq("id", draftId).eq("owner_id", user.id).eq("status", "active").maybeSingle();
  if (draft.error || !draft.data?.idea?.trim() || !isIdeationAnalysis(draft.data.analysis) || draft.data.analysis_hash !== hash(draft.data.idea)) return { ok: false, message: "Primero analiza la versión actual de tu idea." };
  const answers = cleanAnswers(draft.data.answers);
  const sourceHash = hash({ idea: draft.data.idea, answers, analysis: draft.data.analysis });
  if (draft.data.synthesis_hash === sourceHash && isIdeationSynthesis(draft.data.synthesis)) return { ok: true, synthesis: draft.data.synthesis, usage: null };
  try {
    const { synthesis, usage } = await synthesizeIdea(draft.data.idea, answers, draft.data.analysis);
    const saved = await db.from("create_idea_drafts").update({ synthesis, synthesis_hash: sourceHash, current_step: "review", updated_at: new Date().toISOString() })
      .eq("id", draft.data.id).eq("owner_id", user.id).eq("status", "active").eq("updated_at", draft.data.updated_at).select("id").maybeSingle();
    if (saved.error || !saved.data) return { ok: false, message: "Tus respuestas cambiaron durante la preparación. Reintenta para incluirlas." };
    return { ok: true, synthesis, usage };
  } catch (cause) { return fail(cause); }
}

export async function saveIdeationSynthesisAction(draftId: string, synthesis: IdeationSynthesis): Promise<{ ok: true } | Failure> {
  if (!isCreateUuid(draftId)) return { ok: false, message: "Idea inválida." };
  if (!isIdeationSynthesis(synthesis)) return { ok: false, message: "Revisa la longitud del resumen o de los cues." };
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, message: "Inicia sesión para guardar los cambios." };
  const draft = await db.from("create_idea_drafts").select("id,idea,answers,analysis,analysis_hash,updated_at").eq("id", draftId).eq("owner_id", user.id).eq("status", "active").maybeSingle();
  if (draft.error || !draft.data || !isIdeationAnalysis(draft.data.analysis) || draft.data.analysis_hash !== hash(draft.data.idea)) return { ok: false, message: "La idea cambió. Analízala de nuevo antes de guardar el resumen." };
  const sourceHash = hash({ idea: draft.data.idea, answers: cleanAnswers(draft.data.answers), analysis: draft.data.analysis });
  const saved = await db.from("create_idea_drafts").update({ synthesis, synthesis_hash: sourceHash, current_step: "review", updated_at: new Date().toISOString() })
    .eq("id", draft.data.id).eq("owner_id", user.id).eq("status", "active").eq("updated_at", draft.data.updated_at).select("id").maybeSingle();
  return saved.error || !saved.data ? { ok: false, message: "La idea cambió mientras editabas. Revisa el resumen y reintenta." } : { ok: true };
}

export async function completeIdeationAction(draftId: string, name: string, destination: "writer" | "explore"): Promise<{ ok: true; href: string } | Failure> {
  if (!isCreateUuid(draftId)) return { ok: false, message: "Idea inválida." };
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 160 || !["writer", "explore"].includes(destination)) return { ok: false, message: "Escribe un nombre de proyecto válido." };
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, message: "Inicia sesión para continuar." };
  const found = await db.from("create_idea_drafts").select("id,idea,answers,analysis,analysis_hash,synthesis,synthesis_hash,prepare_operation_id,prepare_project_name,project_id,writer_id,status").eq("id", draftId).eq("owner_id", user.id).in("status", ["active", "converted"]).maybeSingle();
  const draft = found.data;
  if (found.error || !draft || !isIdeationAnalysis(draft.analysis) || !isIdeationSynthesis(draft.synthesis)) return { ok: false, message: "Prepara el resumen antes de continuar." };
  if (draft.status === "converted" && !draft.project_id) return { ok: false, message: "Esta idea ya fue convertida." };
  if (draft.analysis_hash !== hash(draft.idea) || draft.synthesis_hash !== hash({ idea: draft.idea, answers: cleanAnswers(draft.answers), analysis: draft.analysis })) return { ok: false, message: "Tu idea cambió. Actualiza el resumen antes de crear el proyecto." };
  try {
    let projectId: string = draft.project_id ?? "";
    if (!projectId) {
      let operationId = draft.prepare_operation_id as string | null;
      let reservedName = draft.prepare_project_name as string | null;
      if (!operationId) {
        operationId = randomUUID();
        const reserved = await db.from("create_idea_drafts").update({ prepare_operation_id: operationId, prepare_project_name: cleanName }).eq("id", draft.id).eq("owner_id", user.id).is("prepare_operation_id", null).select("prepare_operation_id,prepare_project_name").maybeSingle();
        if (reserved.error) throw new Error("reserve_failed");
        if (reserved.data) reservedName = reserved.data.prepare_project_name;
        if (!reserved.data) {
          const reread = await db.from("create_idea_drafts").select("prepare_operation_id,prepare_project_name").eq("id", draft.id).eq("owner_id", user.id).single();
          operationId = reread.data?.prepare_operation_id ?? null;
          reservedName = reread.data?.prepare_project_name ?? null;
        }
      }
      if (!operationId || !reservedName) throw new Error("reserve_failed");
      projectId = (await createProject(db, user.id, reservedName, "writer", operationId)).id;
      const linked = await db.from("create_idea_drafts").update({ project_id: projectId }).eq("id", draft.id).eq("owner_id", user.id);
      if (linked.error) throw new Error("link_failed");
    }
    await getCreateProjectContext(db, user.id, projectId);
    let writerId: string | null = draft.writer_id;
    if (destination === "writer" && !writerId) {
      const rpc = await db.rpc("writer_create_project_script_v1", { p_project_id: projectId, p_operation_id: randomUUID(), p_title: cleanName, p_document: createEmptyWriterDocument(), p_schema_version: WRITER_SCHEMA_VERSION });
      if (rpc.error || typeof rpc.data !== "string") throw new Error("writer_failed");
      writerId = rpc.data;
      const linked = await db.from("create_idea_drafts").update({ writer_id: writerId }).eq("id", draft.id).eq("owner_id", user.id);
      if (linked.error) throw new Error("writer_link_failed");
    }
    const context = { version: 1, originalIdea: draft.idea, answers: cleanAnswers(draft.answers), analysis: draft.analysis, acceptedDecisions: [] as string[] };
    const guide = await db.from("create_ideation_guides").upsert({ owner_id: user.id, project_id: projectId, writer_id: writerId, source_draft_id: draft.id, context, synthesis: draft.synthesis, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
    if (guide.error) throw new Error("guide_failed");
    const converted = await db.from("create_idea_drafts").update({ status: "converted", updated_at: new Date().toISOString() }).eq("id", draft.id).eq("owner_id", user.id).eq("project_id", projectId);
    if (converted.error) throw new Error("convert_failed");
    await db.from("create_onboarding_states").upsert({ owner_id: user.id, status: "completed", intention: "idea", current_step: destination === "writer" ? "writer_ready" : "explore_ready", project_id: projectId, writer_id: writerId, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
    revalidatePath("/create");
    return { ok: true, href: destination === "writer" ? `/writer/${writerId}?project=${projectId}&ideation=1` : `/create/projects/${projectId}/sandbox` };
  } catch {
    return { ok: false, message: "No pudimos terminar el traspaso. Reintenta: reutilizaremos el Project y Writer existentes." };
  }
}

function cleanAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => key.length <= 80 && typeof item === "string" && item.length <= 10000)) as Record<string, string>;
}
