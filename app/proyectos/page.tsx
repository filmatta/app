import ProjectMetadata, { ProjectStatus } from "@/components/networking/ProjectMetadata";
import FeedbackToast from "@/components/ui/FeedbackToast";
import type { Project } from "@/lib/networking/types";
import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import "@/components/networking/networking.css";
export const metadata = { title: "Mis proyectos", robots: { index: false, follow: false } };
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const created = (await searchParams).created === "1";
  const viewer = await getViewer(); if (!viewer) redirect("/login?next=%2Fproyectos");
  const db = await createClient();
  const { data, error } = await db.from("projects").select("*").eq("owner_id", viewer.id).eq("networking_private", true).order("created_at", { ascending: false }).limit(100);
  return <div className="editorial-page"><SiteHeader /><main className="network-shell">{created && <FeedbackToast message="Proyecto creado" />}<header className="network-heading"><p className="eyebrow">TU ESPACIO</p><h1>Mis proyectos</h1><p>El contexto de tu próxima colaboración. Tus proyectos son privados.</p><Link className="network-link-button" href="/proyectos/nuevo">Crear proyecto</Link></header>
    {error ? <p role="alert">No pudimos cargar tus proyectos.</p> : !data?.length ? <div className="network-empty"><h2>Aún no tienes proyectos.</h2><p>Crea uno para organizar una producción y adjuntarlo a tus solicitudes de contacto.</p><Link className="network-link-button" href="/proyectos/nuevo">+ Crear proyecto</Link></div> : <div className="network-project-grid">{data.map(p => <Link className="network-card" key={p.id} href={`/proyectos/${p.slug}`}><div className="network-entity-heading"><ProjectStatus project={p as Project} /><h2>{p.title}</h2></div><ProjectMetadata project={p as Project} /><span className="network-card-cta">Ver proyecto →</span></Link>)}</div>}
  </main></div>;
}
