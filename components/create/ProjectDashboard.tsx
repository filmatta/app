"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import type { CreateEntryModule, CreateProjectListItem } from "@/lib/create/project";
import CreateProjectForm from "./CreateProjectForm";

const moduleLabels: Record<CreateEntryModule, string> = {
  writer: "Guion", shotlist: "Shotlist", storyboard: "Storyboard", production: "Producción",
};

export default function ProjectDashboard({ projects, selectedProjectId, initialSearch, initialSort, detail, inspector }: {
  projects: CreateProjectListItem[];
  selectedProjectId: string | null;
  initialSearch: string;
  initialSort: "recent" | "name";
  detail: ReactNode;
  inspector: ReactNode;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState<"recent" | "name">(initialSort);
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es-MX");
    return projects.filter((project) => project.name.toLocaleLowerCase("es-MX").includes(query))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "es-MX") : b.activityAt.localeCompare(a.activityAt));
  }, [projects, search, sort]);
  const selectedVisible = visible.some((project) => project.id === selectedProjectId);

  function selectionHref(projectId: string) {
    const params = new URLSearchParams({ project: projectId });
    if (search.trim()) params.set("q", search.trim());
    if (sort !== "recent") params.set("sort", sort);
    return `/create?${params.toString()}`;
  }

  return <div className="create-dashboard-app">
    <aside className="create-dashboard-sidebar" aria-label="Espacio de trabajo">
      <div className="create-dashboard-workspace-name"><span className="create-dashboard-workspace-mark" aria-hidden="true">▦</span><span><small>Espacio de trabajo</small><strong>FILMATTA Create</strong></span></div>
      <nav aria-label="Navegación del espacio de trabajo"><Link href="/create" aria-current="page"><span aria-hidden="true">▦</span>Proyectos</Link></nav>
      <div className="create-dashboard-sidebar-footer"><span>{projects.length} {projects.length === 1 ? "proyecto" : "proyectos"}</span></div>
    </aside>
    <div className="create-dashboard-workspace">
      <header className="create-dashboard-topline">
        <div className="create-dashboard-title"><p>ESPACIO DE TRABAJO</p><h1>Tus proyectos</h1><span>Crea, organiza y desarrolla tus ideas en un solo lugar.</span></div>
        <div className="create-dashboard-toolbar">
          {projects.length > 0 && <>
            <label className="create-project-search"><span className="sr-only">Buscar proyectos</span><span aria-hidden="true">⌕</span><input type="search" placeholder="Buscar proyectos" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label className="create-project-sort"><span className="sr-only">Ordenar proyectos</span><select value={sort} onChange={(event) => setSort(event.target.value as "recent" | "name")}><option value="recent">Más recientes</option><option value="name">Nombre</option></select></label>
          </>}
          <CreateProjectForm />
        </div>
      </header>
      {projects.length === 0 ? <main className="create-dashboard-empty" aria-label="Crear tu primer proyecto">
        <div className="create-dashboard-empty-box"><span aria-hidden="true">▦</span><h2>Tu primer proyecto empieza aquí</h2><p>Reúne guion, Shotlist, Storyboard, Producción y Documentos en un mismo espacio.</p></div>
      </main> : <>
        <main className="create-dashboard-main">
          <div className="create-project-list" role="table" aria-label="Tus proyectos">
            <div className="create-project-list-heading" role="row"><span role="columnheader">Nombre</span><span role="columnheader">Contenido</span><span role="columnheader">Última actividad</span><span role="columnheader" className="sr-only">Acción</span></div>
            {visible.map((project) => <div className={`create-project-row${project.id === selectedProjectId ? " is-selected" : ""}`} role="row" key={project.id}>
              <div className="create-project-row-name" role="cell">
                <Link href={selectionHref(project.id)} prefetch={false} aria-label={`Seleccionar ${project.name}`} aria-current={project.id === selectedProjectId ? "true" : undefined} className="create-project-select">
                  {project.coverImagePath ? <Image src={`/api/projects/covers/${project.id}`} alt="" width={48} height={48} unoptimized /> : <span className="create-project-placeholder" aria-hidden="true">▦</span>}
                  <span className="create-project-row-name-text"><strong>{project.name}</strong><small>Comenzar con {project.entryModule ? moduleLabels[project.entryModule] : "un módulo"}</small></span>
                </Link>
              </div>
              <div className="create-project-row-modules" role="cell">{project.modules.length ? project.modules.map((module) => moduleLabels[module]).join(" · ") : "Aún sin contenido"}</div>
              <time role="cell" dateTime={project.activityAt}>{formatDate(project.activityAt)}</time>
              <div className="create-project-row-action" role="cell"><Link href={`/create/projects/${project.id}`} aria-label={`Abrir ${project.name}`}>Abrir <span aria-hidden="true">↗</span></Link></div>
            </div>)}
            {!visible.length && <p className="create-project-no-results">No encontramos proyectos con ese nombre.</p>}
          </div>
          {selectedVisible ? detail : <div className="create-dashboard-select-prompt" role="status">{visible.length ? "Selecciona un proyecto de los resultados para ver su resumen." : "Prueba con otro nombre para ver tus proyectos."}</div>}
          {selectedVisible && <details className="create-dashboard-inspector-drawer"><summary>Detalles del proyecto</summary>{inspector}</details>}
        </main>
        {selectedVisible ? <div className="create-dashboard-inspector-desktop">{inspector}</div> : <aside className="create-selected-inspector create-selected-inspector-empty" aria-label="Detalles del proyecto"><p>Selecciona un proyecto para ver sus detalles.</p></aside>}
      </>}
    </div>
  </div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", {
    day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City",
  }).format(date);
}
