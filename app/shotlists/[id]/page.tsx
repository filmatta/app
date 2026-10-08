import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ShotlistWorkspace from "@/components/shotlist/ShotlistWorkspace";
import CreateProjectNavigation from "@/components/create/CreateProjectNavigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { loadWriterShotlist } from "@/lib/writer/production-server";

export const metadata: Metadata = { title: "Shotlist · FILMATTA", robots: { index: false, follow: false } };

export default async function ShotlistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string | string[]; shot?: string | string[]; project?: string | string[] }>;
}) {
  const viewer = await getViewer();
  const { id } = await params;
  const { mode, shot, project } = await searchParams;
  if (!viewer) redirect(`/login?next=/shotlists/${encodeURIComponent(id)}`);
  const state = await loadShotlistOrNull(viewer.id, id);
  if (!state) notFound();
  if (project && project !== state.shotlist.projectId) notFound();
  const initialMode = mode === "suggested" || mode === "assisted" ? mode : "manual";
  return <><ShotlistWorkspace initialState={state} userId={viewer.id} initialMode={initialMode} initialShotId={typeof shot === "string" ? shot : undefined} />
    <CreateProjectNavigation projectId={state.shotlist.projectId} ownerId={viewer.id} active="shotlist" />
  </>;
}

async function loadShotlistOrNull(userId: string, id: string) {
  try { return await loadWriterShotlist(await createClient(), userId, id); }
  catch { return null; }
}
