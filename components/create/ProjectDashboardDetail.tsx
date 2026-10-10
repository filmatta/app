import Image from "next/image";
import Link from "next/link";
import type { CreateProjectContext, CreateEntryModule } from "@/lib/create/project";
import type { CreateProjectOverview } from "@/lib/create/overview";
import type { RecentProjectDocument } from "@/lib/create/recent-documents";
import { createProjectModuleRoute } from "@/lib/create/routes";
import ProjectCoverUpload from "./ProjectCoverUpload";

const entryLabels: Record<CreateEntryModule, string> = {
  writer: "Guion",
  shotlist: "Shotlist",
  storyboard: "Storyboard",
  production: "Producción",
};

type DetailProps = {
  project: CreateProjectContext;
  overview: CreateProjectOverview;
  recentDocuments: RecentProjectDocument[];
};

type InspectorProps = Pick<DetailProps, "project" | "overview">;

export default function ProjectDashboardDetail({ project, overview, recentDocuments }: DetailProps) {
  const base = `/create/projects/${project.id}`;
  const sections = [
    { label: "Sandbox", href: createProjectModuleRoute(project, "sandbox") },
    { label: "Guion", href: createProjectModuleRoute(project, "writer") },
    { label: "Shotlist", href: createProjectModuleRoute(project, "shotlist") },
    { label: "Storyboard", href: createProjectModuleRoute(project, "storyboard") },
    { label: "Producción", href: createProjectModuleRoute(project, "production") },
    { label: "Documentos", href: createProjectModuleRoute(project, "documents") },
  ];
  const metrics = [
    {
      label: "Guion", icon: "▤", href: createProjectModuleRoute(project, "writer"),
      value: overview.scriptScenes === null ? "Sin guion" : `${overview.scriptScenes} ${overview.scriptScenes === 1 ? "escena" : "escenas"}`,
      detail: overview.scriptUpdatedAt ? `Editado ${formatDate(overview.scriptUpdatedAt)}` : "Fuente pendiente",
      current: null, total: null, action: project.writers.length ? "Ver guion" : "Crear guion",
    },
    {
      label: "Shotlist", icon: "☷", href: createProjectModuleRoute(project, "shotlist"),
      value: project.shotlists.length === 0 ? "Sin Shotlist" : overview.totalScenes === null
        ? "Guion pendiente"
        : `${overview.coveredScenes ?? 0} de ${overview.totalScenes} ${overview.totalScenes === 1 ? "escena" : "escenas"}`,
      detail: "Escenas con al menos un plano",
      current: overview.coveredScenes, total: overview.totalScenes, action: project.shotlists.length ? "Ver Shotlist" : project.writers.length ? "Crear Shotlist" : "Crear guion",
    },
    {
      label: "Storyboard", icon: "▧", href: createProjectModuleRoute(project, "storyboard"),
      value: overview.totalShots === null ? "Sin planos" : `${overview.visualizedShots ?? 0} de ${overview.totalShots} ${overview.totalShots === 1 ? "plano" : "planos"}`,
      detail: "Planos con panel visual",
      current: overview.visualizedShots, total: overview.totalShots, action: project.storyboards.some((item) => item.panelCount) ? "Ver Storyboard" : project.shotlists.length ? "Crear Storyboard" : "Crear Shotlist",
    },
    {
      label: "Producción", icon: "▦", href: createProjectModuleRoute(project, "production"),
      value: project.productions.length === 0 ? "Sin producción" : overview.totalShots
        ? `${overview.scheduledShots ?? 0} de ${overview.totalShots} ${overview.totalShots === 1 ? "plano" : "planos"}`
        : `${overview.productionDays} ${overview.productionDays === 1 ? "jornada" : "jornadas"}`,
      detail: project.productions.length === 0 ? "Plan de rodaje pendiente" : "Planos programados",
      current: project.productions.length ? overview.scheduledShots : null,
      total: overview.totalShots, action: project.productions.length ? "Ver producción" : project.shotlists.length ? "Crear producción" : "Preparar fuentes",
    },
  ];

  return <div className="create-selected-main">
    <section className="create-selected-project" aria-labelledby="create-selected-title">
      <div className="create-selected-cover">
        {project.coverImagePath
          ? <Image src={`/api/projects/covers/${project.id}`} alt="" width={320} height={176} unoptimized />
          : <span className="create-selected-cover-placeholder" aria-hidden="true" />}
        <details className="create-selected-cover-actions">
          <summary>{project.coverImagePath ? "Cambiar portada" : "Añadir portada"}</summary>
          <div><ProjectCoverUpload projectId={project.id} hasCover={Boolean(project.coverImagePath)} /></div>
        </details>
      </div>
      <div className="create-selected-identity">
        <div className="create-selected-identity-top">
          <div><p className="create-selected-eyebrow">PROYECTO SELECCIONADO</p><h2 id="create-selected-title">{project.name}</h2></div>
          <Link className="create-selected-open" href={base}>Abrir espacio <span aria-hidden="true">↗</span></Link>
        </div>
        {project.summary && <p className="create-selected-summary">{project.summary}</p>}
        <div className="create-selected-meta">
          {project.projectType && <span>{project.projectType}</span>}
          {project.city && <span>{project.city}</span>}
          {project.entryModule && <span>Comenzar con: {entryLabels[project.entryModule]}</span>}
          <span>Última actividad: {formatDate(overview.activityAt)}</span>
        </div>
      </div>
    </section>

    <nav className="create-selected-tabs" aria-label="Secciones del proyecto seleccionado">
      <span aria-current="page">Overview</span>
      {sections.map((section) => <Link key={section.label} href={section.href}>{section.label}</Link>)}
    </nav>

    <section className="create-selected-status" aria-labelledby="create-selected-status-title">
      <header className="create-selected-section-heading"><div><h3 id="create-selected-status-title">Estado del proyecto</h3><p>Avance de la producción creativa según el contenido actual.</p></div><Link href={base}>Ver detalle completo <span aria-hidden="true">→</span></Link></header>
      <div className="create-selected-metrics">
        {metrics.map((metric) => <Link key={metric.label} href={metric.href} className="create-selected-metric">
          <div className="create-selected-metric-heading"><span aria-hidden="true">{metric.icon}</span><h4>{metric.label}</h4></div>
          <strong>{metric.value}</strong>
          {metric.current !== null && metric.total !== null && metric.total > 0 && <progress value={metric.current} max={metric.total} aria-label={`${metric.label}: ${metric.current} de ${metric.total}`} />}
          <small>{metric.detail}</small>
          <span className="create-selected-metric-action">{metric.action} <span aria-hidden="true">→</span></span>
        </Link>)}
      </div>
    </section>

    <section className="create-selected-documents" aria-labelledby="create-selected-documents-title">
      <header className="create-selected-section-heading"><div><h3 id="create-selected-documents-title">Documentos recientes</h3><p>Exportaciones registradas para este proyecto.</p></div><Link href={`${base}/documents`}>Ver todos <span aria-hidden="true">→</span></Link></header>
      {recentDocuments.length > 0 ? <div className="create-selected-document-list">
        {recentDocuments.slice(0, 4).map((document) => <Link key={`${document.productionId}-${document.documentKey}`} href={`${base}/documents?production=${document.productionId}`} className="create-selected-document-row">
          <span className="create-selected-document-icon" aria-hidden="true">▤</span>
          <span className="create-selected-document-name"><strong>{document.label || document.documentKey}</strong><small>{document.productionName}</small></span>
          <span className="create-selected-document-version">{document.version}</span>
          <time dateTime={document.generatedAt}>{formatDate(document.generatedAt)}</time>
          <span aria-hidden="true">→</span>
        </Link>)}
      </div> : <p className="create-selected-documents-empty">Aún no hay exportaciones registradas. Los documentos generables están en Documentos.</p>}
    </section>
  </div>;
}

