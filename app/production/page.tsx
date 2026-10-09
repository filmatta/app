import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { listProductions, listProductionSourceOptions } from "@/lib/production/server";
import CreateProductionDialog from "@/components/production/CreateProductionDialog";
import { listCreateProjects } from "@/lib/create/project";

export const metadata: Metadata = { title: "Production · FILMATTA", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ script?: string; shotlist?: string; project?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/production");
  const db = await createClient();
  const [allProductions, sourceOptions, projects, requested] = await Promise.all([
    listProductions(db, viewer.id),
    listProductionSourceOptions(db, viewer.id),
    listCreateProjects(db, viewer.id),
    searchParams,
  ]);
  if (requested.project && !projects.some((project) => project.id === requested.project)) notFound();
  const scopedSources = requested.project ? {
    scripts: sourceOptions.scripts.filter((source) => source.projectId === requested.project),
    shotlists: sourceOptions.shotlists.filter((source) => source.projectId === requested.project),
  } : sourceOptions;
  const scopedProjects = requested.project ? projects.filter((project) => project.id === requested.project) : projects;
  const preferredScriptId = requested.script && scopedSources.scripts.some((source) => source.id === requested.script) ? requested.script : null;
  const preferredShotlistId = requested.shotlist && scopedSources.shotlists.some((source) => source.id === requested.shotlist) ? requested.shotlist : null;
  const sourceProjectId = scopedSources.shotlists.find((source) => source.id === preferredShotlistId)?.projectId ?? scopedSources.scripts.find((source) => source.id === preferredScriptId)?.projectId ?? null;
  const preferredProjectId = requested.project && projects.some((project) => project.id === requested.project) ? requested.project : sourceProjectId ?? (projects.length === 1 ? projects[0].id : null);
  const productions = requested.project ? allProductions.filter((item) => item.projectId === requested.project) : allProductions;

  return (
    <main className="production-index">
      <header className="production-index-header">
        <Link href="/" className="production-wordmark">FILMATTA</Link>
        <span />
        <strong>Production</strong>
        <div className="production-avatar" aria-label={`Cuenta de ${viewer.displayName}`}>{viewer.displayName.slice(0, 2).toUpperCase()}</div>
      </header>
      <section className="production-index-intro">
        <div>
          <p className="production-eyebrow">PRODUCTION ASSISTANT</p>
          <h1>Producciones</h1>
          <p>Abre una producción para planear jornadas, consultar documentos y generar el Production Pack.</p>
        </div>
        {productions.length > 0 && <CreateProductionDialog sources={scopedSources} projects={scopedProjects} preferredProjectId={preferredProjectId} preferredScriptId={preferredScriptId} preferredShotlistId={preferredShotlistId} compact />}
      </section>
      {productions.length ? (
        <section className="production-index-list" aria-label="Tus producciones">
          <div className="production-index-list-head" aria-hidden="true"><span>Producción</span><span>Jornadas</span><span>Última actividad</span><span /></div>
          <ul>{productions.map((production) => <li key={production.id}>
            <Link href={`/production/${production.id}${requested.project ? `?project=${requested.project}` : ""}`}>
              <span className="production-index-list-name"><strong>{production.name}</strong><small>{production.shotlistId ? "Guion · Shotlist" : production.scriptId ? "Guion vinculado" : "Producción manual"}</small></span>
              <span className="production-index-list-count">{production.dayCount}</span>
              <time dateTime={production.updatedAt}>{new Date(production.updatedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</time>
              <span className="production-index-list-open">Abrir →</span>
            </Link>
          </li>)}</ul>
        </section>
      ) : (
        <section className="production-index-empty">
          <div className="production-empty-visual" aria-hidden="true">
            <span className="production-script-stack">GUION</span><b>→</b><span className="production-shot-stack">ESCENAS<br />PLANOS</span><b>→</b><span className="production-plan-stack">JORNADAS</span>
          </div>
          <div>
            <p className="production-eyebrow">DE GUION A SET</p>
            <h2>Prepara tu producción</h2>
            <p>{scopedProjects.some((item) => item.entryModule)
              ? "Vincula un guion y una Shotlist del mismo proyecto para iniciar la planificación."
              : "Crea una estructura desde tus fuentes existentes o empieza con un espacio manual."}</p>
            {scopedProjects.length
              ? <CreateProductionDialog sources={scopedSources} projects={scopedProjects} preferredProjectId={preferredProjectId} preferredScriptId={preferredScriptId} preferredShotlistId={preferredShotlistId} />
              : <Link className="production-primary production-index-start-link" href="/create">Crear proyecto →</Link>}
          </div>
        </section>
      )}
      <footer className="production-index-footer"><span>Persistencia real · Sin IA</span><span>Writer y Shotlist permanecen intactos</span></footer>
    </main>
  );
}
