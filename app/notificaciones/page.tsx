import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import NotificationList from "@/components/networking/NotificationList";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import type { NetworkNotification } from "@/lib/networking/types";
import "@/components/networking/networking.css";
export const metadata = { title: "Notificaciones", robots: { index: false, follow: false } };
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!(await getViewer())) redirect("/login?next=%2Fnotificaciones");
  const page = Math.max(1,Math.min(1000,Number((await searchParams).page)||1));
  const db = await createClient(), { data,error } = await db.rpc("get_my_network_notifications", { p_page: page });
  const rows = (data ?? []) as NetworkNotification[];
  return <div className="editorial-page"><SiteHeader /><main className="network-shell"><header className="network-heading"><h1>Notificaciones</h1><p>Solicitudes y conexiones profesionales.</p></header>{error ? <p role="alert">No pudimos cargar tus notificaciones.</p> : <NotificationList items={rows.slice(0,24)} />}
    <div className="network-pagination">{page > 1 ? <Link href={`/notificaciones?page=${page-1}`}>← Anterior</Link> : <span />}{rows.length > 24 && <Link href={`/notificaciones?page=${page+1}`}>Siguiente →</Link>}</div>
  </main></div>;
}
