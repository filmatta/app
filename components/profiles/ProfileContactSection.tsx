import Link from "next/link";
import type { ContactAccess } from "@/lib/profiles/social";
import ProfileContactDialog from "./ProfileContactDialog";
export default function ProfileContactSection({ slug, name, closed, owner, preview, signedIn, access }: { slug: string; name: string; closed: boolean; owner: boolean; preview: boolean; signedIn: boolean; access?: ContactAccess | null }) {
  return <section className="p2-foundation-box p2-contact-section" id="contact"><h2>Contacto</h2>
    {closed ? <p>No recibe solicitudes por ahora.</p> : owner || preview ? <p>Recibe consultas profesionales en FILMATTA. Tus datos privados no se comparten automáticamente.</p> : !signedIn ? <><Link className="p2-contact-button" href={`/login?next=${encodeURIComponent(`/perfiles/${slug}#contact`)}`}>Contactar</Link><p>Inicia sesión para enviar una consulta y consultar tus contactos disponibles.</p></> : !access ? <p role="status">No pudimos consultar tus contactos disponibles. Actualiza la página para intentarlo de nuevo.</p> : <>
      {access.thread_id ? <Link className="p2-contact-button" href={`/cuenta/contactos/${access.thread_id}`}>Ver contacto</Link> : access.is_pro || access.already_contacted || access.remaining_contacts > 0 ? <ProfileContactDialog slug={slug} name={name} /> : <Link className="p2-contact-button" href="/planes">Ver plan Pro</Link>}
      <p>{access.is_pro ? "Pro · Contactos sin límite de créditos." : `Te quedan ${access.remaining_contacts} de ${access.free_contact_limit} contactos gratuitos.`}</p>
      <p>{access.already_contacted ? "Ya contactaste a este perfil. No volverás a gastar un crédito." : "Un crédito inicia el contacto con un perfil distinto; continuar no gasta otro."}</p>
      {!access.is_pro && <Link className="p2-pro-link" href="/planes">Con Pro, contacta sin límite de créditos ↗</Link>}
      <small>Se mantienen los límites de envío y las medidas contra el abuso. Los datos privados no se revelan al contactar.</small>
    </>}
  </section>;
}
