import { notFound, redirect } from "next/navigation";
import ProjectMetadata, { ProjectStatus } from "@/components/networking/ProjectMetadata";
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
  await searchParams;
  return <div className="editorial-page"><SiteHeader contextLink={{ href: "/mis-proyectos", label: "← Mis proyectos" }} /><main className="network-shell"><header className="network-heading"><p className="eyebrow">PROYECTO</p><ProjectStatus project={data as Project} /><h1>{data.title}</h1><ProjectMetadata project={data as Project} />{data.summary && <p>{data.summary}</p>}<a className="network-link-button" href="#editar-proyecto">Editar proyecto ↓</a></header><ProjectForm initial={data as Project} /></main></div>;
}
