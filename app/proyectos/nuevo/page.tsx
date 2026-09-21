import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ProjectForm from "@/components/networking/ProjectForm";
import { getViewer } from "@/lib/auth/get-viewer";
export const metadata = { title: "Crear proyecto", robots: { index: false, follow: false } };
export default async function NewProjectPage() {
  if (!(await getViewer())) redirect("/login?next=%2Fproyectos%2Fnuevo");
  return <div className="editorial-page"><SiteHeader contextLink={{ href: "/mis-proyectos", label: "← Mis proyectos" }} /><main className="network-shell"><header className="network-heading"><h1>Crear proyecto</h1></header><ProjectForm /></main></div>;
}
