"use client";
import StatusBadge from "@/components/ui/StatusBadge";
import ProfileAvatar from "@/components/profiles/ProfileAvatar";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markNetworkNotification } from "@/app/networking-actions";
import { notificationText, type NetworkNotification } from "@/lib/networking/types";
export default function NotificationList({ items, onRead }: { items: NetworkNotification[]; onRead?: () => void }) {
  const router = useRouter(), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const mark = async (id: string | null) => { setError(""); try { const r = await markNetworkNotification(id); if (r.error) setError(r.error); else { onRead?.(); router.refresh(); } } catch { setError("No pudimos actualizar las notificaciones."); } };
  return <><div>{items.length ? items.map(n => <Link className="network-notification" data-unread={!n.read_at} key={n.id} href={n.href} onClick={async e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) { void mark(n.id); return; } e.preventDefault(); await mark(n.id); router.push(n.href); }}><span className="network-notification-avatar">{n.has_actor ? <ProfileAvatar id={n.portrait_media_id} fallbackUrl={n.portrait_url} name={n.actor_name} /> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>}</span><span className="network-notification-body"><StatusBadge tone={n.type === "contact_request_expiring" ? "warning" : "info"}>{n.type === "follow_received" ? "Follow" : n.type === "contact_request_expiring" ? "Sistema" : "Solicitud"}</StatusBadge><span className="network-notification-text">{notificationText(n)}</span>{n.project_title && <span className="network-notification-project">Proyecto: {n.project_title}</span>}<small>{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(n.created_at))}{!n.read_at && " · Sin leer"}</small></span></Link>) : <p className="network-notification-status">No tienes notificaciones nuevas.</p>}</div>
    {items.some(n => !n.read_at) && <div className="network-actions"><button disabled={busy} onClick={async () => { setBusy(true); await mark(null); setBusy(false); }}>Marcar como leídas</button></div>}{error && <p className="network-notification-status" role="alert">{error}</p>}
  </>;
}
