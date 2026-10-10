import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import WriterCompatibilityError from "@/components/writer/WriterCompatibilityError";
import WriterWorkspace from "@/components/writer/WriterWorkspace";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { WRITER_SCHEMA_VERSION, validateWriterDocument } from "@/lib/writer/document";
import { getCreateProjectContext } from "@/lib/create/project";
import { createProjectModuleRoute } from "@/lib/create/routes";
import { isIdeationSynthesis } from "@/lib/create/ideation/contract";

export const metadata: Metadata = {
  title: "Editor · Writer",
  robots: { index: false, follow: false },
};

export default async function WriterDocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ project?: string; onboarding?: string }> }) {
  const viewer = await getViewer();
  const { id } = await params;
  const { project, onboarding } = await searchParams;
  if (!viewer) redirect(`/login?next=/writer/${encodeURIComponent(id)}`);
  const supabase = await createClient();
  const result = await supabase
    .from("writer_scripts")
    .select("id,project_id,title,document,schema_version,revision,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (result.error || !result.data) notFound();
  if (project && project !== result.data.project_id) notFound();
  const validated = validateWriterDocument(result.data.document);
  if (!validated.ok || result.data.schema_version !== WRITER_SCHEMA_VERSION) {
    return <WriterCompatibilityError title={result.data.title} rawDocument={result.data.document} />;
  }
  const projectContext = result.data.project_id ? await getCreateProjectContext(supabase, viewer.id, result.data.project_id) : null;
  const guideRow = result.data.project_id ? await supabase.from("create_ideation_guides").select("synthesis")
    .eq("owner_id", viewer.id).eq("writer_id", id).eq("project_id", result.data.project_id).maybeSingle() : null;
  const ideationGuide = guideRow?.data && isIdeationSynthesis(guideRow.data.synthesis) ? guideRow.data.synthesis : null;
  const projectNavigation = projectContext ? { name: projectContext.name, items: [
    { label: "Overview", href: `/create/projects/${projectContext.id}` },
    { label: "Writer", href: createProjectModuleRoute(projectContext, "writer"), active: true },
    { label: "Breakdown", href: createProjectModuleRoute(projectContext, "breakdown") },
    { label: "Shotlist", href: createProjectModuleRoute(projectContext, "shotlist") },
    { label: "Storyboard", href: createProjectModuleRoute(projectContext, "storyboard") },
    { label: "Producción", href: createProjectModuleRoute(projectContext, "production") },
    { label: "Documentos", href: createProjectModuleRoute(projectContext, "documents") },
  ] } : undefined;
  return <WriterWorkspace
      userId={viewer.id}
      previewNoCredits={process.env.VERCEL_ENV !== "production"}
      ideationGuide={ideationGuide}
      ideationExploreHref={ideationGuide && result.data.project_id ? `/create/projects/${result.data.project_id}/explore` : null}
      projectNavigation={projectNavigation}
      onboarding={onboarding === "new_script" || onboarding === "existing_script" ? onboarding : null}
      script={{
        id: result.data.id,
        title: result.data.title,
        document: validated.document,
        schemaVersion: result.data.schema_version,
        revision: Number(result.data.revision),
        updatedAt: result.data.updated_at,
      }}
    />;
}
