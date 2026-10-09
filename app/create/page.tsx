import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreateProjectContext, listCreateProjects } from "@/lib/create/project";
import { getCreateProjectOverview } from "@/lib/create/overview";
import { getRecentProjectDocuments } from "@/lib/create/recent-documents";
import SiteHeader from "@/components/SiteHeader";
import ProjectDashboard from "@/components/create/ProjectDashboard";
import ProjectDashboardDetail, { ProjectDashboardInspector } from "@/components/create/ProjectDashboardDetail";
import "@/components/create/project-workspace.css";

export const metadata: Metadata = { title: "Create · Projects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CreatePage({ searchParams }: {
  searchParams: Promise<{ project?: string; q?: string; sort?: string }>;
}) {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) redirect("/login?next=/create");
  const query = await searchParams;
  const projects = await listCreateProjects(db, auth.data.user.id);
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
      detail={selectedProject && overview ? <ProjectDashboardDetail project={selectedProject} overview={overview} recentDocuments={recentDocuments} /> : null}
      inspector={selectedProject && overview ? <ProjectDashboardInspector project={selectedProject} overview={overview} /> : null} />
  </div>;
}
