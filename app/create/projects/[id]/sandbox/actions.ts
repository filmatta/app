"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCreateProjectContext } from "@/lib/create/project";
import { isCreateUuid } from "@/lib/create/uuid";
import { buildSandboxProviderContext, type SandboxGuide } from "@/lib/create/sandbox/context";
import { generateSandboxResponse, SandboxAiError } from "@/lib/create/sandbox/ai-server";
import { isSandboxAiResponse, type SandboxMessage, type SandboxMode, type SandboxPossibility, type SandboxQuota } from "@/lib/create/sandbox/types";
import { recordCreateEvent } from "@/lib/create/telemetry";

type Failure = { ok: false; kind: "invalid" | "unavailable" | "limit" | "pending" | "conflict"; message: string; turnId?: string; conflict?: { id: string; content: string } };
type Success = { ok: true; sessionId?: string; turnId?: string; quota?: SandboxQuota };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const route = (projectId: string) => `/create/projects/${projectId}/sandbox`;

async function authorizedProject(projectId: string) {
  if (!isCreateUuid(projectId)) return null;
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return null;
  try {
    const project = await getCreateProjectContext(db, auth.data.user.id, projectId);
    return { db, project, ownerId: auth.data.user.id };
  } catch { return null; }
}

export async function sendSandboxMessageAction(input: {
  projectId: string; sessionId: string | null; turnId: string; content: string; mode: SandboxMode;
}): Promise<Success | Failure> {
  if (!isCreateUuid(input.projectId) || input.sessionId && !isCreateUuid(input.sessionId) ||
    !UUID.test(input.turnId) || !["divergence", "convergence"].includes(input.mode) ||
    !input.content.trim() || input.content.length > 4000) {
    return { ok: false, kind: "invalid", message: "Revisa el mensaje antes de enviarlo." };
  }
  const access = await authorizedProject(input.projectId);
  if (!access) return { ok: false, kind: "unavailable", message: "Este Project no está disponible." };
  const { db, project, ownerId } = access;
  const reservation = await db.rpc("sandbox_reserve_turn_v1", {
    p_project_id: project.id, p_session_id: input.sessionId, p_turn_id: input.turnId,
    p_content: input.content.trim(), p_mode: input.mode,
  });
  if (reservation.error || !reservation.data || typeof reservation.data !== "object") {
    return { ok: false, kind: "unavailable", message: "No pudimos guardar el mensaje. Inténtalo de nuevo." };
  }
  const claim = reservation.data as Record<string, unknown>;
  const sessionId = String(claim.sessionId ?? "");
  const quota: SandboxQuota = { plan: claim.plan === "unlocked" ? "unlocked" : "free",
    limit: Number(claim.limit ?? 0), used: Number(claim.used ?? 0) };
  if (!isCreateUuid(sessionId)) return { ok: false, kind: "unavailable", message: "No pudimos abrir Sandbox." };
  if (claim.status === "limit") {
    recordCreateEvent("sandbox_free_limit_reached", { userId: ownerId, projectId: project.id });
    return { ok: false, kind: "limit", message: "Has usado las respuestas incluidas. Tu conversación y tus decisiones siguen aquí.", turnId: input.turnId };
  }
  if (claim.status === "pending") return { ok: false, kind: "pending", message: "Esta respuesta sigue procesándose. Espera un momento y vuelve a cargar.", turnId: input.turnId };
  if (claim.status === "completed") return { ok: true, sessionId, turnId: input.turnId, quota };
  if (claim.status !== "reserved") return { ok: false, kind: "unavailable", message: "No pudimos iniciar la respuesta." };
  recordCreateEvent("sandbox_message_sent", { userId: ownerId, projectId: project.id, artifactId: input.turnId });
  try {
    const [guideResult, possibilitiesResult, messagesResult, sessionResult] = await Promise.all([
      db.from("create_ideation_guides").select("context,synthesis,source_draft_id").eq("project_id", project.id).eq("owner_id", ownerId).maybeSingle(),
      db.from("create_ideation_possibilities").select("id,content,title,state,conflicts_with_id,source_turn_id,created_at")
        .eq("project_id", project.id).eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(100),
      db.from("sandbox_messages").select("id,turn_id,role,content,created_at").eq("session_id", sessionId)
        .eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(30),
      db.from("sandbox_sessions").select("id,memory_summary").eq("id", sessionId).eq("project_id", project.id).eq("owner_id", ownerId).single(),
    ]);
    if (guideResult.error || possibilitiesResult.error || messagesResult.error || sessionResult.error || !sessionResult.data) throw new Error("context_unavailable");
    const context = buildSandboxProviderContext({
      project, guide: guideResult.data as SandboxGuide | null,
      possibilities: [...(possibilitiesResult.data ?? [])].reverse() as SandboxPossibility[],
      messages: [...(messagesResult.data ?? [])].reverse() as SandboxMessage[],
      memorySummary: String(sessionResult.data.memory_summary ?? ""), mode: input.mode,
    });
    const { response, usage } = await generateSandboxResponse(context, input.turnId);
    const knownCanon = new Set((possibilitiesResult.data ?? []).filter((item) => item.state === "canon").map((item) => item.id));
    response.possibilities = response.possibilities.map((item) => ({
      ...item, conflicts_with_canon_id: item.conflicts_with_canon_id && knownCanon.has(item.conflicts_with_canon_id)
        ? item.conflicts_with_canon_id : null,
    }));
    if (!isSandboxAiResponse(response)) throw new SandboxAiError("invalid_output", "Sandbox no pudo interpretar su respuesta.");
    const completed = await db.rpc("sandbox_complete_turn_v1", { p_turn_id: input.turnId, p_response: response, p_usage: usage });
    if (completed.error || completed.data !== true) throw new Error("save_response_failed");
    recordCreateEvent("sandbox_response_received", { userId: ownerId, projectId: project.id, artifactId: input.turnId });
    revalidatePath(route(project.id));
    const updatedQuota = { ...quota, used: quota.used + 1 };
    return { ok: true, sessionId, turnId: input.turnId, quota: updatedQuota };
  } catch (cause) {
    await db.rpc("sandbox_fail_turn_v1", { p_turn_id: input.turnId,
      p_error_code: cause instanceof SandboxAiError ? cause.code : "runtime" });
    revalidatePath(route(project.id));
    return { ok: false, kind: "unavailable", turnId: input.turnId,
      message: cause instanceof SandboxAiError ? cause.message : "Sandbox no pudo responder. Tu mensaje quedó guardado; inténtalo de nuevo." };
  }
}

