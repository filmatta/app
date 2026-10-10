"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import type { CreateEntryModule, CreateProjectContext, CreateProjectListItem } from "@/lib/create/project";
import type { CreateProjectOverview } from "@/lib/create/overview";
import type { RecentProjectDocument } from "@/lib/create/recent-documents";
import CreateProjectForm from "./CreateProjectForm";
import ProjectDashboardDetail, { ProjectDashboardInspector } from "./ProjectDashboardDetail";
import type { CreateIdeaDraft, CreateOnboardingState } from "@/lib/create/onboarding";

const moduleLabels: Record<CreateEntryModule, string> = {
  writer: "Guion", shotlist: "Shotlist", storyboard: "Storyboard", production: "Producción",
};

type DashboardSelection = {
  project: CreateProjectContext;
  overview: CreateProjectOverview;
  recentDocuments: RecentProjectDocument[];
};

export default function ProjectDashboard({ projects, selectedProjectId: initialProjectId, initialSearch, initialSort, initialSelection, ownerId, onboardingState, ideaDraft, ideaDrafts, autoOpenOnboarding }: {
  projects: CreateProjectListItem[];
  selectedProjectId: string | null;
  initialSearch: string;
  initialSort: "recent" | "name";
  initialSelection: DashboardSelection | null;
  ownerId: string;
  onboardingState: CreateOnboardingState | null;
  ideaDraft: CreateIdeaDraft | null;
  ideaDrafts: CreateIdeaDraft[];
  autoOpenOnboarding: boolean;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState<"recent" | "name">(initialSort);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [selection, setSelection] = useState(initialSelection);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const selectedIdRef = useRef(initialProjectId);
  const requestRef = useRef<AbortController | null>(null);

  const loadProject = useCallback(async (projectId: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSelection(null);
    setSelectionError(null);
    try {
      const response = await fetch(`/api/create/projects/${projectId}/summary`, {
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error("No pudimos cargar el resumen de este proyecto.");
      const result = await response.json() as DashboardSelection;
      if (result.project?.id !== projectId) throw new Error("El resumen recibido no corresponde a este proyecto.");
      if (selectedIdRef.current === projectId && requestRef.current === controller) setSelection(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (selectedIdRef.current === projectId && requestRef.current === controller) {
        setSelectionError(error instanceof Error ? error.message : "No pudimos cargar el resumen de este proyecto.");
      }
    }
  }, []);

  useEffect(() => {
    // A server refresh can update a cover while the local selection differs from the URL's initial project.
    const currentId = selectedIdRef.current;
    if (!currentId || !projects.some((project) => project.id === currentId)) {
      requestRef.current?.abort();
      selectedIdRef.current = initialProjectId;
      setSelectedProjectId(initialProjectId);
      setSelection(initialSelection);
      setSelectionError(null);
    } else if (currentId === initialProjectId) {
      requestRef.current?.abort();
      setSelection(initialSelection);
      setSelectionError(null);
    } else if (currentId) {
      void loadProject(currentId);
    }
  }, [initialProjectId, initialSelection, loadProject, projects]);

  useEffect(() => () => requestRef.current?.abort(), []);

  function selectProject(projectId: string) {
    if (projectId === selectedIdRef.current && selection?.project.id === projectId) return;
    selectedIdRef.current = projectId;
    setSelectedProjectId(projectId);
    void loadProject(projectId);
  }

  function handleRowClick(event: MouseEvent<HTMLDivElement>, projectId: string) {
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea, summary")) return;
    selectProject(projectId);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, projectId: string) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    selectProject(projectId);
  }
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es-MX");
    return projects.filter((project) => project.name.toLocaleLowerCase("es-MX").includes(query))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "es-MX") : b.activityAt.localeCompare(a.activityAt));
  }, [projects, search, sort]);
  const selectedVisible = visible.some((project) => project.id === selectedProjectId);
  const selectedListItem = projects.find((project) => project.id === selectedProjectId);
  const currentSelection = selection?.project.id === selectedProjectId ? selection : null;
  const detail = currentSelection ? <ProjectDashboardDetail project={currentSelection.project} overview={currentSelection.overview} recentDocuments={currentSelection.recentDocuments} /> :
    <div className="create-dashboard-select-prompt" role={selectionError ? "alert" : "status"}><strong>{selectedListItem?.name}</strong><span>{selectionError ?? "Cargando resumen del proyecto…"}</span></div>;
  const inspector = currentSelection ? <ProjectDashboardInspector project={currentSelection.project} overview={currentSelection.overview} /> :
    <aside className="create-selected-inspector create-selected-inspector-empty" aria-label="Detalles del proyecto"><strong>{selectedListItem?.name}</strong><p>{selectionError ?? "Cargando detalles…"}</p></aside>;

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
          <CreateProjectForm ownerId={ownerId} autoOpen={autoOpenOnboarding} hasProjects={projects.length > 0} initialState={onboardingState} initialDraft={ideaDraft} initialDrafts={ideaDrafts} />
        </div>
      </header>
      {projects.length === 0 ? <main className="create-dashboard-empty" aria-label="Crear tu primer proyecto">
        <div className="create-dashboard-empty-box"><span aria-hidden="true">▦</span><h2>Tu primer proyecto empieza aquí</h2><p>Reúne guion, Shotlist, Storyboard, Producción y Documentos en un mismo espacio.</p></div>
      </main> : <>
        <main className="create-dashboard-main">
          <div className="create-project-list" role="table" aria-label="Tus proyectos">
            <div className="create-project-list-heading" role="row"><span role="columnheader">Nombre</span><span role="columnheader">Contenido</span><span role="columnheader">Última actividad</span><span role="columnheader" className="sr-only">Acción</span></div>
            {visible.map((project) => <div className={`create-project-row${project.id === selectedProjectId ? " is-selected" : ""}`} role="row" aria-label={`Seleccionar ${project.name}`} aria-selected={project.id === selectedProjectId} tabIndex={0} key={project.id} onClick={(event) => handleRowClick(event, project.id)} onKeyDown={(event) => handleRowKeyDown(event, project.id)}>
              <div className="create-project-row-name" role="cell">
                <div className="create-project-select">
                  {project.coverImagePath ? <Image src={`/api/projects/covers/${project.id}`} alt="" width={48} height={48} unoptimized /> : <span className="create-project-placeholder" aria-hidden="true" />}
                  <span className="create-project-row-name-text"><strong>{project.name}</strong><small>Comenzar con {project.entryModule ? moduleLabels[project.entryModule] : "un módulo"}</small></span>
                </div>
              </div>
              <div className="create-project-row-modules" role="cell">{project.modules.length ? project.modules.map((module) => moduleLabels[module]).join(" · ") : "Aún sin contenido"}</div>
              <time role="cell" dateTime={project.activityAt}>{formatDate(project.activityAt)}</time>
              <div className="create-project-row-action" role="cell"><Link href={`/create/projects/${project.id}`} aria-label={`Abrir ${project.name}`} onClick={(event) => event.stopPropagation()}>Abrir <span aria-hidden="true">↗</span></Link></div>
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
