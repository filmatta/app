"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileAvatar from "@/components/profiles/ProfileAvatar";
import StatusBadge from "@/components/ui/StatusBadge";
import { transitionLocationRequest } from "@/app/cuenta/contactos/locaciones/actions";
import { LOCATION_REQUEST_STATES, type LocationContactRequest } from "@/lib/locations/requests";

export default function LocationRequestCard({ item, detail = false }: { item: LocationContactRequest; detail?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { const tick = () => setNow(Date.now()); tick(); const timer = setInterval(tick, 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (item.state !== "pending") return; const timer = setInterval(() => document.visibilityState === "visible" && router.refresh(), 60_000); return () => clearInterval(timer); }, [item.state, router]);
  const hours = now === null ? null : Math.max(0, Math.ceil((Date.parse(item.expires_at) - now) / 3_600_000));
  async function act(action: "accept" | "reject" | "cancel") {
    setBusy(true); setError("");
    const result = await transitionLocationRequest(item.id, action).catch(() => ({ error: "No pudimos guardar. Inténtalo de nuevo." }));
    if ("error" in result && result.error) setError(result.error); else router.refresh();
    setBusy(false);
  }
  return <article className={`network-card ${item.state === "accepted" ? "network-card--contact" : ""}`}>
    <header><div className="network-avatar">{item.portrait_media_id || item.portrait_url ? <ProfileAvatar id={item.portrait_media_id} fallbackUrl={item.portrait_url} name={item.counterpart_name} /> : <span aria-hidden="true">{item.counterpart_name[0]}</span>}</div><div><h2>{item.counterpart_slug ? <Link href={`/perfiles/${item.counterpart_slug}`}>{item.counterpart_name}</Link> : item.counterpart_name}</h2><p className="network-muted">Solicitud de Locaciones</p></div></header>
    <div className="network-request-state"><StatusBadge tone={item.state === "pending" ? "warning" : item.state === "accepted" ? "success" : item.state === "rejected" ? "danger" : "neutral"}>{LOCATION_REQUEST_STATES[item.state]}</StatusBadge><span>{item.is_recipient ? "Recibida" : "Enviada"}</span>{item.state === "pending" && hours !== null && <span>{hours ? `Vence en ${hours} h` : "Venciendo"}</span>}<time dateTime={item.accepted_at ?? item.created_at}>{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" }).format(new Date(item.accepted_at ?? item.created_at))}</time></div>
    <section className="network-snapshot"><StatusBadge tone="info">Locación</StatusBadge><h3>{item.location_title}</h3><p className="network-muted">/locaciones/{item.location_slug}</p></section>
    <p>{item.message}</p>
    {!item.is_recipient && item.state === "pending" && <p className="network-muted">1 crédito de Locaciones reservado. Se consume sólo si acepta.</p>}
    {item.is_recipient && item.state === "pending" && <p className="network-muted">Aceptar comparte tus datos de contacto. No confirma una reserva ni acuerda fechas o contratación.</p>}
    {item.state === "pending" && <div className="network-actions">{item.is_recipient ? <><button disabled={busy} onClick={() => void act("accept")}>Aceptar</button><button disabled={busy} onClick={() => void act("reject")}>Rechazar</button></> : <button disabled={busy} onClick={() => void act("cancel")}>Cancelar solicitud</button>}</div>}
    {item.state === "accepted" && <section className="network-channels"><h3>Contacto compartido</h3><p>Datos guardados al momento de aceptar esta solicitud.</p><ul>{Object.entries(item.shared_contact_snapshot ?? {}).map(([channel, value]) => {
      if (!value) return null;
      const href = channel === "instagram" ? `https://www.instagram.com/${encodeURIComponent(value)}/` : channel === "whatsapp" ? `https://wa.me/${value.replace(/\D/g, "")}` : channel === "email" ? `mailto:${encodeURIComponent(value)}` : `tel:${value}`;
      const label = ({ instagram: "Instagram", whatsapp: "WhatsApp", email: "Email", phone: "Teléfono" } as Record<string, string>)[channel] ?? channel;
      return <li key={channel}><strong>{label}</strong><a href={href} target={channel === "instagram" || channel === "whatsapp" ? "_blank" : undefined} rel="noreferrer">{channel === "instagram" ? "@" : ""}{value}</a><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(channel); } catch { setError("No se pudo copiar. Puedes seleccionar el dato manualmente."); } }}>{copied === channel ? "Copiado" : "Copiar"}</button></li>;
    })}</ul></section>}
    {error && <p role="alert">{error}</p>}
    {!detail && <Link className="network-link-button" href={`/cuenta/contactos/locaciones/${item.id}`}>{item.state === "accepted" ? "Ver contacto" : "Ver solicitud"} →</Link>}
  </article>;
}
