"use client";
import StatusBadge from "@/components/ui/StatusBadge";
import { MetaChips } from "@/components/ui/MetaChip";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileAvatar from "@/components/profiles/ProfileAvatar";
import { transitionRequest } from "@/app/networking-actions";
import { REQUEST_STATES, ECONOMICS, SCHEDULES, type ContactRequest } from "@/lib/networking/types";
import { PREFERENCE_GROUPS } from "@/lib/profiles/project-preferences";
export default function ContactRequestCard({ item, detail = false, view = "request", contactPage = 1 }: { item: ContactRequest; detail?: boolean; view?: "request" | "contact"; contactPage?: number }) {
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
  return <article id={"contact-"+item.id} className={"network-card " + (view === "contact" ? "network-card--contact" : "")}>
    <header><div className="network-avatar">{item.portrait_media_id || item.portrait_url ? <ProfileAvatar id={item.portrait_media_id} fallbackUrl={item.portrait_url} name={item.counterpart_name} /> : <span aria-hidden="true">{item.counterpart_name[0]}</span>}</div><div><h2>{item.counterpart_slug ? <Link href={`/perfiles/${item.counterpart_slug}`}>{item.counterpart_name}</Link> : item.counterpart_name}</h2><p className="network-muted">{[item.discipline,item.city].filter(Boolean).join(" · ")}</p></div></header>
    <div className="network-request-state"><StatusBadge tone={item.state === "pending" ? "warning" : item.state === "accepted" ? "success" : item.state === "rejected" ? "danger" : "neutral"}>{view === "contact" ? "Contacto activo" : REQUEST_STATES[item.state]}</StatusBadge><span>{item.is_recipient ? "Recibida" : "Enviada"}</span>{item.state === "pending" && hours !== null && <span>{hours ? "Vence en " + hours + " h" : "Venciendo"}</span>}<time dateTime={item.accepted_at ?? item.created_at}>{item.accepted_at ? "Aceptada · " : ""}{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" }).format(new Date(item.accepted_at ?? item.created_at))}</time></div>
    <MetaChips labels={[item.discipline, item.city]} limit={3} />
    <p>{item.message}</p>
    {project && <section className="network-snapshot"><StatusBadge tone="info">Proyecto</StatusBadge><h3>{item.project_slug ? <Link href={`/proyectos/${item.project_slug}`}>{project.title} ↗</Link> : project.title}</h3><MetaChips labels={[project.project_type,project.city,SCHEDULES[project.shooting_schedule],ECONOMICS[project.economic_mode]]} />{project.date_window && <p className="network-muted">{project.date_window}</p>}{project.roles.length > 0 && <p>Roles: {project.roles.join(", ")}</p>}
      {Object.entries(project.requirements).map(([group,keys]) => keys.length > 0 && <p key={group}>{keys.map(key => (PREFERENCE_GROUPS[group as keyof typeof PREFERENCE_GROUPS] as Record<string,string>)[key]).join(" · ")}</p>)}<small>Contexto guardado al enviar la solicitud. La ficha del proyecto muestra sus datos actuales.</small></section>}
    {!item.is_recipient && item.state === "pending" && <p className="network-muted">{item.credit_required ? "1 crédito reservado. Se consume sólo si acepta." : "Sin cargo de crédito. Sujeta a límites de envío."}</p>}
    {item.state === "pending" && item.is_recipient && <p className="network-muted">Al aceptar, compartes sólo los canales que autorizaste en <Link href="/cuenta#datos-contacto">tus datos de contacto</Link>.</p>}
    {item.state === "pending" && <div className="network-actions">{item.is_recipient ? <><button disabled={busy} onClick={() => act("accept")}>Me interesa</button><button disabled={busy} onClick={() => act("reject")}>No me interesa</button></> : <button disabled={busy} onClick={() => act("cancel")}>Cancelar solicitud</button>}</div>}
    {item.state === "accepted" && (view === "contact" || detail) && <section className="network-channels"><h3>Solicitud aceptada</h3><p>Datos de contacto desbloqueados</p>
      {Object.keys(item.shared_contact_snapshot ?? {}).length ? <ul>{Object.entries(item.shared_contact_snapshot ?? {}).map(([channel,value]) => {
        if (!value) return null;
        const href = channel === "instagram" ? `https://www.instagram.com/${encodeURIComponent(value)}/` : channel === "whatsapp" ? `https://wa.me/${value.replace(/\D/g, "")}` : channel === "email" ? `mailto:${encodeURIComponent(value)}` : `tel:${value}`;
        return <li key={channel}><strong>{({ instagram: "Instagram", whatsapp: "WhatsApp", email: "Email", phone: "Teléfono" })[channel as "instagram"]}</strong><a href={href} target={channel === "instagram" || channel === "whatsapp" ? "_blank" : undefined} rel="noreferrer">{channel === "instagram" ? "@" : ""}{value}</a><button aria-label={`Copiar ${channel}`} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(channel); } catch { setError("No se pudo copiar. Puedes seleccionar el dato manualmente."); } }}>{copied === channel ? "Copiado" : "Copiar"}</button></li>;
      })}</ul> : <p className="network-muted">Este perfil aceptó tu solicitud, pero aún no configuró un canal de contacto compartible.</p>}
    </section>}
    {error && <p role="alert">{error}</p>}
    {item.state === "accepted" && view === "request" && !detail ? <Link className="network-link-button" href={"/cuenta/contactos?box=accepted&page="+contactPage+"#contact-"+item.id}>Ver contacto →</Link> : !detail && <p><Link href={`/cuenta/contactos/${item.id}`}>Ver solicitud →</Link></p>}
  </article>;
}
