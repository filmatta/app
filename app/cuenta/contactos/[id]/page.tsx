import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ContactRequestCard from "@/components/networking/ContactRequestCard";
import type { ContactRequest } from "@/lib/networking/types";
import "@/components/networking/networking.css";
import { ContactManageForms, ContactReadMarker, ContactReplyForm } from "@/components/profiles/ContactInboxActions";
import { getViewer } from "@/lib/auth/get-viewer";
import { contactTypeLabel, type ProfileContact } from "@/lib/contacts/types";
import { validUuid } from "@/lib/contacts/validation";
import { createClient } from "@/lib/supabase/server";
import "../contactos.css";

export const metadata = { title: "Consulta privada" };

export default async function ContactDetail({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getViewer())) redirect("/login?next=%2Fcuenta%2Fcontactos");
  const { id } = await params;
  if (!validUuid(id)) notFound();
  const supabase = await createClient();
  const request = await supabase.rpc("get_my_contact_request", { p_id: id });
  if (request.error) throw new Error("No pudimos cargar la solicitud.");
  if (request.data) return <div className="editorial-page"><SiteHeader contextLink={{ href: "/cuenta/contactos", label: "← Solicitudes y contactos" }} /><main className="network-shell"><header className="network-heading"><h1>Solicitud profesional</h1></header><ContactRequestCard item={request.data as ContactRequest} detail /></main></div>;
  const { data, error } = await supabase.rpc("get_my_profile_contact", { p_id: id });
  const item = (Array.isArray(data) ? data[0] : data) as ProfileContact | undefined;
  if (error || !item) notFound();
  return <div className="editorial-page contacts-page">
    <SiteHeader contextLink={{ href: "/cuenta/contactos", label: "← Contactos" }} />
    <main className="editorial-container"><article className="contact-detail">
      <ContactReadMarker id={id} unread={item.is_recipient && !item.read_at} />
      <header className="contact-detail-header">
        <p className="eyebrow">{item.is_recipient ? "RECIBIDA" : "ENVIADA"} / {item.source_type === "talent" ? "TALENTO" : "PERFIL"}</p>
        <h1>{item.counterpart_name}</h1>
        <p className="contact-meta">{contactTypeLabel(item.contact_type)} · {formatDate(item.created_at)}</p>
        {item.counterpart_profile_slug && <Link className="editorial-secondary mt-5" href={`/perfiles/${item.counterpart_profile_slug}`}>Ver perfil ↗</Link>}
      </header>
      <section className="contact-message"><h2>Consulta inicial</h2><p>{item.message}</p></section>
      {item.response_message ? <section className="contact-message"><h2>Respuesta</h2><p>{item.response_message}</p><p className="contact-meta">{item.responded_at ? formatDate(item.responded_at) : ""}</p></section>
        : item.is_recipient && item.status !== "reported" ? <ContactReplyForm id={id} />
        : <p className="contacts-empty">{item.is_recipient ? "Esta consulta no admite respuesta." : "Aún no hay respuesta."}</p>}
      <ContactManageForms id={id} reported={Boolean(item.reported)} />
    </article></main>
  </div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(value));
}