export function ProjectDashboardInspector({ project, overview }: InspectorProps) {
  const base = `/create/projects/${project.id}`;
  const details = [
    ["Nombre", project.name],
    ...(project.projectType ? [["Tipo", project.projectType]] : []),
    ...(project.city ? [["Ciudad", project.city]] : []),
    ["Creado", formatDate(project.createdAt)],
    ["Actualizado", formatDate(project.updatedAt)],
    ["Última actividad", formatDate(overview.activityAt)],
    ["Punto de entrada", project.entryModule ? entryLabels[project.entryModule] : "—"],
  ];
  return <aside className="create-selected-inspector" role="region" aria-label="Detalles del proyecto">
    <section className="create-selected-inspector-card">
      <h2>Detalles del proyecto</h2>
      <dl>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>
    <section className="create-selected-inspector-card create-selected-quick-links">
      <h2>Accesos rápidos</h2>
      <Link href={base}>Abrir espacio <span aria-hidden="true">↗</span></Link>
      {project.productions.length > 0 && <Link href={createProjectModuleRoute(project, "production")}>Abrir Producción <span aria-hidden="true">↗</span></Link>}
      <Link href={`${base}/documents`}>Ver Documentos <span aria-hidden="true">↗</span></Link>
    </section>
  </aside>;
}

function formatDate(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", {
    day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City",
  }).format(date);
}
