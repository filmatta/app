import type { ReactNode } from "react";
import Link from "next/link";
import type { CreateProjectContext } from "@/lib/create/project";
import { createProjectModuleRoute } from "@/lib/create/routes";
import "./project-workspace.css";

export type ProjectSection = "overview" | "writer" | "shotlist" | "storyboard" | "production" | "documents";

export default function ProjectWorkspaceShell({ project, active, children }: {
  project: CreateProjectContext;
  active: ProjectSection;
  children: ReactNode;
}) {
  const base = `/create/projects/${project.id}`;
  const sections: { id: ProjectSection; label: string; icon: string; href: string; detail?: string }[] = [
    { id: "overview", label: "Overview", icon: "▦", href: base },
    { id: "writer", label: "Guion", icon: "▤", href: createProjectModuleRoute(project, "writer"), detail: project.writers.length ? String(project.writers.length) : undefined },
    { id: "shotlist", label: "Shotlist", icon: "☷", href: createProjectModuleRoute(project, "shotlist"), detail: project.shotlists.length ? String(project.shotlists.length) : undefined },
    { id: "storyboard", label: "Storyboard", icon: "▧", href: createProjectModuleRoute(project, "storyboard"), detail: project.storyboards.some((board) => board.panelCount) ? String(project.storyboards.reduce((sum, board) => sum + board.panelCount, 0)) : undefined },
    { id: "production", label: "Producción", icon: "▦", href: createProjectModuleRoute(project, "production"), detail: project.productions.length ? String(project.productions.length) : undefined },
    { id: "documents", label: "Documentos", icon: "▣", href: `${base}/documents` },
  ];
  return <div className="create-project-shell">
    <aside className="create-project-sidebar">
      <Link className="create-project-back" href="/create">← Proyectos</Link>
      <div className="create-project-sidebar-title"><span>PROJECT</span><strong title={project.name}>{project.name}</strong></div>
      <nav aria-label="Secciones del proyecto">
        {sections.map((section) => <Link key={section.id} href={section.href} aria-current={active === section.id ? "page" : undefined}>
          <span className="create-project-nav-icon" aria-hidden="true">{section.icon}</span>
          <span>{section.label}</span>{section.detail && <small>{section.detail}</small>}
        </Link>)}
      </nav>
    </aside>
    <div className="create-project-main">
      <header className="create-project-topbar"><Link href="/create" className="create-project-topbrand">FILMATTA <span>/</span> Proyectos</Link><strong>{project.name}</strong></header>
      <details className="create-project-mobile-nav">
        <summary>Sección: {sections.find((section) => section.id === active)?.label}<span aria-hidden="true">⌄</span></summary>
        <nav aria-label="Secciones del proyecto en móvil">
          {sections.map((section) => <Link key={section.id} href={section.href} aria-current={active === section.id ? "page" : undefined}>{section.label}</Link>)}
        </nav>
      </details>
      <div className="create-project-content">{children}</div>
    </div>
  </div>;
}
