import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import StoryboardBoardView from "@/components/storyboard/StoryboardBoardView";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { loadStoryboardBoard } from "@/lib/storyboard/server";

export const metadata: Metadata = { title: "Storyboard · FILMATTA", robots: { index: false, follow: false } };

export default async function StoryboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/shotlists/${encodeURIComponent(id)}/storyboard`);
  let board: Awaited<ReturnType<typeof loadStoryboardBoard>>;
  try {
    board = await loadStoryboardBoard(await createClient(), viewer.id, id);
  } catch {
    notFound();
  }
  return <StoryboardBoardView initialBoard={board} userId={viewer.id} />;
}
