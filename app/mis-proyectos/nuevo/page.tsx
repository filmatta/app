import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ProjectEditorForm from "@/components/projects/ProjectEditorForm";
import { getViewer } from "@/lib/auth/get-viewer";

export const metadata: Metadata = { title: "Crear proyecto", robots: { index: false, follow: false } };

export default async function NewProjectPage() {
  if (!(await getViewer())) redirect("/acceso?next=%2Fmis-proyectos%2Fnuevo");
  return <main className="projects-shell"><SiteHeader contextLink={{ href: "/mis-proyectos", label: "← Mis proyectos" }} /><section className="projects-container"><div className="projects-heading"><div><p className="eyebrow">PROJECTS / NUEVO</p><h1>Crear proyecto</h1><p>Empieza con lo esencial. Puedes guardar un borrador y completar o publicar más adelante.</p></div></div><ProjectEditorForm /></section></main>;
}
