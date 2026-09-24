"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { sendLocationContactRequest, type LocationContactActionState } from "@/app/locaciones/contact-actions";
import styles from "./locations.module.css";

export type LocationContactAccess = {
  eligible: boolean;
  available_credits: number;
  reserved_credits: number;
  consumed_credits: number;
  policy_pending: boolean;
  contact_available: boolean;
  is_owner: boolean;
  thread_id: string | null;
  thread_state: "pending" | "accepted" | null;
};

const initialState: LocationContactActionState = { error: "" };

export default function LocationContactPanel({ slug, signedIn, contactAvailable, access }: { slug: string; signedIn: boolean; contactAvailable: boolean; access: LocationContactAccess | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [state, action, pending] = useActionState(sendLocationContactRequest, initialState);
  if (!contactAvailable) return <p className={styles.asideNote}>El responsable aún no configuró un canal para solicitudes.</p>;
  if (!signedIn) return <Link className={styles.contactButton} href={`/acceso?next=${encodeURIComponent(`/locaciones/${slug}#contacto`)}`}>Contactar por esta locación</Link>;
  if (!access) return <p className={styles.asideNote}>No pudimos consultar tu saldo de Locaciones.</p>;
  if (access.is_owner) return <p className={styles.asideNote}>Esta locación pertenece a tu cuenta.</p>;
  if (access.thread_id) return <Link className={styles.contactButton} href={`/cuenta/contactos/locaciones/${access.thread_id}`}>{access.thread_state === "accepted" ? "Ver contacto" : "Ver solicitud pendiente"}</Link>;
  if (!access.eligible) return <p className={styles.asideNote}>La política de créditos de Locaciones para tu plan está pendiente.</p>;
  if (access.available_credits < 1) return <Link className={styles.contactButton} href="/cuenta/contactos/locaciones?box=sent">Revisar mis solicitudes</Link>;
  return <>
    <button type="button" className={styles.contactButton} onClick={() => { setIdempotencyKey(crypto.randomUUID()); dialog.current?.showModal(); }}>Contactar por esta locación</button>
    <dialog ref={dialog} className={styles.contactDialog} onCancel={() => dialog.current?.close()}>
      {state.requestId ? <div className={styles.contactDialogBody}><h2>Solicitud enviada</h2><p>Tu crédito quedó reservado. Sólo se consumirá si el responsable acepta.</p><Link className={styles.contactButton} href={`/cuenta/contactos/locaciones/${state.requestId}`}>Ver solicitud</Link><button type="button" className={styles.contactCancel} onClick={() => dialog.current?.close()}>Cerrar</button></div>
        : <form action={action} className={styles.contactDialogBody}>
          <h2>Contactar por esta locación</h2>
          <p>Se reservará 1 crédito de Locaciones.<br />Sólo se gastará si el responsable acepta tu solicitud.<br />Si la rechaza o no responde en 48 horas, lo recuperarás.</p>
          <p className={styles.contactBalance}>Saldo disponible: <strong>{access.available_credits}</strong></p>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          <label>Mensaje breve<textarea name="message" minLength={20} maxLength={500} required rows={6} placeholder="Cuéntale qué producción estás preparando y qué necesitas confirmar." /></label>
          {state.error && <p role="alert" className={styles.photoError}>{state.error}</p>}
          <div className={styles.contactDialogActions}><button type="button" className={styles.contactCancel} onClick={() => dialog.current?.close()} disabled={pending}>Cancelar</button><button type="submit" className={styles.contactSubmit} disabled={pending}>{pending ? "Enviando…" : "Enviar solicitud"}</button></div>
        </form>}
    </dialog>
  </>;
}
