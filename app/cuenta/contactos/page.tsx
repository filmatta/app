import StatusBadge from "@/components/ui/StatusBadge";
import CreditIcon from "@/components/ui/CreditIcon";
import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ContactRequestCard from "@/components/networking/ContactRequestCard";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import type { ContactRequest } from "@/lib/networking/types";
import type { ProfileContact } from "@/lib/contacts/types";
import "@/components/networking/networking.css";
export const metadata = { title: "Solicitudes y contactos", robots: { index: false, follow: false } };
export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ box?: string; page?: string; history?: string }> }) {
  if (!(await getViewer())) redirect("/login?next=%2Fcuenta%2Fcontactos");
  const q = await searchParams, box = ["sent","expired","accepted","accepted_requests","legacy"].includes(q.box ?? "") ? q.box! : "received", page = Math.max(1,Math.min(1000,Number(q.page)||1));
  const db = await createClient();
  const history = q.history === "sent" ? "sent" : "received";
  const [list,wallet] = await Promise.all([box === "legacy" ? db.rpc("list_my_legacy_profile_contacts", { p_box: history, p_page: page }) : db.rpc("list_my_contact_requests", { p_box: box === "accepted_requests" ? "accepted" : box, p_page: page }),db.rpc("get_my_contact_wallet")]);
  const rows = (list.data ?? []) as ContactRequest[], w = wallet.data;
  return <div className="editorial-page"><SiteHeader /><main className="network-shell"><header className="network-heading"><p className="eyebrow">TU ESPACIO PRIVADO</p><h1>{box === "accepted" ? "Contactos" : "Solicitudes"}</h1><p className="network-credit-note"><CreditIcon />Los créditos se gastan cuando este perfil acepta tu solicitud.</p>
    {w && <div className="network-credit-metrics">{w.is_pro ? <><StatusBadge tone="pro">PRO</StatusBadge><span>Sin límite de créditos. Se mantienen límites de envío.</span></> : <><StatusBadge tone="success">{w.remaining_contacts} {w.remaining_contacts === 1 ? "disponible" : "disponibles"}</StatusBadge><StatusBadge tone="warning">{w.reserved_contacts} {w.reserved_contacts === 1 ? "reservado" : "reservados"}</StatusBadge><StatusBadge>{w.consumed_contacts} {w.consumed_contacts === 1 ? "consumido" : "consumidos"}</StatusBadge></>}</div>}</header>
    <nav className="network-tabs" aria-label="Contactos"><Link href="/cuenta/contactos" aria-current={box !== "accepted" ? "page" : undefined}>Solicitudes</Link><Link href="/cuenta/contactos?box=accepted" aria-current={box === "accepted" ? "page" : undefined}>Contactos</Link></nav>
    {box !== "accepted" && <nav className="network-tabs" aria-label="Bandejas de solicitudes">{[["received","Recibidas"],["sent","Enviadas"],["accepted_requests","Aceptadas"],["expired","Vencidas"]].map(([v,l]) => <Link key={v} href={"/cuenta/contactos?box="+v} aria-current={box === v ? "page" : undefined}>{l}</Link>)}</nav>}
    {box !== "accepted" && <p className="network-history-link"><Link href="/cuenta/contactos?box=legacy">Ver historial</Link></p>}
    {box === "legacy" && <nav className="network-tabs" aria-label="Historial anterior"><Link href="/cuenta/contactos?box=legacy" aria-current={history === "received" ? "page" : undefined}>Consultas recibidas</Link><Link href="/cuenta/contactos?box=legacy&history=sent" aria-current={history === "sent" ? "page" : undefined}>Consultas enviadas</Link></nav>}
    {list.error ? <p role="alert">No pudimos cargar tus solicitudes.</p> : box === "legacy" ? <div className="network-list">{((list.data ?? []) as ProfileContact[]).slice(0,24).map(r => <Link key={r.id} className="network-card" href={"/cuenta/contactos/"+r.id}><h2>{r.counterpart_name}</h2><p>{r.message}</p></Link>)}{!rows.length && <p className="network-empty">No hay consultas anteriores.</p>}</div> : rows.length ? <div className="network-list">{rows.slice(0,24).map(r => <ContactRequestCard key={r.id} item={r} contactPage={page} view={box === "accepted" ? "contact" : "request"} />)}</div> : <div className="network-empty"><h2>{box === "accepted" ? "Aún no tienes contactos abiertos." : box === "accepted_requests" ? "Aún no tienes solicitudes aceptadas." : box === "expired" ? "No tienes solicitudes vencidas." : box === "sent" ? "Aún no has enviado solicitudes." : "No tienes solicitudes pendientes."}</h2><p>{box === "accepted_requests" || box === "accepted" ? "Cuando alguien acepte una solicitud, podrás encontrarla aquí y en Contactos." : box === "received" ? "Cuando alguien quiera contactarte, aparecerá aquí." : "Aquí podrás consultar el estado y el contexto de tus solicitudes."}</p></div>}
    <div className="network-pagination">{page > 1 ? <Link href={"/cuenta/contactos?box="+box+"&history="+history+"&page="+(page-1)}>← Anterior</Link> : <span />}{rows.length > 24 && <Link href={"/cuenta/contactos?box="+box+"&history="+history+"&page="+(page+1)}>Siguiente →</Link>}</div>
  </main></div>;
}
