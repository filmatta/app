import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ProjectWorkspaceShell from "@/components/create/ProjectWorkspaceShell";
import ProductionDocuments from "@/components/production/ProductionDocuments";
import { getViewer } from "@/lib/auth/get-viewer";
import { CreateProjectError, getCreateProjectContext } from "@/lib/create/project";
import { ProductionError, loadProductionWorkspace } from "@/lib/production/server";
import { createClient } from "@/lib/supabase/server";
import "@/app/production/documents.css";
import "./documents-page.css";

export const metadata: Metadata = { title: "Documentos · FILMATTA", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProjectDocumentsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ production?: string }>;
}) {
  const { id } = await params;
  const { production: requestedProductionId } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/create/projects/${encodeURIComponent(id)}/documents`);

  const db = await createClient();
  let project;
  try {
    project = await getCreateProjectContext(db, viewer.id, id);
  } catch (cause) {
    if (cause instanceof CreateProjectError && cause.code === "not_found") notFound();
    throw cause;
  }
  const selectedProduction = requestedProductionId
    ? project.productions.find((item) => item.id === requestedProductionId)
    : project.productions[0];
  if (requestedProductionId && !selectedProduction) notFound();

  let production = null;
  if (selectedProduction) {
    try {
      production = await loadProductionWorkspace(db, viewer.id, selectedProduction.id);
    } catch (cause) {
      if (cause instanceof ProductionError && cause.code === "not_found") notFound();
      throw cause;
    }
    if (production.production.projectId !== project.id) notFound();
  }

  return <ProjectWorkspaceShell project={project} active="documents">
    <div className="project-documents-page">
      <header className="project-documents-page-header">
        <div><p>ARCHIVO DEL PROYECTO</p><h1>Documentos</h1><span>Exportaciones disponibles para {project.name}.</span></div>
      </header>
      {project.productions.length > 1 && <nav className="project-documents-productions" aria-label="Producciones del proyecto">
        {project.productions.map((item) => <Link key={item.id} href={`/create/projects/${project.id}/documents?production=${item.id}`} aria-current={selectedProduction?.id === item.id ? "page" : undefined}>{item.title}</Link>)}
      </nav>}
      {production
        ? <ProductionDocuments data={production} viewerName={viewer.displayName} activeDayId={production.days[0]?.id} variant="project" />
        : <section className="project-documents-unavailable" aria-label="Documentos disponibles">
          <div><strong>Production Pack</strong><span>PDF</span><span>Producción</span><span>No disponible todavía</span></div>
          <p>Aún no existe Production en este proyecto.</p>
          <Link href={`/production?project=${project.id}`}>Abrir Producción →</Link>
        </section>}
    </div>
  </ProjectWorkspaceShell>;
}
