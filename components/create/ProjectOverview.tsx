import Image from "next/image";
import Link from "next/link";
import type { CreateProjectContext } from "@/lib/create/project";
import type { CreateProjectOverview } from "@/lib/create/overview";
import CreateProjectWriterButton from "./CreateProjectWriterButton";
import CreateProjectShotlistButton from "./CreateProjectShotlistButton";
import ProjectCoverUpload from "./ProjectCoverUpload";

export default function ProjectOverview({ project, overview }: {
  project: CreateProjectContext;
  overview: CreateProjectOverview;
}) {
  const base = `/create/projects/${project.id}`;
  const hasScript = project.writers.length > 0;
  const hasShotlist = project.shotlists.some((shotlist) => shotlist.scriptId && project.writers.some((writer) => writer.id === shotlist.scriptId));
  const startLabel = project.entryModule ? ({ writer: "Guion", shotlist: "Shotlist", storyboard: "Storyboard", production: "Producción" } as const)[project.entryModule] : null;
  const availableBoards = project.storyboards.filter((board) => board.panelCount > 0 || project.shotlists.some((shotlist) =>
    shotlist.id === board.id && shotlist.scriptId && project.writers.some((writer) => writer.id === shotlist.scriptId)));
  const metrics = [
    { label: "Guion", href: "#writer", value: overview.scriptScenes === null ? "Sin guion" : `${overview.scriptScenes} escenas`, detail: overview.scriptUpdatedAt ? `Editado ${formatDate(overview.scriptUpdatedAt)}` : "Fuente del proyecto", current: null, total: null },
    { label: "Shotlist", href: "#shotlists", value: !project.shotlists.length ? "Sin Shotlist" : overview.totalScenes === null ? "Guion pendiente" : `${overview.coveredScenes} de ${overview.totalScenes} escenas cubiertas`, detail: "Cobertura de escenas con al menos un plano", current: overview.coveredScenes, total: overview.totalScenes },
    { label: "Storyboard", href: "#storyboards", value: overview.totalShots === null ? "Sin planos" : `${overview.visualizedShots ?? 0} de ${overview.totalShots} planos visualizados`, detail: "Planos con un panel visual vigente", current: overview.visualizedShots, total: overview.totalShots },
    { label: "Producción", href: "#production", value: !project.productions.length ? "Sin Production" : overview.totalShots ? `${overview.scheduledShots ?? 0} de ${overview.totalShots} planos programados` : `${overview.productionDays} jornadas`, detail: project.productions.length ? `${overview.productionDays} jornadas` : "Plan de rodaje pendiente", current: project.productions.length ? overview.scheduledShots : null, total: overview.totalShots },
  ];

  return <>
    <div className="create-overview-header">
      <div className="create-overview-cover">
        {project.coverImagePath ? <Image src={`/api/projects/covers/${project.id}`} alt="" width={176} height={108} unoptimized /> : <span aria-hidden="true">▦</span>}
      </div>
      <div className="create-overview-heading"><p>PROJECT OVERVIEW</p><h1>{project.name}</h1><div className="create-overview-meta">{startLabel && <span>Comenzar con: {startLabel}</span>}<span>Actualizado {formatDate(overview.activityAt)}</span></div><ProjectCoverUpload projectId={project.id} hasCover={Boolean(project.coverImagePath)} /><span className="create-cover-future" aria-disabled="true">Generar portada · próxima iteración</span></div>
    </div>

    <section className="create-overview-section" aria-labelledby="project-status-title"><div className="create-section-heading"><div><h2 id="project-status-title">Estado del proyecto</h2><p>El contenido disponible y dónde continuar.</p></div></div>
      <div className="create-status-list">{metrics.map((metric) => <a key={metric.label} href={metric.href} className="create-status-row">
        <strong>{metric.label}</strong><div><span>{metric.value}</span><small>{metric.detail}</small>{metric.current !== null && metric.total !== null && metric.total > 0 && <progress value={metric.current} max={metric.total} aria-label={`${metric.label}: ${metric.current} de ${metric.total}`} />}</div><span aria-hidden="true">→</span>
      </a>)}</div>
    </section>

    <section className="create-overview-section" aria-labelledby="project-content-title"><div className="create-section-heading"><div><h2 id="project-content-title">Contenido del proyecto</h2><p>Abre un módulo o prepara su fuente.</p></div></div>
      <div className="create-module-list">
        <section id="writer" className="create-module-row"><div><h3>Guion</h3><p>{hasScript ? "Guiones de este Project" : "Escribe un guion nuevo o importa uno existente para preparar los demás módulos."}</p></div><div className="create-module-row-actions">
          {project.writers.map((writer) => <Link key={writer.id} href={`/writer/${writer.id}?project=${project.id}`}>{writer.title} →</Link>)}
          {!hasScript && <CreateProjectWriterButton projectId={project.id} />}
        </div></section>
        <section id="shotlists" className="create-module-row"><div><h3>Shotlist</h3><p>{hasScript ? "Vincula una Shotlist al guion de este Project." : "Para crear tu Shotlist necesitamos un guion del Project."}</p></div><div className="create-module-row-actions">
          {project.shotlists.map((shotlist) => <Link key={shotlist.id} href={`/shotlists/${shotlist.id}?project=${project.id}`}>{shotlist.title} →</Link>)}
          {hasScript ? <CreateProjectShotlistButton projectId={project.id} writers={project.writers} /> : <a href="#writer">Preparar guion →</a>}
        </div></section>
        <section id="storyboards" className="create-module-row"><div><h3>Storyboard</h3><p>{!hasScript ? "Necesita un guion. El tablero actual usa planos de una Shotlist real." : !project.shotlists.length ? "Prepara una Shotlist real para abrir el tablero de planos." : "Visualiza los planos del Project."}</p></div><div className="create-module-row-actions">
          {availableBoards.map((board) => <Link key={board.id} href={`/shotlists/${board.id}/storyboard?project=${project.id}`}>{board.title} · {board.panelCount} paneles →</Link>)}
          {!availableBoards.length && <a href={hasScript ? "#shotlists" : "#writer"}>Preparar fuente →</a>}
        </div></section>
        <section id="production" className="create-module-row"><div><h3>Producción</h3><p>{hasScript && hasShotlist ? "Planifica jornadas, recursos y documentos desde guion y Shotlist." : "Para comenzar Production se necesitan un guion y una Shotlist vinculada."}</p></div><div className="create-module-row-actions">
          {project.productions.map((production) => <Link key={production.id} href={`/production/${production.id}?project=${project.id}`}>{production.title} →</Link>)}
          {hasScript && hasShotlist ? <Link href={`/production?project=${project.id}`}>Abrir Producción →</Link> : <a href={hasScript ? "#shotlists" : "#writer"}>Preparar fuentes →</a>}
        </div></section>
        <section className="create-module-row"><div><h3>Documentos</h3><p>Production Pack y documentos generados desde el contenido disponible.</p></div><div className="create-module-row-actions"><Link href={`${base}/documents`}>Abrir Documentos →</Link></div></section>
      </div>
    </section>
  </>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" }).format(date);
}
