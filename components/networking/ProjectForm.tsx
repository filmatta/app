"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveNetworkingProject } from "@/app/networking-actions";
import { PROFILE_DISCIPLINES } from "@/lib/profiles/constants";
import { PREFERENCE_GROUPS } from "@/lib/profiles/project-preferences";
import { PROJECT_TYPES, CLIENT_TYPES, SCHEDULES, ECONOMICS, PROJECT_STATES, type Project, type Requirements } from "@/lib/networking/types";
import FilmattaAccordion from "@/components/ui/FilmattaAccordion";
import SelectionRow from "@/components/ui/SelectionRow";
import FeedbackToast from "@/components/ui/FeedbackToast";
import { ProjectStatus } from "./ProjectMetadata";
import "./networking.css";

export default function ProjectForm({ initial, onSaved, onCancel }: { initial?: Project; onSaved?: (project: Project) => void; onCancel?: () => void }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [value, setValue] = useState({ title: initial?.title ?? "", summary: initial?.summary ?? "", project_type: initial?.project_type ?? "Cortometraje", client_name: initial?.client_name ?? "", client_type: initial?.client_type ?? "Proyecto personal", city: initial?.city ?? "", work_area: initial?.work_area ?? "", shooting_schedule: initial?.shooting_schedule ?? "day", economic_mode: initial?.economic_mode ?? "undecided", date_window: initial?.date_window ?? "", operational_status: initial?.operational_status ?? "active", status: initial?.status ?? "draft", roles: initial?.roles ?? [], requirements: initial?.requirements ?? { themes: [], participation: [], conditions: [] } as Requirements });
  const [baseline, setBaseline] = useState(JSON.stringify(value)), dirty = JSON.stringify(value) !== baseline;
  const leaving = useRef<(() => void) | null>(null), confirm = useRef<HTMLDialogElement>(null), [rolesOpen, setRolesOpen] = useState(false), [saved, setSaved] = useState(0);
  useEffect(() => {
    if (!dirty || busy) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const click = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || link.origin !== location.origin || (link.pathname === location.pathname && link.search === location.search)) return;
      e.preventDefault(); e.stopPropagation(); leaving.current = () => router.push(link.pathname + link.search + link.hash); confirm.current?.showModal();
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty, busy, router]);
  const set = (key: string, v: string) => setValue(current => ({ ...current, [key]: v }));
  const single = (title: string, key: "project_type" | "shooting_schedule" | "economic_mode", choices: Record<string, string>) => <FilmattaAccordion title={title} summary={choices[value[key]]}><div className="selection-grid" role="radiogroup" aria-label={title}>{Object.entries(choices).map(([v, label]) => <SelectionRow key={v} type="radio" name={key} value={v} checked={value[key] === v} onChange={() => set(key, v)}>{label}</SelectionRow>)}</div></FilmattaAccordion>;
  return <>
    <form id="editar-proyecto" className="network-form" onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      if (!value.roles.length) { setError("Selecciona al menos una opción."); setRolesOpen(true); return; }
      const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
      const next = { ...value, status: action === "archive" ? "archived" as const : action === "restore" ? "draft" as const : value.status };
      setBusy(true); setError("");
      try {
        const result = await saveNetworkingProject(initial?.id ?? null, next);
        if ("error" in result) setError(result.error);
        else {
          const persisted = { ...next, requirements: result.data.requirements, roles: result.data.roles };
          setBaseline(JSON.stringify(persisted)); setValue(persisted);
          if (onSaved) onSaved(result.data);
          else if (!initial) { router.push("/mis-proyectos?created=1"); router.refresh(); }
          else { setSaved(n => n + 1); router.refresh(); }
        }
      } catch { setError("No pudimos guardar. Tus cambios siguen aquí."); } finally { setBusy(false); }
    }}>
      <div className="network-form-block"><div className="network-block-heading"><h2>Estado del proyecto</h2><ProjectStatus project={value} /></div>
        <div className="network-state-options" role="radiogroup" aria-label="Estado del proyecto">{Object.entries(PROJECT_STATES).map(([v, label]) => <SelectionRow type="radio" name="operational_status" value={v} checked={value.operational_status === v} onChange={() => set("operational_status", v)} key={v}>{label}</SelectionRow>)}</div>
        <p className="network-privacy-note">Visibilidad: Privado. Sólo tú puedes abrirlo; al adjuntarlo compartes un resumen.</p>
      </div>
      <section className="network-form-block"><h2>Información básica</h2>
        <label>Nombre del proyecto<input name="title" required maxLength={160} value={value.title} onChange={e => set("title", e.target.value)} /></label>
        {single("Tipo de proyecto", "project_type", Object.fromEntries(PROJECT_TYPES.map(v => [v, v])))}
        <div className="network-fields"><label>Cliente o artista (opcional)<input name="client_name" maxLength={120} value={value.client_name} onChange={e => set("client_name", e.target.value)} /></label><label>Tipo de cliente<select name="client_type" value={value.client_type} onChange={e => set("client_type", e.target.value)}>{CLIENT_TYPES.map(v => <option key={v}>{v}</option>)}</select></label></div>
        <label>Descripción breve<textarea name="summary" maxLength={500} rows={3} value={value.summary} onChange={e => set("summary", e.target.value)} /></label>
      </section>
      <section className="network-form-block"><h2>Producción</h2><div className="network-fields"><label>Ciudad<input name="city" maxLength={80} value={value.city} onChange={e => set("city", e.target.value)} /></label><label>Zona de trabajo<input name="work_area" maxLength={80} value={value.work_area} onChange={e => set("work_area", e.target.value)} /></label></div>
        {single("Jornada", "shooting_schedule", SCHEDULES)}{single("Modalidad", "economic_mode", ECONOMICS)}
        <label>Fecha o periodo<input name="date_window" maxLength={100} placeholder="Por definir / 12–14 de octubre" value={value.date_window} onChange={e => set("date_window", e.target.value)} /></label>
      </section>
      <section className="network-form-block"><h2>Necesidades</h2>
        <FilmattaAccordion title="Roles buscados" summary={`${value.roles.length} seleccionados · mínimo 1`} open={rolesOpen} onOpenChange={setRolesOpen}>
          <div className="selection-grid">{PROFILE_DISCIPLINES.map(v => <SelectionRow key={v} name="roles" value={v} checked={value.roles.includes(v)} onChange={e => setValue({ ...value, roles: e.target.checked ? [...value.roles, v] : value.roles.filter(role => role !== v) })}>{v}</SelectionRow>)}</div>
          {!value.roles.length && <p className="network-field-hint">Selecciona al menos una opción.</p>}
        </FilmattaAccordion>
        {(Object.keys(PREFERENCE_GROUPS) as (keyof Requirements)[]).map(group => <FilmattaAccordion key={group} title={({ themes: "Temáticas", participation: "Participación frente a cámara", conditions: "Condiciones de trabajo" })[group]} summary={`${value.requirements[group].length} seleccionadas`}><div className="selection-grid">{Object.entries(PREFERENCE_GROUPS[group]).map(([v, label]) => <SelectionRow key={v} name={group} value={v} checked={value.requirements[group].includes(v)} onChange={e => setValue({ ...value, requirements: { ...value.requirements, [group]: e.target.checked ? [...value.requirements[group], v] : value.requirements[group].filter(item => item !== v) } })}>{label}</SelectionRow>)}</div></FilmattaAccordion>)}
        <p className="network-field-hint">La jornada nocturna o mixta incluye rodaje nocturno como requisito.</p>
      </section>
      {error && <p role="alert">{error}</p>}
      <div className="network-actions"><button disabled={busy} type="submit">{busy ? "Guardando…" : initial ? "Guardar cambios" : "Guardar proyecto"}</button>{onCancel && <button type="button" disabled={busy} onClick={() => { if (dirty) { leaving.current = onCancel; confirm.current?.showModal(); } else onCancel(); }}>Volver a la solicitud</button>}</div>
      {initial && <section className="network-archive"><h2>{value.status === "archived" ? "Proyecto archivado" : "Archivar proyecto"}</h2><p>Archivar es independiente del estado operativo. El contexto de las solicitudes anteriores se conserva.</p><button type="submit" value={value.status === "archived" ? "restore" : "archive"} disabled={busy}>{value.status === "archived" ? "Restaurar proyecto" : "Archivar proyecto"}</button></section>}
    </form>
    {saved > 0 && <FeedbackToast key={saved} message="Cambios guardados" />}
    <dialog className="network-leave-dialog" ref={confirm} aria-labelledby="leave-project-title"><h2 id="leave-project-title">Tienes cambios sin guardar.</h2><div className="network-actions"><button type="button" onClick={() => confirm.current?.close()}>Seguir editando</button><button type="button" onClick={() => { confirm.current?.close(); leaving.current?.(); }}>Salir sin guardar</button></div></dialog>
  </>;
}
