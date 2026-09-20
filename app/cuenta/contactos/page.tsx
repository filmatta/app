import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { contactTypeLabel, type ProfileContact } from "@/lib/contacts/types";
import "./contactos.css";

export const metadata = { title: "Contactos" };
type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function ContactsPage({ searchParams }: { searchParams: Params }) {
  if (!(await getViewer())) redirect("/login?next=%2Fcuenta%2Fcontactos");
  const query = await searchParams;
  const box = query.box === "sent" ? "sent" : "received";
  const page = Math.max(1, Math.min(1000, Number(query.page) || 1));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_profile_contacts", { p_box: box, p_page: page });
  const rows = (data ?? []) as ProfileContact[];
  return <div className="editorial-page contacts-page">
    <SiteHeader contextLink={{ href: "/cuenta", label: "← Mi cuenta" }} />
    <main className="editorial-container">
      <header className="contacts-heading">
        <p className="eyebrow">TU ESPACIO / CONTACTO</p>
        <h1>Contactos</h1>
        <p>Consultas profesionales privadas vinculadas a Profiles y Talent. FILMATTA no comparte automáticamente email, teléfono ni WhatsApp.</p>
      </header>
      <nav className="contacts-tabs" aria-label="Bandejas de contacto">
        <Link href="/cuenta/contactos" aria-current={box === "received" ? "page" : undefined}>Recibidos</Link>
        <Link href="/cuenta/contactos?box=sent" aria-current={box === "sent" ? "page" : undefined}>Enviados</Link>
      </nav>
      {error ? <p role="alert" className="contacts-empty">No pudimos cargar tus contactos.</p> : rows.length ?
        <div className="contacts-list">{rows.slice(0,24).map(item => <Link key={item.id} href={`/cuenta/contactos/${item.id}`} className="contact-row">
          <div><h2>{item.counterpart_name}</h2><p className="contact-meta">{contactTypeLabel(item.contact_type)} · {item.source_type === "talent" ? "Talento" : "Perfil"}</p></div>
          <p className="contact-preview">{item.message.length > 180 ? item.message.slice(0,177) + "…" : item.message}</p>
          <span className="contact-status" data-unread={item.is_recipient && !item.read_at}>{item.is_recipient && !item.read_at ? "Nueva" : item.response_message ? "Respondida" : item.status === "reported" ? "Reportada" : "Enviada"}</span>
        </Link>)}</div> : <p className="contacts-empty">{box === "received" ? "Todavía no recibes consultas." : "Todavía no envías consultas."}</p>}
      <div className="flex justify-between py-8 text-sm">
        {page > 1 ? <Link href={`/cuenta/contactos?box=${box}&page=${page-1}`}>← Anterior</Link> : <span />}
        {rows.length > 24 && <Link href={`/cuenta/contactos?box=${box}&page=${page+1}`}>Siguiente →</Link>}
      </div>
    </main>
  </div>;
}
