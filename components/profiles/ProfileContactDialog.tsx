"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { sendProfileContact } from "@/app/cuenta/contactos/actions";
import { listAttachableProjects } from "@/app/networking-actions";
import { CONTACT_TYPES } from "@/lib/contacts/types";
import type { Project } from "@/lib/networking/types";
import ProjectForm from "@/components/networking/ProjectForm";
export default function ProfileContactDialog({ slug, name, compact = false }: { slug: string; name: string; compact?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), labelId = useId();
  const [state, action, pending] = useActionState(sendProfileContact, { error: "" });
  const [message,setMessage] = useState(""), [reason,setReason] = useState("professional_interest"), [projectId,setProjectId] = useState("");
  const [projects,setProjects] = useState<Project[]>([]), [creating,setCreating] = useState(false), [loading,setLoading] = useState(false), [projectError,setProjectError] = useState("");
  useEffect(() => () => { document.body.style.overflow = ""; }, []);
  const close = () => { dialog.current?.close(); document.body.style.overflow = ""; };
  const load = async () => { setLoading(true); setProjectError(""); try { const r = await listAttachableProjects(); if ("error" in r) setProjectError(r.error); else setProjects(r.data); } catch { setProjectError("No pudimos cargar tus proyectos."); } finally { setLoading(false); } };
  return <><button type="button" className="p2-contact-button" onClick={() => { dialog.current?.showModal(); document.body.style.overflow = "hidden"; void load(); }}>{compact ? "Contactar ↗" : "Contactar"}</button>
    <dialog ref={dialog} className="profile-contact-dialog" aria-labelledby={labelId} onClose={() => { document.body.style.overflow = ""; }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="profile-contact-panel"><header><div><p className="eyebrow">FILMATTA / SOLICITUD</p><h2 id={labelId}>{creating ? "Crear proyecto" : "Contactar a " + name}</h2></div><button type="button" className="profile-contact-close" onClick={close} aria-label="Cerrar">×</button></header>
        {creating ? <ProjectForm onCancel={() => setCreating(false)} onSaved={p => { setProjects(prev => [p,...prev]); setProjectId(p.id); setCreating(false); }} /> : <form action={action} className="network-form">
          <input type="hidden" name="slug" value={slug} />
          <label>Motivo<select name="contact_type" value={reason} onChange={e => setReason(e.target.value)}>{CONTACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
          <label>Mensaje<textarea name="message" minLength={20} maxLength={200} rows={4} required value={message} onChange={e => setMessage(e.target.value)} placeholder="Cuéntale brevemente el contexto y por qué quieres contactar." /></label>
          <small>{message.length} / 200 · Mínimo 20 caracteres</small>
          <label>Adjuntar proyecto (opcional)<select name="project_id" value={projectId} onChange={e => setProjectId(e.target.value)} disabled={loading}><option value="">{loading ? "Cargando proyectos…" : "Sin proyecto adjunto"}</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
          {projectError && <p role="alert">{projectError} <button type="button" onClick={() => void load()}>Reintentar</button></p>}
          <button type="button" onClick={() => setCreating(true)}>+ Crear proyecto</button>
          <p>Los créditos se gastan cuando este perfil acepta tu solicitud. Si requiere crédito, se reserva durante un máximo de 48 horas.</p>
          {state.error && <p role="alert">{state.error}</p>}
          <button type="submit" className="p2-contact-button" disabled={pending || loading}>{pending ? "Enviando…" : "Enviar solicitud"}</button>
        </form>}
      </div>
    </dialog>
  </>;
}
