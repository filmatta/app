import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import WriterCompatibilityError from "@/components/writer/WriterCompatibilityError";
import WriterWorkspace from "@/components/writer/WriterWorkspace";
import CreateProjectNavigation from "@/components/create/CreateProjectNavigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { WRITER_SCHEMA_VERSION, validateWriterDocument } from "@/lib/writer/document";

export const metadata: Metadata = {
  title: "Editor · Writer",
  robots: { index: false, follow: false },
};

export default async function WriterDocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ project?: string }> }) {
  const viewer = await getViewer();
  const { id } = await params;
  const { project } = await searchParams;
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
  return <>
    <WriterWorkspace
      userId={viewer.id}
      previewNoCredits={process.env.VERCEL_ENV !== "production"}
      script={{
        id: result.data.id,
        title: result.data.title,
        document: validated.document,
        schemaVersion: result.data.schema_version,
        revision: Number(result.data.revision),
        updatedAt: result.data.updated_at,
      }}
    />
    <CreateProjectNavigation projectId={result.data.project_id} ownerId={viewer.id} active="writer" />
  </>;
}
