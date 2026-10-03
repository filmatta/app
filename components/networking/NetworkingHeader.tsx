"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Disclosure from "@/components/navigation/Disclosure";
import NotificationList from "./NotificationList";
import { loadNetworkNotifications } from "@/app/networking-actions";
import type { NetworkNotification } from "@/lib/networking/types";
import "./networking.css";
export default function NetworkingHeader({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname();
  const [items,setItems] = useState<NetworkNotification[]>([]), [count,setCount] = useState<number | null>(null), [error,setError] = useState(""), [loading,setLoading] = useState(false);
  const refresh = useCallback(async () => { if (!authenticated) return; setLoading(true); try { const r = await loadNetworkNotifications(); if ("error" in r) setError(r.error); else { setItems(r.items); setCount(r.summary.unread); setError(""); } } catch { setError("No pudimos cargar tus notificaciones."); } finally { setLoading(false); } }, [authenticated]);
  useEffect(() => {
    const start = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); },60000);
    return () => { clearTimeout(start); clearInterval(timer); };
  },[refresh,pathname]);
  return <>
    {authenticated && <Disclosure key={pathname+"-notifications"} iconOnly label={count ? `Notificaciones, ${count} sin leer` : "Notificaciones"} align="right" panelClassName="network-notifications-panel" onOpen={() => void refresh()} leading={<span className="network-bell"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10ZM10 21h4" /></svg>{count !== null && count > 0 && <span className="network-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>}</span>}>
      <h2 className="network-notification-title">NOTIFICACIONES</h2>{loading && !items.length ? <p role="status" className="network-notification-status">Cargando…</p> : <NotificationList items={items} onRead={() => void refresh()} />}
      {error && <p role="alert" className="network-notification-status">{error}</p>}<Link className="nav-menu-link" href="/notificaciones">Ver todas →</Link>
    </Disclosure>}
  </>;
}
