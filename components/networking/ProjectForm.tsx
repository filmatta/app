"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveNetworkingProject } from "@/app/networking-actions";
import { PROFILE_DISCIPLINES } from "@/lib/profiles/constants";
import { PREFERENCE_GROUPS } from "@/lib/profiles/project-preferences";
import { PROJECT_TYPES, CLIENT_TYPES, SCHEDULES, ECONOMICS, type Project, type Requirements } from "@/lib/networking/types";
import "./networking.css";
export default function ProjectForm({ initial, onSaved, onCancel }: { initial?: Project; onSaved?: (project: Project) => void; onCancel?: () => void }) {
  const router = useRouter(); const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="network-form" onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    const f = new FormData(e.currentTarget), requirements = { themes: [], participation: [], conditions: [] } as Requirements;
    for (const group of Object.keys(PREFERENCE_GROUPS) as (keyof Requirements)[]) requirements[group] = f.getAll(group).map(String);
    const input = Object.fromEntries(["title", "summary", "project_type", "client_name", "client_type", "city", "work_area", "shooting_schedule", "economic_mode", "date_window", "status"].map(key => [key, String(f.get(key) ?? "")]));
    setBusy(true); setError("");
    try { const result = await saveNetworkingProject(initial?.id ?? null, { ...input, roles: f.getAll("roles").map(String), requirements });
      if ("error" in result) setError(result.error);
      else if (onSaved) onSaved(result.data); else { router.push(`/proyectos/${result.data.slug}?saved=1`); router.refresh(); }
    } catch { setError("No pudimos guardar. Tus cambios siguen aquí."); } finally { setBusy(false); }
  }}>
    <p>Proyecto privado. Sólo se comparte un resumen cuando lo adjuntas a una solicitud.</p>
    <label>Título<input name="title" required maxLength={160} defaultValue={initial?.title} /></label>
    <div className="network-fields"><label>Tipo de proyecto<select name="project_type" defaultValue={initial?.project_type ?? "Cortometraje"}>{PROJECT_TYPES.map(v => <option key={v}>{v}</option>)}</select></label>
    <label>Modalidad económica<select name="economic_mode" defaultValue={initial?.economic_mode ?? "undecided"}>{Object.entries(ECONOMICS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label>Cliente (opcional)<input name="client_name" maxLength={120} defaultValue={initial?.client_name} /></label>
    <label>Tipo de cliente<select name="client_type" defaultValue={initial?.client_type ?? "Proyecto personal"}>{CLIENT_TYPES.map(v => <option key={v}>{v}</option>)}</select></label>
    <label>Ciudad<input name="city" maxLength={80} defaultValue={initial?.city} /></label>
    <label>Zona de trabajo<input name="work_area" maxLength={80} defaultValue={initial?.work_area} /></label>
    <label>Jornada<select name="shooting_schedule" defaultValue={initial?.shooting_schedule ?? "day"}>{Object.entries(SCHEDULES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label>Fecha o periodo<input name="date_window" maxLength={100} placeholder="Por definir / octubre de 2026" defaultValue={initial?.date_window} /></label></div>
    <label>Resumen<textarea name="summary" maxLength={500} rows={3} defaultValue={initial?.summary ?? ""} /></label>
    <fieldset><legend>Roles buscados</legend><div className="network-checks">{PROFILE_DISCIPLINES.map(v => <label key={v}><input type="checkbox" name="roles" value={v} defaultChecked={initial?.roles.includes(v)} />{v}</label>)}</div></fieldset>
    <details><summary>Requisitos del proyecto</summary><p>Indica únicamente lo que requiere esta producción. Se usa la misma terminología de las preferencias profesionales.</p>
      {(Object.keys(PREFERENCE_GROUPS) as (keyof Requirements)[]).map(group => <fieldset key={group}><legend>{({ themes: "Temas", participation: "Participación", conditions: "Condiciones" })[group]}</legend><div className="network-checks">{Object.entries(PREFERENCE_GROUPS[group]).map(([v,l]) => <label key={v}><input type="checkbox" name={group} value={v} defaultChecked={initial?.requirements[group].includes(v)} />{l}</label>)}</div></fieldset>)}
      <small>La jornada nocturna o mixta añade el requisito de rodaje nocturno.</small>
    </details>
    {initial ? <label>Estado<select name="status" defaultValue={initial.status}><option value="draft">Privado</option><option value="archived">Archivado</option></select></label> : <input type="hidden" name="status" value="draft" />}
    {error && <p role="alert">{error}</p>}
    <div className="network-actions"><button disabled={busy} type="submit">{busy ? "Guardando…" : initial ? "Guardar proyecto" : "Crear proyecto"}</button>{onCancel && <button type="button" disabled={busy} onClick={onCancel}>Volver a la solicitud</button>}</div>
  </form>;
}
