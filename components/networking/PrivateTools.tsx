import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Summary } from "@/lib/networking/types";
import "./networking.css";
export default async function PrivateTools() {
  const db = await createClient(); const { data, error } = await db.rpc("get_my_network_summary"); const s = data as Summary | null;
  return <section className="network-private-tools"><h2>HERRAMIENTAS PRIVADAS</h2>
    {error || !s ? <p role="alert">No pudimos cargar tu actividad privada. Actualiza la página.</p> : <><article className="network-card"><h3 className="network-credit-note"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="M2 3h16v11H7l-5 4Z" /></svg>Solicitudes</h3><p>{s.pending_received === 1 ? "Tienes 1 solicitud pendiente" : s.pending_received ? `Tienes ${s.pending_received} solicitudes pendientes` : "No tienes solicitudes pendientes"}</p><Link href="/cuenta/contactos">Ver solicitudes →</Link></article>
    <article className="network-card"><h3>Tu red</h3><p>{s.followers} seguidores · {s.following} siguiendo</p><Link href="/mi-red">Ver red →</Link></article></>}
  </section>;
}
