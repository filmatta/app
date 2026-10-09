"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { CreateEntryModule, CreateProjectListItem } from "@/lib/create/project";
import CreateProjectForm from "./CreateProjectForm";

const moduleLabels: Record<CreateEntryModule, string> = {
  writer: "Guion", shotlist: "Shotlist", storyboard: "Storyboard", production: "Producción",
};

export default function ProjectDashboard({ projects }: { projects: CreateProjectListItem[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es-MX");
    return projects.filter((project) => project.name.toLocaleLowerCase("es-MX").includes(query))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "es-MX") : b.activityAt.localeCompare(a.activityAt));
  }, [projects, search, sort]);

  return <main className="create-dashboard">
    <header className="create-dashboard-header">
      <Link href="/" className="create-dashboard-brand"><span>F</span> FILMATTA</Link>
      <span className="create-dashboard-context">ESPACIO DE TRABAJO</span>
    </header>
    <div className="create-dashboard-body">
      <div className="create-dashboard-title"><div><p>FILMATTA CREATE</p><h1>Proyectos</h1></div>
        {projects.length > 0 && <CreateProjectForm />}
      </div>
      {projects.length === 0 ? <section className="create-dashboard-empty" aria-label="Crear tu primer proyecto">
        <div className="create-dashboard-empty-box"><CreateProjectForm empty /><p>Guion · Shotlist · Storyboard · Producción</p></div>
      </section> : <>
        <div className="create-dashboard-toolbar">
          <label className="create-project-search"><span className="sr-only">Buscar proyectos</span><span aria-hidden="true">⌕</span><input type="search" placeholder="Buscar proyectos" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="create-project-sort"><span className="sr-only">Ordenar proyectos</span><select value={sort} onChange={(event) => setSort(event.target.value as "recent" | "name")}><option value="recent">Más recientes</option><option value="name">Nombre</option></select></label>
        </div>
        <div className="create-project-list" role="table" aria-label="Tus proyectos">
          <div className="create-project-list-heading" role="row"><span role="columnheader">Nombre</span><span role="columnheader">Módulos</span><span role="columnheader">Última actividad</span><span role="columnheader" className="sr-only">Acción</span></div>
          {visible.map((project) => <div className="create-project-row" role="row" key={project.id}>
            <div className="create-project-row-name" role="cell">
              {project.coverImagePath ? <Image src={`/api/projects/covers/${project.id}`} alt="" width={44} height={44} unoptimized /> : <span className="create-project-placeholder" aria-hidden="true">▦</span>}
              <div><strong>{project.name}</strong><small>Creado {formatDate(project.createdAt)}</small></div>
            </div>
            <div className="create-project-row-modules" role="cell">{project.modules.length ? project.modules.map((module) => moduleLabels[module]).join(" · ") : "Sin módulos"}</div>
            <time role="cell" dateTime={project.activityAt}>{formatDate(project.activityAt)}</time>
            <div role="cell"><Link href={`/create/projects/${project.id}`} aria-label={`Abrir ${project.name}`}>Abrir <span aria-hidden="true">→</span></Link></div>
          </div>)}
          {!visible.length && <p className="create-project-no-results">No encontramos proyectos con ese nombre.</p>}
        </div>
      </>}
    </div>
  </main>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", {
    day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City",
  }).format(date);
}
