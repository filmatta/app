import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { projectPublicationLabel, type Project } from "@/lib/networking/types";
import { createClient } from "@/lib/supabase/server";
import "@/components/projects/projects.css";

export const metadata: Metadata = { title: "Mis proyectos", robots: { index: false, follow: false } };

export default async function MyProjectsPage({ searchParams }: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fmis-proyectos");
  const [params, supabase] = await Promise.all([searchParams, createClient()]);
  const projectsResult = await supabase
    .from("projects")
    .select("id,slug,title,summary,description,cover_image_path,project_type,client_name,share_client_name,client_type,city,work_area,shooting_schedule,economic_mode,date_window,starts_on,ends_on,dates_confirmed,roles,requirements,status,lifecycle_status,visibility,operational_status,updated_at")
    .eq("owner_id", viewer.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  const projects = (projectsResult.data ?? []) as Project[];
  const counts = new Map<string, number>();
  if (projects.length) {
    const opportunities = await supabase.from("opportunities").select("project_id")
      .eq("owner_id", viewer.id).in("project_id", projects.map((project) => project.id));
    if (opportunities.error) console.error("Error contando Opportunities vinculadas", { code: opportunities.error.code });
    for (const item of opportunities.data ?? []) {
      if (item.project_id) counts.set(item.project_id, (counts.get(item.project_id) ?? 0) + 1);
    }
  }

  return <main className="projects-shell">
    <SiteHeader contextLink={{ href: "/", label: "← Inicio" }} />
    <section className="projects-container">
      <div className="projects-heading">
        <div><p className="eyebrow">TU ESPACIO / PRODUCCIONES</p><h1>Mis proyectos</h1><p>Organiza cada producción, decide cuándo hacerla pública y crea todas las Opportunities que necesites sin duplicar el contexto.</p></div>
        <Link href="/mis-proyectos/nuevo" className="project-button project-button--primary">+ Nuevo proyecto</Link>
      </div>
      {params.archived === "1" && <p className="project-feedback project-feedback--success" role="status">Proyecto archivado. Sus datos y Opportunities se conservaron.</p>}
      {projectsResult.error ? <p className="project-feedback project-feedback--error" role="alert">No pudimos cargar tus proyectos. Inténtalo de nuevo.</p> : projects.length === 0 ? <div className="projects-empty"><h2>Tu primera producción empieza aquí.</h2><p>Crea un borrador, completa el contexto y publícalo cuando esté listo.</p><Link href="/mis-proyectos/nuevo" className="project-button">Crear primer proyecto</Link></div> : <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} opportunityCount={counts.get(project.id) ?? 0} />)}</div>}
    </section>
  </main>;
}

function ProjectCard({ project, opportunityCount }: { project: Project; opportunityCount: number }) {
  const status = projectPublicationLabel(project);
  const place = [project.work_area, project.city].filter(Boolean).join(", ");
  return <article className="project-card">
    <div className="project-card-cover">{project.cover_image_path ? <Image src={`/api/projects/covers/${project.id}`} alt="" fill unoptimized sizes="(max-width: 560px) 104px, 150px" /> : <span aria-hidden="true">{project.title.slice(0, 1).toUpperCase()}</span>}</div>
    <div className="project-card-body">
      <div className="project-card-top"><span className={`project-status project-status--${status.toLowerCase()}`}>{status}</span><details><summary aria-label={`Acciones de ${project.title}`}>•••</summary><div className="project-card-menu"><Link href={`/mis-proyectos/${project.id}/editar`}>Editar proyecto</Link><Link href={`/proyectos/${project.slug}`}>Vista del proyecto</Link><Link href={`/mis-oportunidades/nueva?project=${project.id}`}>Crear oportunidad</Link></div></details></div>
      <h2>{project.title}</h2>
      {project.client_name && <p className="project-card-client">{project.client_name}</p>}
      <div className="project-card-meta"><span>{project.project_type}</span>{place && <span>{place}</span>}{project.date_window && <span>{project.date_window}</span>}<span>{opportunityCount} {opportunityCount === 1 ? "Opportunity" : "Opportunities"}</span></div>
      <div className="project-card-actions"><Link href={`/mis-proyectos/${project.id}/editar`}>Editar →</Link>{project.visibility === "public" && <Link href={`/proyectos/${project.slug}`}>Ver pública ↗</Link>}</div>
    </div>
  </article>;
}
