import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import StoryboardSketcher from "@/components/storyboard/StoryboardSketcher";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { loadStoryboardShot } from "@/lib/storyboard/server";

export const metadata: Metadata = { title: "Sketcher · FILMATTA", robots: { index: false, follow: false } };

export default async function StoryboardShotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; shotId: string }>;
  searchParams: Promise<{ panel?: string | string[] }>;
}) {
  const { id, shotId } = await params;
  const query = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/shotlists/${encodeURIComponent(id)}/storyboard/shots/${encodeURIComponent(shotId)}`);
  let state: Awaited<ReturnType<typeof loadStoryboardShot>>;
  try {
    state = await loadStoryboardShot(await createClient(), viewer.id, id, shotId);
  } catch {
    notFound();
  }
  if (!state.shot.panels.length) redirect(`/shotlists/${id}/storyboard`);
  const requestedPanel = typeof query.panel === "string" ? query.panel : null;
  const initialPanelId = state.shot.panels.some((panel) => panel.id === requestedPanel) ? requestedPanel! : state.shot.panels[0]!.id;
  return <StoryboardSketcher initialState={state} initialPanelId={initialPanelId} userId={viewer.id} />;
}
