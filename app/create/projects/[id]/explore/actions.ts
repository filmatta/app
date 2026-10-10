"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isCreateUuid } from "@/lib/create/uuid";

export async function addIdeationPossibility(projectId: string, form: FormData) {
  const content = String(form.get("content") ?? "").trim();
  if (!isCreateUuid(projectId) || !content || content.length > 2000) return;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const guide = await db.from("create_ideation_guides").select("id").eq("project_id", projectId).eq("owner_id", user.id).maybeSingle();
  if (guide.error || !guide.data) return;
  const result = await db.from("create_ideation_possibilities").insert({ owner_id: user.id, project_id: projectId, content, state: "maybe" });
  if (!result.error) revalidatePath(`/create/projects/${projectId}/explore`);
}

export async function setIdeationPossibilityState(projectId: string, itemId: string, state: "canon" | "maybe" | "discarded") {
  if (!isCreateUuid(projectId) || !isCreateUuid(itemId) || !["canon", "maybe", "discarded"].includes(state)) return;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const guide = await db.from("create_ideation_guides").select("id").eq("project_id", projectId).eq("owner_id", user.id).maybeSingle();
  if (guide.error || !guide.data) return;
  const updated = await db.from("create_ideation_possibilities").update({ state, updated_at: new Date().toISOString() }).eq("id", itemId).eq("project_id", projectId).eq("owner_id", user.id);
  if (!updated.error) revalidatePath(`/create/projects/${projectId}/explore`);
}
