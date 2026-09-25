import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import WriterTimelineView from "@/components/writer/WriterTimeline";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { deriveWriterTimeline } from "@/lib/writer/timeline";
import "./timeline.css";

export const metadata: Metadata = {
  title: "Timeline · Writer",
  description: "Vista privada y de sólo lectura del orden de escenas.",
  robots: { index: false, follow: false },
};

export default async function WriterTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const { id } = await params;
  if (!viewer) redirect(`/login?next=/writer/${encodeURIComponent(id)}/timeline`);

  const supabase = await createClient();
  const result = await supabase
    .from("writer_scripts")
    .select("id,title,document,schema_version,revision,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (result.error || !result.data) notFound();

  const derived = deriveWriterTimeline({
    scriptId: result.data.id,
    title: result.data.title,
    document: result.data.document,
    schemaVersion: Number(result.data.schema_version),
    revision: Number(result.data.revision),
    updatedAt: result.data.updated_at,
  });

  if (!derived.ok) {
    return (
      <main className="timeline-private-state">
        <p className="timeline-eyebrow">Writer · Timeline</p>
        <h1>No se puede interpretar esta revisión</h1>
        <p>{derived.message} El guion no fue modificado.</p>
        <Link href="/writer">Volver a Writer</Link>
      </main>
    );
  }

  return <WriterTimelineView initialTimeline={derived.timeline} />;
}
