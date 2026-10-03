"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProductionAction } from "@/app/production/actions";
import type { SourceScriptOption, SourceShotlistOption } from "@/lib/production/types";

export default function CreateProductionDialog({
  sources,
  preferredScriptId,
  preferredShotlistId,
  compact = false,
}: {
  sources: { scripts: SourceScriptOption[]; shotlists: SourceShotlistOption[] };
  preferredScriptId: string | null;
  preferredShotlistId: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"source" | "manual">("source");
  const [scriptId, setScriptId] = useState(preferredScriptId ?? "");
  const [shotlistId, setShotlistId] = useState(preferredShotlistId ?? "");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [importRequirements, setImportRequirements] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shotlist = useMemo(() => sources.shotlists.find((item) => item.id === shotlistId) ?? null, [shotlistId, sources.shotlists]);
  const effectiveScriptId = scriptId || shotlist?.scriptId || "";
  const script = sources.scripts.find((item) => item.id === effectiveScriptId) ?? null;
  const incompatible = Boolean(scriptId && shotlist?.scriptId && scriptId !== shotlist.scriptId);

  function open(nextMode: "source" | "manual") {
    setMode(nextMode); setError(null);
    if (nextMode === "manual") { setScriptId(""); setShotlistId(""); }
    dialog.current?.showModal();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || incompatible) return;
    setBusy(true); setError(null);
    const fallbackName = mode === "manual" ? "Producción sin título" : shotlist?.title || script?.title || "Producción sin título";
    const result = await createProductionAction({
      operationId: crypto.randomUUID(), name: name.trim() || fallbackName, timezone,
      scriptId: mode === "source" ? effectiveScriptId || null : null,
      shotlistId: mode === "source" ? shotlistId || null : null,
      importRequirements: mode === "source" && importRequirements,
    });
    if (!result.ok) { setError(result.message); setBusy(false); return; }
    router.push(`/production/${result.data.id}`);
  }

  return (
    <div className={`production-create-actions${compact ? " is-compact" : ""}`}>
      <button type="button" className="production-primary" onClick={() => open("source")}>✦ {compact ? "Nueva producción" : "GENERAR PRODUCCIÓN"}</button>
      {!compact && <><span>o</span><button type="button" className="production-secondary" onClick={() => open("manual")}>CREAR MANUALMENTE</button></>}
      <dialog ref={dialog} className="production-dialog" onClose={() => { setBusy(false); setError(null); }}>
        <form onSubmit={submit}>
          <header>
            <div><p className="production-eyebrow">{mode === "source" ? "SIN IA" : "ESPACIO VACÍO"}</p><h2>{mode === "source" ? "Crear estructura desde tu guion o Shotlist" : "Crear producción manual"}</h2></div>
            <button type="button" className="production-icon-button" onClick={() => dialog.current?.close()} aria-label="Cerrar">×</button>
          </header>
          <p className="production-dialog-lead">{mode === "source" ? "Elige fuentes tuyas y revisa lo que estará disponible. No se inventarán jornadas, horarios ni responsables." : "Empezarás sin fuentes. Podrás vincularlas e incorporar necesidades después."}</p>
          <label>Nombre de la producción<input value={name} onChange={(event) => setName(event.target.value)} placeholder={shotlist?.title || script?.title || "Mi producción"} maxLength={160} /></label>
          <label>Zona horaria<input value={timezone} onChange={(event) => setTimezone(event.target.value)} list="production-timezones" maxLength={80} required /><datalist id="production-timezones"><option value="America/Mexico_City" /><option value="America/Tijuana" /><option value="America/New_York" /><option value="America/Los_Angeles" /><option value="Europe/Madrid" /></datalist></label>
          {mode === "source" && <>
            <div className="production-dialog-grid">
              <label>Guion<select value={scriptId} onChange={(event) => setScriptId(event.target.value)}><option value="">Sin guion directo</option>{sources.scripts.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
              <label>Shotlist<select value={shotlistId} onChange={(event) => setShotlistId(event.target.value)}><option value="">Sin Shotlist</option>{sources.shotlists.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
            </div>
            {incompatible && <p className="production-form-error" role="alert">La Shotlist pertenece a otro guion. Selecciona fuentes compatibles.</p>}
            {!effectiveScriptId && !shotlistId && <p className="production-form-note">Selecciona al menos una fuente o usa “Crear manualmente”.</p>}
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
          <footer><button type="button" className="production-secondary" onClick={() => dialog.current?.close()}>Cancelar</button><button className="production-primary" disabled={busy || mode === "source" && (!effectiveScriptId && !shotlistId || incompatible)}>{busy ? "Creando…" : mode === "source" ? "Crear estructura" : "Crear producción"}</button></footer>
        </form>
      </dialog>
    </div>
  );
}
