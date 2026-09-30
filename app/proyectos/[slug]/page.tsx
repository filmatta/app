import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { ECONOMICS, SCHEDULES, type Project } from "@/lib/networking/types";
import { createClient } from "@/lib/supabase/server";
import "@/components/projects/projects.css";

const PROJECT_FIELDS = "id,owner_id,slug,title,summary,description,cover_image_path,project_type,client_name,share_client_name,client_type,city,work_area,shooting_schedule,economic_mode,date_window,starts_on,ends_on,dates_confirmed,roles,requirements,status,lifecycle_status,visibility,operational_status,updated_at";
type ProjectView = Project & { owner_id?: string; is_owner?: boolean; owner_name?: string };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const result = await supabase.from("projects").select("title,summary,lifecycle_status,visibility").eq("slug", slug).maybeSingle();
  if (!result.data) return { title: "Proyecto no encontrado", robots: { index: false, follow: false } };
  const isPublic = result.data.lifecycle_status === "active" && result.data.visibility === "public";
  return { title: result.data.title, description: result.data.summary ?? `Proyecto audiovisual en FILMATTA.`, robots: isPublic ? undefined : { index: false, follow: false } };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [viewer, supabase] = await Promise.all([getViewer(), createClient()]);
  const direct = await supabase.from("projects").select(PROJECT_FIELDS).eq("slug", slug).maybeSingle();
  let project = direct.data as ProjectView | null;
  let shared = false;
  if (!project && viewer) {
    const authorized = await supabase.rpc("get_authorized_networking_project", { p_slug: slug });
    if (authorized.data) {
      const legacy = authorized.data as ProjectView;
      project = {
        ...legacy,
        lifecycle_status: legacy.status === "archived" ? "archived" : "draft",
        visibility: "private",
        description: null,
        cover_image_path: null,
        starts_on: null,
        ends_on: null,
        dates_confirmed: false,
      };
      shared = !legacy.is_owner;
    }
  }
  if (!project) notFound();
  const isOwner = Boolean(viewer && (project.owner_id === viewer.id || project.is_owner));
  const isPublic = project.lifecycle_status === "active" && project.visibility === "public";
  const opportunityResult = await supabase.from("opportunities")
    .select("id,title,slug,category,discipline,city,work_mode")
    .eq("project_id", project.id).eq("status", "published")
    .order("published_at", { ascending: false });
  const details = [
    ["Producción", project.project_type],
    ["Cliente / artista", (isOwner || project.share_client_name) ? project.client_name : ""],
    ["Ubicación", [project.work_area, project.city].filter(Boolean).join(", ")],
    ["Jornada", SCHEDULES[project.shooting_schedule]],
    ["Modalidad", ECONOMICS[project.economic_mode]],
    [project.dates_confirmed ? "Fechas confirmadas" : "Fechas tentativas", project.date_window],
  ].filter((item) => item[1]);

  return <main className="projects-shell project-detail">
    <SiteHeader contextLink={{ href: isOwner ? "/mis-proyectos" : shared ? "/cuenta/contactos" : "/", label: isOwner ? "← Mis proyectos" : shared ? "← Solicitudes / Contactos" : "← Inicio" }} />
    <article className="projects-container">
      {!isPublic && <p className="project-link-notice">{isOwner ? "Vista privada: publica el Project para que cualquier persona pueda abrir esta URL." : "Proyecto compartido contigo desde una solicitud de contacto."}</p>}
      <div className="project-detail-hero">
        <div><p className="eyebrow">FILMATTA / PROJECT</p><h1>{project.title}</h1>{project.summary && <p>{project.summary}</p>}<div className="project-detail-meta"><span>{project.project_type}</span>{project.city && <span>{project.city}</span>}{project.date_window && <span>{project.date_window}</span>}</div>{isOwner && <Link href={`/mis-proyectos/${project.id}/editar`} className="project-button project-button--primary">Editar proyecto</Link>}</div>
        <div className="project-detail-cover">{project.cover_image_path ? <Image src={`/api/projects/covers/${project.id}`} alt={`Portada de ${project.title}`} width={800} height={500} priority unoptimized /> : <span aria-hidden="true">{project.title.slice(0,1).toUpperCase()}</span>}</div>
      </div>
      {project.description && <section className="project-detail-section"><h2>Sobre el proyecto</h2><p>{project.description}</p></section>}
      <section className="project-detail-section"><h2>Producción</h2><dl className="project-detail-grid">{details.map(([label, value]) => <div className="project-detail-datum" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
      {project.roles.length > 0 && <section className="project-detail-section"><h2>Necesidades</h2><div className="project-detail-meta">{project.roles.map((role) => <span key={role}>{role}</span>)}</div></section>}
      {opportunityResult.data?.length ? <section className="project-detail-section"><h2>Oportunidades abiertas</h2><div className="project-opportunity-list">{opportunityResult.data.map((item) => <article className="project-opportunity-item" key={item.id}><div><h3>{item.title}</h3><p>{[item.discipline,item.city].filter(Boolean).join(" · ")}</p></div><Link href={`/oportunidades/${item.slug}`}>Ver Opportunity →</Link></article>)}</div></section> : null}
    </article>
  </main>;
}
