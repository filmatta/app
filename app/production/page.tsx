import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { listProductions, listProductionSourceOptions } from "@/lib/production/server";
import CreateProductionDialog from "@/components/production/CreateProductionDialog";

export const metadata: Metadata = { title: "Production · FILMATTA", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ script?: string; shotlist?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/production");
  const db = await createClient();
  const [productions, sourceOptions, requested] = await Promise.all([
    listProductions(db, viewer.id),
    listProductionSourceOptions(db, viewer.id),
    searchParams,
  ]);
  const preferredScriptId = requested.script && sourceOptions.scripts.some((source) => source.id === requested.script) ? requested.script : null;
  const preferredShotlistId = requested.shotlist && sourceOptions.shotlists.some((source) => source.id === requested.shotlist) ? requested.shotlist : null;

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
          <h1>De la escena al plan de rodaje.</h1>
          <p>Organiza jornadas, planos, necesidades, recursos y tareas sin alterar tus fuentes creativas.</p>
        </div>
        {productions.length > 0 && <CreateProductionDialog sources={sourceOptions} preferredScriptId={preferredScriptId} preferredShotlistId={preferredShotlistId} compact />}
      </section>
      {productions.length ? (
        <ul className="production-index-grid">
          {productions.map((production) => (
            <li key={production.id}>
              <Link href={`/production/${production.id}`}>
                <span className="production-index-status"><i /> Planificación activa</span>
                <h2>{production.name}</h2>
                <p>{production.shotlistId ? "Guion + Shotlist" : production.scriptId ? "Guion vinculado" : "Producción manual"}</p>
                <dl>
                  <div><dt>Jornadas</dt><dd>{production.dayCount}</dd></div>
                  <div><dt>Programados</dt><dd>{production.scheduledCount}</dd></div>
                  <div><dt>Pendientes</dt><dd>{production.pendingTaskCount}</dd></div>
                </dl>
                <small>Actualizada {new Date(production.updatedAt).toLocaleString("es-MX")}</small>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <section className="production-index-empty">
          <div className="production-empty-visual" aria-hidden="true">
            <span className="production-script-stack">GUION</span><b>→</b><span className="production-shot-stack">ESCENAS<br />PLANOS</span><b>→</b><span className="production-plan-stack">JORNADAS</span>
          </div>
          <div>
            <p className="production-eyebrow">DE GUION A SET</p>
            <h2>Prepara tu producción</h2>
            <p>Crea una estructura desde tus fuentes existentes o empieza con un espacio completamente manual.</p>
            <CreateProductionDialog sources={sourceOptions} preferredScriptId={preferredScriptId} preferredShotlistId={preferredShotlistId} />
          </div>
        </section>
      )}
      <footer className="production-index-footer"><span>Persistencia real · Sin IA</span><span>Writer y Shotlist permanecen intactos</span></footer>
    </main>
  );
}
