"use client";
import { useEffect, useState } from "react";
import { EditorDialog } from "./PortfolioDialogs";
import { loadProjectPreferences, saveProjectPreferences } from "./preference-actions";
import { PROJECT_FORMATS, PREFERENCE_GROUPS, PREFERENCE_CHOICES, type ProjectPreferences, type PreferenceChoice } from "@/lib/profiles/project-preferences";
export default function ProjectPreferencesDialog({ close }: { close: () => void }) {
  const [value, setValue] = useState<ProjectPreferences | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { let live = true; void loadProjectPreferences().then(r => { if (!live) return; if (r.data) setValue(r.data); else setError(r.error ?? "No pudimos cargar las preferencias."); }).catch(() => { if(live) setError("No pudimos cargar las preferencias."); }); return () => { live = false; }; }, []);
  return <EditorDialog title="Preferencias de proyectos" close={close} busy={busy}>
    <p className="pe-hint">Privadas. No aparecen en tu perfil ni se comparten con otros miembros. Trabajar técnicamente en una producción no significa representar personalmente sus escenas.</p>
    <p className="bio-contact-warning">Estas preferencias no constituyen consentimiento definitivo ni acreditan capacitación. Cada escena, condición, límites y medidas de seguridad se acuerdan por separado.</p>
    {value && <form onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(""); setMessage(""); try { const result=await saveProjectPreferences(value); if(result.error) setError(result.error); else setMessage("Preferencias privadas guardadas."); } catch { setError("No pudimos guardar tus preferencias."); } finally {setBusy(false);} }}>
      <fieldset><legend>Formatos</legend><label className="pe-checkbox"><input type="checkbox" checked={value.open_formats} onChange={e => setValue({ ...value, open_formats: e.target.checked })} />Abierto a distintos formatos</label><p className="pe-hint">Esta opción sólo afecta formatos; no acepta escenas ni condiciones.</p>
        <div className="pe-disciplines">{PROJECT_FORMATS.map(f => <label key={f} className="pe-checkbox"><input type="checkbox" checked={value.formats.includes(f)} onChange={e => setValue({ ...value, formats: e.target.checked ? [...value.formats,f] : value.formats.filter(v => v !== f) })} />{f}</label>)}</div>
      </fieldset>
      {(Object.keys(PREFERENCE_GROUPS) as (keyof typeof PREFERENCE_GROUPS)[]).map(group => <fieldset key={group} className="pe-preferences"><legend>{group === "themes" ? "Temáticas" : group === "participation" ? "Participación personal frente a cámara" : "Condiciones de trabajo"}</legend>
        {Object.entries(PREFERENCE_GROUPS[group]).map(([key,label]) => <label key={key}>{label}<select value={value[group][key] ?? "unspecified"} onChange={e => setValue({ ...value, [group]: { ...value[group], [key]: e.target.value as PreferenceChoice } })}>{Object.entries(PREFERENCE_CHOICES).map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select></label>)}
      </fieldset>)}
      <footer><button type="button" onClick={close} disabled={busy}>Cerrar</button><button type="submit" disabled={busy} className="pe-primary">{busy ? "Guardando…" : "Guardar preferencias"}</button></footer>
    </form>}
    {!value && !error && <p role="status">Cargando preferencias privadas…</p>}{error && <p className="pe-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </EditorDialog>;
}
