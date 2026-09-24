import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import LocationRequestCard from "@/components/locations/LocationRequestCard";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import type { LocationContactRequest, LocationCreditWallet } from "@/lib/locations/requests";
import "@/components/networking/networking.css";

export const metadata = { title: "Solicitudes de Locaciones", robots: { index: false, follow: false } };

export default async function LocationRequestsPage({ searchParams }: { searchParams: Promise<{ box?: string; page?: string }> }) {
  if (!(await getViewer())) redirect("/login?next=%2Fcuenta%2Fcontactos%2Flocaciones");
  const params = await searchParams;
  const box = ["received", "sent", "accepted", "expired"].includes(params.box ?? "") ? params.box! : "received";
  const page = Math.max(1, Math.min(1000, Number(params.page) || 1));
  const db = await createClient();
  const [list, wallet] = await Promise.all([
    db.rpc("list_my_location_contact_requests", { p_box: box, p_page: page }),
    db.rpc("get_my_location_credit_wallet"),
  ]);
  const rows = (list.data ?? []) as LocationContactRequest[];
  const w = wallet.data as LocationCreditWallet | null;
  return <div className="editorial-page"><SiteHeader contextLink={{ href: "/cuenta/contactos", label: "← Solicitudes y contactos" }} /><main className="network-shell">
    <header className="network-heading"><p className="eyebrow">LOCACIONES</p><h1>Solicitudes de Locaciones</h1><p>Consulta solicitudes, crédito reservado y contactos aceptados sin mezclar este saldo con Profiles.</p>
      {w && <div className="network-credit-metrics">{w.eligible ? <><StatusBadge tone="success">{w.available_credits} disponibles</StatusBadge><StatusBadge tone="warning">{w.reserved_credits} reservados</StatusBadge><StatusBadge>{w.consumed_credits} consumidos</StatusBadge></> : <StatusBadge tone="warning">Política de tu plan pendiente</StatusBadge>}</div>}
    </header>
    <nav className="network-tabs" aria-label="Tipo de solicitudes"><Link href="/cuenta/contactos">Profesionales</Link><Link href="/cuenta/contactos/locaciones" aria-current="page">Locaciones</Link></nav>
    <nav className="network-tabs" aria-label="Bandejas de Locaciones">{[["received","Recibidas"],["sent","Enviadas"],["accepted","Aceptadas"],["expired","Vencidas"]].map(([value,label]) => <Link key={value} href={`/cuenta/contactos/locaciones?box=${value}`} aria-current={box === value ? "page" : undefined}>{label}</Link>)}</nav>
    {list.error ? <p role="alert">No pudimos cargar tus solicitudes de Locaciones.</p> : rows.length ? <div className="network-list">{rows.slice(0,24).map((item) => <LocationRequestCard key={item.id} item={item} />)}</div> : <div className="network-empty"><h2>No hay solicitudes en esta bandeja.</h2><p>Las nuevas solicitudes y sus cambios de estado aparecerán aquí.</p></div>}
    <div className="network-pagination">{page > 1 ? <Link href={`/cuenta/contactos/locaciones?box=${box}&page=${page - 1}`}>← Anterior</Link> : <span />}{rows.length > 24 && <Link href={`/cuenta/contactos/locaciones?box=${box}&page=${page + 1}`}>Siguiente →</Link>}</div>
  </main></div>;
}
