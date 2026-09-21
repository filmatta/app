"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import IdentityImage from "@/components/profiles/IdentityImage";
import { transitionRequest } from "@/app/networking-actions";
import { REQUEST_STATES, ECONOMICS, SCHEDULES, type ContactRequest } from "@/lib/networking/types";
import { PREFERENCE_GROUPS } from "@/lib/profiles/project-preferences";
export default function ContactRequestCard({ item, detail = false }: { item: ContactRequest; detail?: boolean }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState("");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { const tick = () => setNow(Date.now()); const timer = setInterval(tick, 30000); tick(); return () => clearInterval(timer); }, []);
  useEffect(() => { if (item.state !== "pending") return; const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 60000); return () => clearInterval(timer); }, [item.state, router]);
  const act = async (action: "accept" | "reject" | "cancel") => {
    setBusy(true); setError("");
    try { const result = await transitionRequest(item.id, action); if (result.error) setError(result.error); else router.refresh(); }
    catch { setError("No pudimos guardar. Inténtalo de nuevo."); } finally { setBusy(false); }
  };
  const hours = now === null ? null : Math.max(0, Math.ceil((Date.parse(item.expires_at) - now) / 3600000));
  const project = item.project_snapshot;
  return <article className="network-card">
    <header><div className="network-avatar">{item.portrait_media_id || item.portrait_url ? <IdentityImage id={item.portrait_media_id} fallbackUrl={item.portrait_url} alt="" interactive={false} /> : <span aria-hidden="true">{item.counterpart_name[0]}</span>}</div><div><h2>{item.counterpart_slug ? <Link href={`/perfiles/${item.counterpart_slug}`}>{item.counterpart_name}</Link> : item.counterpart_name}</h2><p className="network-muted">{[item.discipline,item.city].filter(Boolean).join(" · ")}</p></div></header>
    <p className="network-status">{item.is_recipient ? "Recibida" : "Enviada"} · {REQUEST_STATES[item.state]}{item.state === "pending" && hours !== null && ` · ${hours ? `Vence en ${hours} h` : "Venciendo"}`}</p>
    <p>{item.message}</p>
    {project && <section className="network-snapshot"><small>PROYECTO ADJUNTO</small><h3>{project.title}</h3><p>{[project.project_type,project.city,project.work_area].filter(Boolean).join(" · ")}</p><p>{SCHEDULES[project.shooting_schedule]} · {ECONOMICS[project.economic_mode]}{project.date_window && ` · ${project.date_window}`}</p>{project.roles.length > 0 && <p>Roles: {project.roles.join(", ")}</p>}
      {Object.entries(project.requirements).map(([group,keys]) => keys.length > 0 && <p key={group}>{keys.map(key => (PREFERENCE_GROUPS[group as keyof typeof PREFERENCE_GROUPS] as Record<string,string>)[key]).join(" · ")}</p>)}<small>Contexto guardado al enviar la solicitud.</small></section>}
    {!item.is_recipient && item.state === "pending" && <p className="network-muted">{item.credit_required ? "1 crédito reservado. Se consume sólo si acepta." : "Sin cargo de crédito. Sujeta a límites de envío."}</p>}
    {item.state === "pending" && <div className="network-actions">{item.is_recipient ? <><button disabled={busy} onClick={() => act("accept")}>Me interesa</button><button disabled={busy} onClick={() => act("reject")}>No me interesa</button></> : <button disabled={busy} onClick={() => act("cancel")}>Cancelar solicitud</button>}</div>}
    {item.state === "accepted" && <section className="network-channels"><h3>Solicitud aceptada</h3><p>Datos de contacto desbloqueados</p>
      {Object.keys(item.shared_contact_snapshot ?? {}).length ? <ul>{Object.entries(item.shared_contact_snapshot ?? {}).map(([channel,value]) => {
        if (!value) return null;
        const href = channel === "instagram" ? `https://www.instagram.com/${encodeURIComponent(value)}/` : channel === "whatsapp" ? `https://wa.me/${value.replace(/\D/g, "")}` : channel === "email" ? `mailto:${encodeURIComponent(value)}` : `tel:${value}`;
        return <li key={channel}><strong>{({ instagram: "Instagram", whatsapp: "WhatsApp", email: "Email", phone: "Teléfono" })[channel as "instagram"]}</strong><a href={href} target={channel === "instagram" || channel === "whatsapp" ? "_blank" : undefined} rel="noreferrer">{channel === "instagram" ? "@" : ""}{value}</a><button aria-label={`Copiar ${channel}`} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(channel); } catch { setError("No se pudo copiar. Puedes seleccionar el dato manualmente."); } }}>{copied === channel ? "Copiado" : "Copiar"}</button></li>;
      })}</ul> : <p className="network-muted">Este perfil aceptó tu solicitud, pero aún no configuró un canal de contacto compartible.</p>}
    </section>}
    {error && <p role="alert">{error}</p>}
    {!detail && <p><Link href={`/cuenta/contactos/${item.id}`}>Ver solicitud →</Link></p>}
  </article>;
}
