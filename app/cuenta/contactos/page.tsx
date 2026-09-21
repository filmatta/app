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
export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ box?: string; page?: string }> }) {
  if (!(await getViewer())) redirect("/login?next=%2Fcuenta%2Fcontactos");
  const q = await searchParams, box = ["sent","expired","accepted","legacy"].includes(q.box ?? "") ? q.box! : "received", page = Math.max(1,Math.min(1000,Number(q.page)||1));
  const db = await createClient();
  const [list,wallet] = await Promise.all([box === "legacy" ? db.rpc("list_my_profile_contacts", { p_box: "received", p_page: page }) : db.rpc("list_my_contact_requests", { p_box: box, p_page: page }),db.rpc("get_my_contact_wallet")]);
  const rows = (list.data ?? []) as ContactRequest[], w = wallet.data;
  return <div className="editorial-page"><SiteHeader /><main className="network-shell"><header className="network-heading"><p className="eyebrow">TU ESPACIO PRIVADO</p><h1>{box === "accepted" ? "Contactos" : "Solicitudes"}</h1><p>Los créditos se gastan cuando este perfil acepta tu solicitud.</p>
    {w && <p>{w.is_pro ? "Pro · Sin límite de créditos. Se mantienen límites de envío." : w.remaining_contacts + " disponibles · " + w.reserved_contacts + " reservados · " + w.consumed_contacts + " consumidos"}</p>}</header>
    <nav className="network-tabs" aria-label="Contactos"><Link href="/cuenta/contactos" aria-current={box !== "accepted" ? "page" : undefined}>Solicitudes</Link><Link href="/cuenta/contactos?box=accepted" aria-current={box === "accepted" ? "page" : undefined}>Contactos</Link></nav>
    {box !== "accepted" && <nav className="network-tabs" aria-label="Bandejas de solicitudes">{[["received","Recibidas"],["sent","Enviadas"],["expired","Vencidas"],["legacy","Historial anterior"]].map(([v,l]) => <Link key={v} href={"/cuenta/contactos?box="+v} aria-current={box === v ? "page" : undefined}>{l}</Link>)}</nav>}
    {list.error ? <p role="alert">No pudimos cargar tus solicitudes.</p> : box === "legacy" ? <div className="network-list">{((list.data ?? []) as ProfileContact[]).slice(0,24).map(r => <Link key={r.id} className="network-card" href={"/cuenta/contactos/"+r.id}><h2>{r.counterpart_name}</h2><p>{r.message}</p></Link>)}{!rows.length && <p className="network-empty">No hay consultas anteriores.</p>}</div> : rows.length ? <div className="network-list">{rows.slice(0,24).map(r => <ContactRequestCard key={r.id} item={r} />)}</div> : <p className="network-empty">{box === "accepted" ? "Tus solicitudes aceptadas aparecerán aquí." : box === "expired" ? "No tienes solicitudes vencidas." : box === "sent" ? "Aún no has enviado solicitudes." : "No tienes solicitudes pendientes."}</p>}
    <div className="network-pagination">{page > 1 ? <Link href={"/cuenta/contactos?box="+box+"&page="+(page-1)}>← Anterior</Link> : <span />}{rows.length > 24 && <Link href={"/cuenta/contactos?box="+box+"&page="+(page+1)}>Siguiente →</Link>}</div>
  </main></div>;
}