export async function setSandboxModeAction(projectId: string, sessionId: string, mode: SandboxMode): Promise<Success | Failure> {
  if (!isCreateUuid(sessionId) || !["divergence", "convergence"].includes(mode)) return { ok: false, kind: "invalid", message: "Modo inválido." };
  const access = await authorizedProject(projectId);
  if (!access) return { ok: false, kind: "unavailable", message: "Project no disponible." };
  const changed = await access.db.rpc("sandbox_set_mode_v1", { p_project_id: projectId, p_session_id: sessionId, p_mode: mode });
  if (changed.error || changed.data !== true) return { ok: false, kind: "unavailable", message: "No pudimos guardar el modo." };
  revalidatePath(route(projectId));
  return { ok: true };
}

export async function setSandboxPossibilityAction(projectId: string, possibilityId: string,
  state: "proposed" | "maybe" | "canon" | "discarded",
  resolution?: "replace" | "coexist" | "maybe" | "cancel"): Promise<Success | Failure> {
  if (!isCreateUuid(possibilityId) || !["proposed","maybe","canon","discarded"].includes(state))
    return { ok: false, kind: "invalid", message: "Decisión inválida." };
  const access = await authorizedProject(projectId);
  if (!access) return { ok: false, kind: "unavailable", message: "Project no disponible." };
  const changed = await access.db.rpc("sandbox_set_possibility_state_v1", {
    p_project_id: projectId, p_possibility_id: possibilityId, p_state: state, p_resolution: resolution ?? null,
  });
  if (changed.error || !changed.data || typeof changed.data !== "object")
    return { ok: false, kind: "unavailable", message: "No pudimos guardar esta decisión." };
  const result = changed.data as Record<string, unknown>;
  if (result.status === "conflict") return { ok: false, kind: "conflict",
    message: "Esta decisión contradice una definición anterior.",
    conflict: { id: String(result.canonId), content: String(result.canonContent) } };
  if (result.status === "cancelled") return { ok: true };
  if (result.status !== "updated") return { ok: false, kind: "unavailable", message: "No pudimos guardar esta decisión." };
  recordCreateEvent(state === "canon" ? "sandbox_marked_canon" : state === "maybe" ? "sandbox_marked_maybe" :
    state === "discarded" ? "sandbox_possibility_discarded" : "sandbox_possibility_saved",
  { userId: access.ownerId, projectId, artifactId: possibilityId });
  revalidatePath(route(projectId));
  return { ok: true };
}

export async function sandboxUpgradeIntentAction(projectId: string): Promise<void> {
  const access = await authorizedProject(projectId);
  if (access) recordCreateEvent("sandbox_upgrade_clicked", { userId: access.ownerId, projectId });
}
