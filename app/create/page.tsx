import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCreateProjects } from "@/lib/create/project";
import ProjectDashboard from "@/components/create/ProjectDashboard";
import "@/components/create/project-workspace.css";

export const metadata: Metadata = { title: "Create · Projects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) redirect("/login?next=/create");
  const projects = await listCreateProjects(db, auth.data.user.id);
  return <ProjectDashboard projects={projects} />;
}
