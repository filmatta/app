import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ProjectEditorForm from "@/components/projects/ProjectEditorForm";
import { getViewer } from "@/lib/auth/get-viewer";
import type { Project } from "@/lib/networking/types";
import { PROJECT_UUID_PATTERN } from "@/lib/projects/form";
import { createClient } from "@/lib/supabase/server";
import "@/components/projects/projects.css";

export const metadata: Metadata = { title: "Editar proyecto", robots: { index: false, follow: false } };

export default async function EditProjectPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; converted?: string }>;
}) {
  const [{ id }, feedback, viewer] = await Promise.all([params, searchParams, getViewer()]);
  if (!viewer) redirect(`/acceso?next=${encodeURIComponent(`/mis-proyectos/${id}/editar`)}`);
  if (!PROJECT_UUID_PATTERN.test(id)) notFound();
  const supabase = await createClient();
  const [projectResult, opportunitiesResult] = await Promise.all([
    supabase.from("projects")
      .select("id,slug,title,summary,description,cover_image_path,project_type,client_name,share_client_name,client_type,city,work_area,shooting_schedule,economic_mode,date_window,starts_on,ends_on,dates_confirmed,roles,requirements,status,lifecycle_status,visibility,operational_status,updated_at")
      .eq("id", id).eq("owner_id", viewer.id).maybeSingle(),
    supabase.from("opportunities")
      .select("id,title,slug,status,category,updated_at")
      .eq("project_id", id).eq("owner_id", viewer.id)
      .order("updated_at", { ascending: false }),
  ]);
  if (!projectResult.data && !projectResult.error) notFound();
  if (projectResult.error) {
    console.error("Error cargando Project V1.5", { code: projectResult.error.code });
    return <PrivateProjectError />;
  }
  const project = projectResult.data as Project;
  const opportunities = opportunitiesResult.data ?? [];
  const statusLabel: Record<string, string> = { draft: "Borrador", published: "Publicada", closed: "Cerrada", archived: "Archivada" };

  return <main className="projects-shell">
    <SiteHeader contextLink={{ href: "/mis-proyectos", label: "← Mis proyectos" }} />
    <section className="projects-container">
      <div className="projects-heading"><div><p className="eyebrow">PROJECTS / EDITOR</p><h1>{project.title}</h1><p>La URL pública permanece estable aunque cambies el nombre.</p></div>{project.visibility === "public" && <Link href={`/proyectos/${project.slug}`} className="project-button">Ver página pública ↗</Link>}</div>
      {(feedback.created === "1" || feedback.converted === "1") && <p className="project-feedback project-feedback--success" role="status">{feedback.converted === "1" ? "Project creado desde la Opportunity. Revisa y completa la información antes de publicarlo." : "Proyecto creado como borrador."}</p>}
      <ProjectEditorForm initial={project} />
      <section className="project-detail-section" aria-labelledby="linked-opportunities">
        <div className="projects-heading"><div><p className="eyebrow">PROJECT → OPPORTUNITIES</p><h2 id="linked-opportunities">Oportunidades vinculadas</h2><p>Cada anuncio mantiene su propio contenido y publicación. Este Project puede tener todas las Opportunities que necesite.</p></div>{project.lifecycle_status !== "archived" && <Link href={`/mis-oportunidades/nueva?project=${project.id}`} className="project-button">+ Crear oportunidad</Link>}</div>
        {opportunitiesResult.error ? <p className="project-feedback project-feedback--error" role="alert">No pudimos cargar las Opportunities vinculadas.</p> : opportunities.length ? <div className="project-opportunity-list">{opportunities.map((item) => <article className="project-opportunity-item" key={item.id}><div><h3>{item.title}</h3><p>{statusLabel[item.status] ?? item.status} · {item.category}</p></div><div className="project-opportunity-item__actions"><Link href={`/mis-oportunidades/${item.id}/editar`}>Editar</Link>{item.status === "published" && <Link href={`/oportunidades/${item.slug}`}>Ver ↗</Link>}</div></article>)}</div> : <div className="projects-empty"><h3>Aún no hay Opportunities vinculadas.</h3><p>{project.lifecycle_status === "archived" ? "Reactiva el Project como borrador para crear una Opportunity vinculada." : "Crea una convocatoria breve para talento, crew, recursos o colaboración."}</p>{project.lifecycle_status !== "archived" && <Link href={`/mis-oportunidades/nueva?project=${project.id}`} className="project-button">Crear primera oportunidad</Link>}</div>}
      </section>
    </section>
  </main>;
}

function PrivateProjectError() {
  return <main className="projects-shell"><SiteHeader contextLink={{ href: "/mis-proyectos", label: "← Mis proyectos" }} /><section className="projects-container"><p className="project-feedback project-feedback--error" role="alert">No pudimos cargar este proyecto. Inténtalo de nuevo.</p></section></main>;
}
