import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreateProjectContext, listCreateProjects } from "@/lib/create/project";
import { getCreateProjectOverview } from "@/lib/create/overview";
import { getRecentProjectDocuments } from "@/lib/create/recent-documents";
import SiteHeader from "@/components/SiteHeader";
import ProjectDashboard from "@/components/create/ProjectDashboard";
import { listCreateIdeaDrafts, getCreateOnboarding } from "@/lib/create/onboarding";
import "@/components/create/project-workspace.css";

export const metadata: Metadata = { title: "Create · Projects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function CreatePage({ searchParams }: {
  searchParams: Promise<{ project?: string; draft?: string; q?: string; sort?: string }>;
}) {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) redirect("/login?next=/create");
  const query = await searchParams;
  const projects = await listCreateProjects(db, auth.data.user.id);
  const [onboardingState, ideaDrafts] = await Promise.all([
    getCreateOnboarding(db, auth.data.user.id), listCreateIdeaDrafts(db, auth.data.user.id),
  ]);
  const ideaDraft = ideaDrafts.find((draft) => draft.id === query.draft && draft.status === "active") ?? ideaDrafts.find((draft) => draft.status === "active") ?? null;
  const selectedId = projects.find((project) => project.id === query.project)?.id ?? projects[0]?.id;
  const selectedProject = selectedId ? await getCreateProjectContext(db, auth.data.user.id, selectedId) : null;
  const [overview, recentDocuments] = selectedProject ? await Promise.all([
    getCreateProjectOverview(db, auth.data.user.id, selectedProject),
    getRecentProjectDocuments(db, auth.data.user.id, selectedProject),
  ]) : [null, []];
  return <div className="create-dashboard">
    <SiteHeader />
    <ProjectDashboard projects={projects} selectedProjectId={selectedId ?? null}
      initialSearch={query.q ?? ""} initialSort={query.sort === "name" ? "name" : "recent"}
      initialSelection={selectedProject && overview ? { project: selectedProject, overview, recentDocuments } : null}
      ownerId={auth.data.user.id} onboardingState={onboardingState} ideaDraft={ideaDraft} ideaDrafts={ideaDrafts}
      autoOpenOnboarding={projects.length === 0 && (!onboardingState || !["completed", "skipped"].includes(onboardingState.status))} />
  </div>;
}
