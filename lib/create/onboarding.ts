import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateIntention = "idea" | "new_script" | "existing_script";
export type CreateOnboardingStatus = "not_started" | "intention_selected" | "in_progress" | "project_guided" | "writer_opened" | "completed" | "skipped";
export type CreateOnboardingState = { status: CreateOnboardingStatus; intention: CreateIntention | null; projectId: string | null; writerId: string | null; currentStep: string | null; updatedAt: string | null };
export type CreateIdeaDraft = { id: string; idea: string; answers: Record<string,string>; currentQuestionId: string | null; currentStep: "capture" | "detail" | "ready"; updatedAt: string };

export async function getCreateOnboarding(db: SupabaseClient, ownerId: string): Promise<CreateOnboardingState | null> {
  const result = await db.from("create_onboarding_states").select("status,intention,project_id,writer_id,current_step,updated_at").eq("owner_id", ownerId).maybeSingle();
  if (result.error || !result.data) return null;
  return { status: result.data.status as CreateOnboardingStatus, intention: result.data.intention as CreateIntention | null, projectId: result.data.project_id, writerId: result.data.writer_id, currentStep: result.data.current_step, updatedAt: result.data.updated_at };
}

export async function getCreateIdeaDraft(db: SupabaseClient, ownerId: string): Promise<CreateIdeaDraft | null> {
  const result = await db.from("create_idea_drafts").select("id,idea,answers,current_question_id,current_step,updated_at").eq("owner_id", ownerId).maybeSingle();
  if (result.error || !result.data) return null;
  const answers = result.data.answers && typeof result.data.answers === "object" && !Array.isArray(result.data.answers) ? result.data.answers as Record<string,string> : {};
  return { id: result.data.id, idea: result.data.idea, answers, currentQuestionId: result.data.current_question_id, currentStep: result.data.current_step as CreateIdeaDraft["currentStep"], updatedAt: result.data.updated_at };
}
