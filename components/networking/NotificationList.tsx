"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markNetworkNotification } from "@/app/networking-actions";
import { notificationText, type NetworkNotification } from "@/lib/networking/types";
export default function NotificationList({ items, onRead }: { items: NetworkNotification[]; onRead?: () => void }) {
  const router = useRouter(), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const mark = async (id: string | null) => { setError(""); try { const r = await markNetworkNotification(id); if (r.error) setError(r.error); else { onRead?.(); router.refresh(); } } catch { setError("No pudimos actualizar las notificaciones."); } };
  return <><div>{items.length ? items.map(n => <Link className="network-notification" data-unread={!n.read_at} key={n.id} href={n.href} onClick={async e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) { void mark(n.id); return; } e.preventDefault(); await mark(n.id); router.push(n.href); }}>{notificationText(n)}<small>{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(n.created_at))}{!n.read_at && " · Sin leer"}</small></Link>) : <p className="network-notification-status">No tienes notificaciones nuevas.</p>}</div>
    {items.some(n => !n.read_at) && <div className="network-actions"><button disabled={busy} onClick={async () => { setBusy(true); await mark(null); setBusy(false); }}>Marcar como leídas</button></div>}{error && <p className="network-notification-status" role="alert">{error}</p>}
  </>;
}
