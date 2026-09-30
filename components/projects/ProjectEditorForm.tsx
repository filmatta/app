"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { saveProject } from "@/app/mis-proyectos/actions";
import {
  CLIENT_TYPES,
  ECONOMICS,
  PROJECT_STATES,
  PROJECT_TYPES,
  SCHEDULES,
  projectPublicationLabel,
  type Project,
} from "@/lib/networking/types";
import { PROFILE_DISCIPLINES } from "@/lib/profiles/constants";
import { PREFERENCE_GROUPS } from "@/lib/profiles/project-preferences";
import "./projects.css";

const DEFAULT_REQUIREMENTS: Project["requirements"] = {
  themes: [],
  participation: [],
  conditions: [],
};

export default function ProjectEditorForm({ initial }: { initial?: Project }) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const requirements = project?.requirements ?? DEFAULT_REQUIREMENTS;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  const coverSrc = useMemo(
    () => coverPreview ?? (project?.cover_image_path ? `/api/projects/covers/${project.id}` : null),
    [coverPreview, project],
  );
  const publication = project
    ? projectPublicationLabel(project)
    : "Borrador";

  return (
    <form
      className="project-editor"
      onChange={() => {
        setDirty(true);
        setMessage("");
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const intent = submitter?.value || "save";
        if (intent === "archive" && !window.confirm("¿Archivar este proyecto? Dejará de ser público y podrás reactivarlo después.")) return;
        if (intent === "unpublish" && !window.confirm("¿Despublicar este proyecto? Su URL pública dejará de estar disponible.")) return;
        const formData = new FormData(event.currentTarget);
        formData.set("intent", intent);
        setBusy(true);
        setError("");
        setMessage("");
        try {
          const result = await saveProject(project?.id ?? null, formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setProject(result.project);
          setDirty(false);
          setMessage(result.message);
          if (result.redirectTo) router.push(result.redirectTo);
          else router.refresh();
        } catch {
          setError("No pudimos guardar. Tus cambios siguen en el formulario.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <section className="project-editor-status" aria-label="Estado y visibilidad">
        <div>
          <span className={`project-status project-status--${publication.toLowerCase()}`}>{publication}</span>
          <h2>Estado del registro</h2>
          <p>{project?.lifecycle_status === "archived" ? "Archivado" : project?.lifecycle_status === "active" ? "Activo" : "Borrador"}</p>
        </div>
        <div>
          <h2>Visibilidad pública</h2>
          <p>{project?.visibility === "public" ? "Pública" : "Privada"}</p>
        </div>
        <p className="project-editor-status__note">Archivar y publicar son decisiones distintas. Despublicar conserva el proyecto y todas sus oportunidades.</p>
      </section>

      <section className="project-editor-section">
        <header><span>01</span><div><h2>Identidad</h2><p>La información que identifica la producción.</p></div></header>
        <div className="project-cover-field">
          <div className="project-cover-preview">
            {coverSrc ? <Image src={coverSrc} alt="Vista previa de la portada" width={800} height={500} unoptimized /> : <span aria-hidden="true">{(project?.title || "P").slice(0, 1).toUpperCase()}</span>}
          </div>
          <div>
            <label>Portada
              <input name="cover_image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                const file = event.target.files?.[0];
                setCoverPreview((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return file ? URL.createObjectURL(file) : null;
                });
              }} />
            </label>
            <small>JPG, PNG o WEBP · máximo 5 MB.</small>
            {project?.cover_image_path && <label className="project-check"><input type="checkbox" name="remove_cover" /> Quitar portada actual</label>}
          </div>
        </div>
        <div className="project-fields project-fields--two">
          <label>Nombre del proyecto<input name="title" required maxLength={160} defaultValue={project?.title ?? ""} /></label>
          <label>Tipo de producción<select name="project_type" defaultValue={project?.project_type ?? "Cortometraje"}>{PROJECT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Cliente / artista<input name="client_name" maxLength={120} defaultValue={project?.client_name ?? ""} /></label>
          <label>Tipo de cliente<select name="client_type" defaultValue={project?.client_type ?? "Proyecto personal"}>{CLIENT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        {project ? (
          <div className="project-slug"><span>URL estable</span><code>/proyectos/{project.slug}</code><p>Editar el título no cambia esta dirección.</p></div>
        ) : (
          <label>Base de la URL (opcional)<input name="slug" maxLength={140} placeholder="videoclip-los-astros" /><small>FILMATTA añadirá un sufijo único y mantendrá la URL estable.</small></label>
        )}
        <label className="project-check"><input type="checkbox" name="share_client_name" defaultChecked={project?.share_client_name} /> Mostrar cliente o artista cuando el proyecto sea visible</label>
      </section>

      <section className="project-editor-section">
        <header><span>02</span><div><h2>Información</h2><p>Contexto suficiente para entender el proyecto.</p></div></header>
        <label>Resumen<textarea name="summary" maxLength={500} rows={3} defaultValue={project?.summary ?? ""} /></label>
        <label>Descripción<textarea name="description" maxLength={20_000} rows={8} defaultValue={project?.description ?? ""} /></label>
        <div className="project-fields project-fields--two">
          <label>Ciudad<input name="city" maxLength={80} defaultValue={project?.city ?? ""} /></label>
          <label>Zona general<input name="work_area" maxLength={80} defaultValue={project?.work_area ?? ""} /></label>
          <label>Fecha inicial<input name="starts_on" type="date" min="2000-01-01" max="2200-12-31" defaultValue={project?.starts_on ?? ""} /></label>
          <label>Fecha final<input name="ends_on" type="date" min="2000-01-01" max="2200-12-31" defaultValue={project?.ends_on ?? ""} /></label>
        </div>
        <label>Periodo aproximado<input name="date_window" maxLength={100} placeholder="Por definir / Octubre 2026" defaultValue={project?.date_window ?? ""} /></label>
        <label className="project-check"><input type="checkbox" name="dates_confirmed" defaultChecked={project?.dates_confirmed} /> Fechas confirmadas</label>
        <div className="project-fields project-fields--three">
          <label>Jornada<select name="shooting_schedule" defaultValue={project?.shooting_schedule ?? "day"}>{Object.entries(SCHEDULES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Modalidad<select name="economic_mode" defaultValue={project?.economic_mode ?? "undecided"}>{Object.entries(ECONOMICS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Estado de producción<select name="operational_status" defaultValue={project?.operational_status ?? "active"}>{Object.entries(PROJECT_STATES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      </section>

      <section className="project-editor-section">
        <header><span>03</span><div><h2>Necesidades y preferencias</h2><p>Contexto reutilizable para búsquedas futuras; no activa matching automático.</p></div></header>
        <fieldset><legend>Roles buscados</legend><div className="project-choice-grid">{PROFILE_DISCIPLINES.map((role) => <label className="project-check" key={role}><input type="checkbox" name="roles" value={role} defaultChecked={project?.roles.includes(role)} /> {role}</label>)}</div></fieldset>
        {Object.entries(PREFERENCE_GROUPS).map(([group, choices]) => <fieldset key={group}><legend>{({ themes: "Temáticas", participation: "Participación frente a cámara", conditions: "Condiciones de trabajo" } as Record<string, string>)[group]}</legend><div className="project-choice-grid">{Object.entries(choices).map(([value, label]) => <label className="project-check" key={value}><input type="checkbox" name={`requirements.${group}`} value={value} defaultChecked={requirements[group as keyof typeof requirements].includes(value)} /> {label}</label>)}</div></fieldset>)}
      </section>

      {error && <p className="project-feedback project-feedback--error" role="alert">{error}</p>}
      {message && <p className="project-feedback project-feedback--success" role="status">{message}</p>}

      <div className="project-editor-actions" aria-live="polite">
        <button type="submit" name="intent" value="save" disabled={busy} className="project-button project-button--primary">{busy ? "Guardando…" : project ? "Guardar cambios" : "Guardar borrador"}</button>
        {project?.visibility === "public" ? <button type="submit" name="intent" value="unpublish" disabled={busy} className="project-button">Despublicar</button> : project?.lifecycle_status !== "archived" && <button type="submit" name="intent" value="publish" disabled={busy} className="project-button">Publicar</button>}
        {project?.lifecycle_status === "archived" ? <button type="submit" name="intent" value="restore" disabled={busy} className="project-button">Reactivar como borrador</button> : project && <button type="submit" name="intent" value="archive" disabled={busy} className="project-button project-button--quiet">Archivar</button>}
      </div>

      {project?.lifecycle_status !== "archived" && <section className="project-opportunity-shortcut">
        <div><p className="eyebrow">SIGUIENTE PASO</p><h2>¿Necesitas talento, crew o recursos para este proyecto?</h2><p>Guarda el Project y abre una Opportunity breve vinculada. Podrás crear varias.</p></div>
        <button type="submit" name="intent" value="create-opportunity" disabled={busy} className="project-button">+ Crear oportunidad</button>
      </section>}
    </form>
  );
}
