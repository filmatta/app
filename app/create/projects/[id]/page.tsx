import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateProjectError, getCreateProjectContext } from "@/lib/create/project";
import { getCreateProjectOverview } from "@/lib/create/overview";
import ProjectWorkspaceShell from "@/components/create/ProjectWorkspaceShell";
import ProjectOverview from "@/components/create/ProjectOverview";

export const metadata: Metadata = { title: "Project · Create", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CreateProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) redirect(`/login?next=/create/projects/${encodeURIComponent(id)}`);
  let project;
  try { project = await getCreateProjectContext(db, auth.data.user.id, id); }
  catch (cause) { if (cause instanceof CreateProjectError && cause.code === "not_found") notFound(); throw cause; }
  const overview = await getCreateProjectOverview(db, auth.data.user.id, project);
  return <ProjectWorkspaceShell project={project} active="overview"><ProjectOverview project={project} overview={overview} /></ProjectWorkspaceShell>;
}
