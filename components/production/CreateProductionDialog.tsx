"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProductionAction } from "@/app/production/actions";
import type { SourceScriptOption, SourceShotlistOption } from "@/lib/production/types";

export default function CreateProductionDialog({
  sources,
  projects,
  preferredProjectId,
  preferredScriptId,
  preferredShotlistId,
  compact = false,
}: {
  sources: { scripts: SourceScriptOption[]; shotlists: SourceShotlistOption[] };
  projects: { id: string; name: string; entryModule?: string | null }[];
  preferredProjectId: string | null;
  preferredScriptId: string | null;
  preferredShotlistId: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const operation = useRef<{ key: string; id: string } | null>(null);
  const [projectId, setProjectId] = useState(preferredProjectId ?? "");
  const [mode, setMode] = useState<"source" | "manual">("source");
  const [scriptId, setScriptId] = useState(preferredScriptId ?? "");
  const [shotlistId, setShotlistId] = useState(preferredShotlistId ?? "");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [importRequirements, setImportRequirements] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectScripts = useMemo(() => sources.scripts.filter((item) => item.projectId === projectId), [sources.scripts, projectId]);
  const projectShotlists = useMemo(() => sources.shotlists.filter((item) => item.projectId === projectId), [sources.shotlists, projectId]);
  const workspaceProject = Boolean(projects.find((item) => item.id === projectId)?.entryModule);
  const shotlist = useMemo(() => projectShotlists.find((item) => item.id === shotlistId) ?? null, [shotlistId, projectShotlists]);
  const effectiveScriptId = scriptId || shotlist?.scriptId || "";
  const script = projectScripts.find((item) => item.id === effectiveScriptId) ?? null;
  const incompatible = Boolean(scriptId && shotlist?.scriptId && scriptId !== shotlist.scriptId);
  const sourceReady = workspaceProject ? Boolean(script && shotlist && shotlist.scriptId === script.id) : Boolean(effectiveScriptId || shotlistId) && !incompatible;

  function open(nextMode: "source" | "manual") {
    if (nextMode === "manual" && workspaceProject) return;
    setMode(nextMode); setError(null);
    if (nextMode === "manual") { setScriptId(""); setShotlistId(""); }
    dialog.current?.showModal();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !projectId || mode === "manual" && workspaceProject || mode === "source" && !sourceReady) return;
    submitting.current = true;
    setBusy(true); setError(null);
    const fallbackName = mode === "manual" ? "Producción sin título" : shotlist?.title || script?.title || "Producción sin título";
    const input = { projectId, name: name.trim() || fallbackName, timezone,
      scriptId: mode === "source" ? effectiveScriptId || null : null,
      shotlistId: mode === "source" ? shotlistId || null : null,
      importRequirements: mode === "source" && importRequirements };
    const key = JSON.stringify(input);
    if (operation.current?.key !== key) operation.current = { key, id: crypto.randomUUID() };
    try {
      const result = await createProductionAction({ ...input, operationId: operation.current.id });
      if (!result.ok) { setError(result.message); return; }
      router.push(`/production/${result.data.id}?project=${projectId}`);
    } catch {
      setError("No pudimos confirmar la creación. Reintenta para recuperar la misma producción.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return (
    <div className={`production-create-actions${compact ? " is-compact" : ""}`}>
      <button type="button" className="production-primary" onClick={() => open("source")}>✦ {compact ? "Nueva producción" : "GENERAR PRODUCCIÓN"}</button>
      {!compact && !workspaceProject && <><span>o</span><button type="button" className="production-secondary" onClick={() => open("manual")}>CREAR MANUALMENTE</button></>}
      <dialog ref={dialog} className="production-dialog" onClose={() => { setBusy(false); setError(null); }}>
        <form onSubmit={submit}>
          <header>
            <div><p className="production-eyebrow">{mode === "source" ? "SIN IA" : "ESPACIO VACÍO"}</p><h2>{mode === "source" ? "Crear estructura desde tu guion o Shotlist" : "Crear producción manual"}</h2></div>
            <button type="button" className="production-icon-button" onClick={() => dialog.current?.close()} aria-label="Cerrar">×</button>
          </header>
          <p className="production-dialog-lead">{mode === "source" ? workspaceProject ? "Para empezar en este proyecto necesitas un guion y una Shotlist vinculada a ese mismo guion." : "Elige fuentes tuyas y revisa lo que estará disponible. No se inventarán jornadas, horarios ni responsables." : "Empezarás sin fuentes. Podrás vincularlas e incorporar necesidades después."}</p>
          <label>Proyecto<select value={projectId} onChange={(event) => { const nextProjectId = event.target.value; setProjectId(nextProjectId); setScriptId(""); setShotlistId(""); if (projects.find((item) => item.id === nextProjectId)?.entryModule) setMode("source"); }} required><option value="">Selecciona un proyecto</option>{projects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Nombre de la producción<input value={name} onChange={(event) => setName(event.target.value)} placeholder={shotlist?.title || script?.title || "Mi producción"} maxLength={160} /></label>
          <label>Zona horaria<input value={timezone} onChange={(event) => setTimezone(event.target.value)} list="production-timezones" maxLength={80} required /><datalist id="production-timezones"><option value="America/Mexico_City" /><option value="America/Tijuana" /><option value="America/New_York" /><option value="America/Los_Angeles" /><option value="Europe/Madrid" /></datalist></label>
          {mode === "source" && <>
            <div className="production-dialog-grid">
              <label>Guion<select value={scriptId} onChange={(event) => setScriptId(event.target.value)}><option value="">Sin guion directo</option>{projectScripts.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
              <label>Shotlist<select value={shotlistId} onChange={(event) => setShotlistId(event.target.value)}><option value="">Sin Shotlist</option>{projectShotlists.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
            </div>
            {incompatible && <p className="production-form-error" role="alert">La Shotlist pertenece a otro guion. Selecciona fuentes compatibles.</p>}
            {workspaceProject && !sourceReady && <p className="production-form-note">{!projectScripts.length ? "Falta un guion en este proyecto." : !projectShotlists.length ? "Falta una Shotlist vinculada al guion." : "Selecciona un guion y su Shotlist compatible."}</p>}
            {!workspaceProject && !effectiveScriptId && !shotlistId && <p className="production-form-note">Selecciona al menos una fuente o usa “Crear manualmente”.</p>}
            {(script || shotlist) && <section className="production-import-review">
              <h3>Se incorporará como estructura disponible</h3>
              <dl>
                <div><dt>Escenas / grupos</dt><dd>{shotlist?.groupCount ?? script?.sceneCount ?? 0}</dd></div>
                <div><dt>Planos actuales</dt><dd>{shotlist?.shotCount ?? 0}</dd></div>
                <div><dt>Necesidades vigentes</dt><dd>{script?.eligibleRequirementCount ?? 0}</dd></div>
              </dl>
              <label className="production-check"><input type="checkbox" checked={importRequirements} onChange={(event) => setImportRequirements(event.target.checked)} /> Incorporar necesidades confirmadas y con evidencia vigente</label>
            </section>}
            <p className="production-foundation-note">La organización inteligente de jornadas no está incluida en esta Foundation.</p>
          </>}
          {error && <p className="production-form-error" role="alert">{error}</p>}
          <footer><button type="button" className="production-secondary" onClick={() => dialog.current?.close()}>Cancelar</button><button className="production-primary" disabled={busy || !projectId || mode === "manual" && workspaceProject || mode === "source" && !sourceReady}>{busy ? "Creando…" : mode === "source" ? "Crear estructura" : "Crear producción"}</button></footer>
        </form>
      </dialog>
    </div>
  );
}
