import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CrearWorkspace from "@/components/crear/CrearWorkspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Idea · Crear",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CrearSessionPage({ params }: PageProps<"/crear/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) redirect(`/login?next=${encodeURIComponent(`/crear/${id}`)}`);

  return <CrearWorkspace sessionId={id} />;
}
