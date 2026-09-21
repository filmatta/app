import { notFound, redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ProjectForm from "@/components/networking/ProjectForm";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/networking/types";
export const metadata = { title: "Proyecto privado", robots: { index: false, follow: false } };
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { slug } = await params, viewer = await getViewer(); if (!viewer) redirect(`/login?next=${encodeURIComponent(`/proyectos/${slug}`)}`);
  const db = await createClient(); const { data, error } = await db.from("projects").select("*").eq("owner_id", viewer.id).eq("slug", slug).eq("networking_private", true).maybeSingle();
  if (error) throw new Error("No pudimos cargar el proyecto."); if (!data) notFound();
  const saved = (await searchParams).saved;
  return <div className="editorial-page"><SiteHeader contextLink={{ href: "/proyectos", label: "← Mis proyectos" }} /><main className="network-shell"><header className="network-heading"><p className="eyebrow">PROYECTO PRIVADO</p><h1>{data.title}</h1>{saved && <p role="status">Proyecto guardado.</p>}<p>Esta URL es estable y sólo tú puedes abrir el proyecto.</p></header><ProjectForm initial={data as Project} /></main></div>;
}
