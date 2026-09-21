import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import "@/components/networking/networking.css";
export const metadata = { title: "Mis proyectos", robots: { index: false, follow: false } };
export default async function ProjectsPage() {
  const viewer = await getViewer(); if (!viewer) redirect("/login?next=%2Fproyectos");
  const db = await createClient();
  const { data, error } = await db.from("projects").select("id,title,slug,project_type,city,status").eq("owner_id", viewer.id).eq("networking_private", true).order("created_at", { ascending: false }).limit(100);
  return <div className="editorial-page"><SiteHeader /><main className="network-shell"><header className="network-heading"><p className="eyebrow">TU ESPACIO</p><h1>Mis proyectos</h1><p>El contexto de tu próxima colaboración. Tus proyectos son privados.</p><Link className="network-link-button" href="/proyectos/nuevo">Crear proyecto</Link></header>
    {error ? <p role="alert">No pudimos cargar tus proyectos.</p> : !data?.length ? <p className="network-empty">Aún no has creado proyectos.</p> : <div className="network-list">{data.map(p => <Link className="network-card" key={p.id} href={`/proyectos/${p.slug}`}><h2>{p.title}</h2><p>{[p.project_type,p.city].filter(Boolean).join(" · ")}</p><span className="network-status">{p.status === "archived" ? "Archivado" : "Privado"}</span></Link>)}</div>}
  </main></div>;
}
