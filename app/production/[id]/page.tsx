import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { loadProductionWorkspace, ProductionError } from "@/lib/production/server";
import ProductionWorkspace from "@/components/production/ProductionWorkspace";
import CreateProjectNavigation from "@/components/create/CreateProjectNavigation";
import { getCreateProjectContext } from "@/lib/create/project";
import { createProjectModuleRoute } from "@/lib/create/routes";

export const metadata: Metadata = { title: "Production Assistant · FILMATTA", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProductionWorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ project?: string }> }) {
  const viewer = await getViewer();
  const { id } = await params;
  const { project } = await searchParams;
  if (!viewer) redirect(`/login?next=/production/${id}`);
  let data;
  try {
    data = await loadProductionWorkspace(await createClient(), viewer.id, id);
  } catch (cause) {
    if (cause instanceof ProductionError && cause.code === "not_found") notFound();
    throw cause;
  }
  if (project && project !== data.production.projectId) notFound();
  const projectContext = data.production.projectId
    ? await getCreateProjectContext(await createClient(), viewer.id, data.production.projectId)
    : null;
  const projectRoutes = projectContext ? {
    writer: createProjectModuleRoute(projectContext, "writer"),
    breakdown: createProjectModuleRoute(projectContext, "breakdown"),
    shotlist: createProjectModuleRoute(projectContext, "shotlist"),
    storyboard: createProjectModuleRoute(projectContext, "storyboard"),
  } : null;
  return <><ProductionWorkspace initialData={data} viewerName={viewer.displayName} projectRoutes={projectRoutes} />
    <CreateProjectNavigation projectId={data.production.projectId} ownerId={viewer.id} active="production" context={projectContext ?? undefined} />
  </>;
}
