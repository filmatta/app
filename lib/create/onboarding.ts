import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateIntention = "idea" | "new_script" | "existing_script";
export type CreateOnboardingStatus = "not_started" | "intention_selected" | "in_progress" | "project_guided" | "writer_opened" | "completed" | "skipped";
export type CreateOnboardingState = { status: CreateOnboardingStatus; intention: CreateIntention | null; projectId: string | null; writerId: string | null; currentStep: string | null; updatedAt: string | null };
import { isIdeationAnalysis, isIdeationSynthesis, type IdeationAnalysis, type IdeationSynthesis } from "./ideation/contract";

export type CreateIdeaDraft = { id: string; status: "active" | "archived" | "converted"; idea: string; answers: Record<string,string>; currentQuestionId: string | null; currentStep: "capture" | "detail" | "ready" | "review" | "project_name"; analysis: IdeationAnalysis | null; analysisHash: string | null; synthesis: IdeationSynthesis | null; synthesisHash: string | null; projectId: string | null; writerId: string | null; updatedAt: string };

export async function getCreateOnboarding(db: SupabaseClient, ownerId: string): Promise<CreateOnboardingState | null> {
  const result = await db.from("create_onboarding_states").select("status,intention,project_id,writer_id,current_step,updated_at").eq("owner_id", ownerId).maybeSingle();
  if (result.error || !result.data) return null;
  return { status: result.data.status as CreateOnboardingStatus, intention: result.data.intention as CreateIntention | null, projectId: result.data.project_id, writerId: result.data.writer_id, currentStep: result.data.current_step, updatedAt: result.data.updated_at };
}

export async function listCreateIdeaDrafts(db: SupabaseClient, ownerId: string): Promise<CreateIdeaDraft[]> {
  const result = await db.from("create_idea_drafts").select("id,status,idea,answers,current_question_id,current_step,analysis,analysis_hash,synthesis,synthesis_hash,project_id,writer_id,updated_at").eq("owner_id", ownerId).order("updated_at", { ascending: false }).limit(20);
  if (result.error || !result.data) return [];
  return result.data.map((row): CreateIdeaDraft => {
    const answers = row.answers && typeof row.answers === "object" && !Array.isArray(row.answers) ? row.answers as Record<string,string> : {};
    return { id: row.id, status: row.status as CreateIdeaDraft["status"], idea: row.idea, answers, currentQuestionId: row.current_question_id, currentStep: row.current_step as CreateIdeaDraft["currentStep"], analysis: isIdeationAnalysis(row.analysis) ? row.analysis : null, analysisHash: row.analysis_hash, synthesis: isIdeationSynthesis(row.synthesis) ? row.synthesis : null, synthesisHash: row.synthesis_hash, projectId: row.project_id, writerId: row.writer_id, updatedAt: row.updated_at };
  });
}
