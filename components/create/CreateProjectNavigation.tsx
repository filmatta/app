import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCreateProjectContext, type CreateProjectContext } from "@/lib/create/project";
import { createProjectModuleRoute, type CreateModule } from "@/lib/create/routes";
import { recordCreateEvent } from "@/lib/create/telemetry";
import "./create-project-navigation.css";

export default async function CreateProjectNavigation({ projectId, ownerId, active, context }: {
  projectId: string | null;
  ownerId: string;
  active: CreateModule;
  context?: CreateProjectContext;
}) {
  if (!projectId) return null;
  const project = context ?? await getCreateProjectContext(await createClient(), ownerId, projectId);
  if (active === "writer" || active === "storyboard") {
    recordCreateEvent(active === "writer" ? "writer_opened" : "storyboard_opened", { userId: ownerId, projectId });
  }
  const modules: { id: CreateModule; label: string }[] = [
    { id: "writer", label: "Guion" }, { id: "breakdown", label: "Breakdown" },
    { id: "shotlist", label: "Shotlist" }, { id: "storyboard", label: "Storyboard" },
    { id: "production", label: "Producción" }, { id: "documents", label: "Documentos" },
  ];
  return <details className="create-project-navigation">
    <summary aria-label={`Navegar por el proyecto ${project.name}`}>Proyecto · {project.name}</summary>
    <nav aria-label={`Módulos de ${project.name}`}>
      <Link href={`/create/projects/${project.id}`}>Overview</Link>
      {modules.map((module) => <Link key={module.id} href={createProjectModuleRoute(project, module.id)} aria-current={active === module.id ? "page" : undefined}>{module.label}</Link>)}
    </nav>
  </details>;
}
