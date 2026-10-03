import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ShotlistWorkspace from "@/components/shotlist/ShotlistWorkspace";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { loadWriterShotlist } from "@/lib/writer/production-server";

export const metadata: Metadata = { title: "Shotlist · FILMATTA", robots: { index: false, follow: false } };

export default async function ShotlistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string | string[]; shot?: string | string[] }>;
}) {
  const viewer = await getViewer();
  const { id } = await params;
  const { mode, shot } = await searchParams;
  if (!viewer) redirect(`/login?next=/shotlists/${encodeURIComponent(id)}`);
  const state = await loadShotlistOrNull(viewer.id, id);
  if (!state) notFound();
  return <ShotlistWorkspace initialState={state} initialMode={mode === "suggested" ? "suggested" : "manual"} initialShotId={typeof shot === "string" ? shot : undefined} />;
}

async function loadShotlistOrNull(userId: string, id: string) {
  try { return await loadWriterShotlist(await createClient(), userId, id); }
  catch { return null; }
}
