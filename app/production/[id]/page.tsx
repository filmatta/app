import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { loadProductionWorkspace, ProductionError } from "@/lib/production/server";
import ProductionWorkspace from "@/components/production/ProductionWorkspace";

export const metadata: Metadata = { title: "Production Assistant · FILMATTA", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProductionWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const { id } = await params;
  if (!viewer) redirect(`/login?next=/production/${id}`);
  let data;
  try {
    data = await loadProductionWorkspace(await createClient(), viewer.id, id);
  } catch (cause) {
    if (cause instanceof ProductionError && cause.code === "not_found") notFound();
    throw cause;
  }
  return <ProductionWorkspace initialData={data} viewerName={viewer.displayName} />;
}
