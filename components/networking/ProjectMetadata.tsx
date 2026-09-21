import StatusBadge from "@/components/ui/StatusBadge";
import { MetaChips } from "@/components/ui/MetaChip";
import { ECONOMICS, SCHEDULES, PROJECT_STATES, type Project } from "@/lib/networking/types";
export function ProjectStatus({ project }: { project: Pick<Project, "status" | "operational_status"> }) {
  return <StatusBadge tone={project.status === "archived" ? "neutral" : project.operational_status === "active" ? "success" : project.operational_status === "pending_confirmation" ? "warning" : "neutral"}>{project.status === "archived" ? "Archivado" : PROJECT_STATES[project.operational_status] ?? "Activo"}</StatusBadge>;
}
export default function ProjectMetadata({ project }: { project: Project }) {
  return <><MetaChips labels={[project.project_type, project.city, SCHEDULES[project.shooting_schedule], ECONOMICS[project.economic_mode]]} />{project.roles.length > 0 && <p className="network-project-roles"><span>Busca</span> {project.roles.slice(0, 3).join(" · ")}{project.roles.length > 3 ? ` +${project.roles.length - 3}` : ""}</p>}{project.date_window && <p className="network-muted network-date">{project.date_window}</p>}</>;
}
