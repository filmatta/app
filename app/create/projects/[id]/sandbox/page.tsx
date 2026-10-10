import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateProjectError, getCreateProjectContext } from "@/lib/create/project";
import { isCreateUuid } from "@/lib/create/uuid";
import { initialSandboxBrief, sandboxEntryPrompts, type SandboxGuide } from "@/lib/create/sandbox/context";
import type { SandboxMessage, SandboxPossibility, SandboxQuota, SandboxSession, SandboxTurn } from "@/lib/create/sandbox/types";
import { recordCreateEvent } from "@/lib/create/telemetry";
import ProjectWorkspaceShell from "@/components/create/ProjectWorkspaceShell";
import SandboxWorkspace from "@/components/create/SandboxWorkspace";
import "./sandbox.css";

export const metadata: Metadata = { title: "Sandbox · FILMATTA", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SandboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isCreateUuid(id)) notFound();
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) redirect(`/login?next=/create/projects/${encodeURIComponent(id)}/sandbox`);
  let project;
  try { project = await getCreateProjectContext(db, auth.data.user.id, id); }
  catch (cause) { if (cause instanceof CreateProjectError && cause.code === "not_found") notFound(); throw cause; }
  const [sessionResult, guideResult, possibilityResult, quotaResult] = await Promise.all([
    db.from("sandbox_sessions").select("id,project_id,mode,status,memory_summary").eq("owner_id", auth.data.user.id)
      .eq("project_id", id).eq("status", "active").maybeSingle(),
    db.from("create_ideation_guides").select("context,synthesis,source_draft_id").eq("owner_id", auth.data.user.id)
      .eq("project_id", id).maybeSingle(),
    db.from("create_ideation_possibilities").select("id,content,title,state,conflicts_with_id,source_turn_id,created_at")
      .eq("owner_id", auth.data.user.id).eq("project_id", id).order("created_at", { ascending: false }).limit(200),
    db.rpc("sandbox_quota_v1"),
  ]);
  if (sessionResult.error || guideResult.error || possibilityResult.error || quotaResult.error) throw new Error("Sandbox data unavailable");
  const session = sessionResult.data as SandboxSession | null;
  const [turnResult, messageResult] = session ? await Promise.all([
    db.from("sandbox_turns").select("id,session_id,mode,status,response,error_code,created_at,updated_at").eq("owner_id", auth.data.user.id)
      .eq("session_id", session.id).order("created_at", { ascending: false }).limit(200),
    db.from("sandbox_messages").select("id,turn_id,role,content,created_at").eq("owner_id", auth.data.user.id)
      .eq("session_id", session.id).order("created_at", { ascending: false }).limit(400),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (turnResult.error || messageResult.error) throw new Error("Sandbox conversation unavailable");
  const guide = guideResult.data as SandboxGuide | null;
  const rawQuota = quotaResult.data as Record<string, unknown>;
  const quota: SandboxQuota = { plan: rawQuota?.plan === "unlocked" ? "unlocked" : "free",
    limit: Number(rawQuota?.limit ?? 3), used: Number(rawQuota?.used ?? 0) };
  recordCreateEvent("sandbox_opened", { userId: auth.data.user.id, projectId: id });
  return <ProjectWorkspaceShell project={project} active="sandbox">
    <SandboxWorkspace project={project} session={session} guide={guide}
      brief={initialSandboxBrief(project, guide)} entryPrompts={sandboxEntryPrompts(guide)}
      turns={[...(turnResult.data ?? [])].reverse() as SandboxTurn[]}
      messages={[...(messageResult.data ?? [])].reverse() as SandboxMessage[]}
      possibilities={[...(possibilityResult.data ?? [])].reverse() as SandboxPossibility[]} quota={quota} />
  </ProjectWorkspaceShell>;
}
