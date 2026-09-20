"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { sendProfileContact } from "@/app/cuenta/contactos/actions";
import { CONTACT_TYPES } from "@/lib/contacts/types";

export default function ProfileContactDialog({ slug, name, compact = false }: { slug: string; name: string; compact?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const labelId = useId();
  const [state, action, pending] = useActionState(sendProfileContact, { error: "" });
  const [length, setLength] = useState(0);
  useEffect(() => () => { document.body.style.overflow = ""; }, []);
  const close = () => { dialog.current?.close(); document.body.style.overflow = ""; };
  return <>
    <button type="button" className="p2-contact-button" onClick={() => {
      dialog.current?.showModal(); document.body.style.overflow = "hidden";
    }}>{compact ? "Contactar ↗" : "Enviar consulta"}</button>
    <dialog ref={dialog} className="profile-contact-dialog" aria-labelledby={labelId}
      onClose={() => { document.body.style.overflow = ""; }} onClick={event => {
        if (event.target === event.currentTarget) close();
      }}>
      <form action={action} className="profile-contact-panel">
        <header>
          <div><p className="eyebrow">FILMATTA / CONTACTO</p><h2 id={labelId}>Contactar a {name}</h2></div>
          <button type="button" className="profile-contact-close" onClick={close} aria-label="Cerrar">×</button>
        </header>
        <input type="hidden" name="slug" value={slug} />
        <label>Motivo
          <select name="contact_type" defaultValue="professional_interest">
            {CONTACT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Mensaje
          <textarea name="message" minLength={20} maxLength={3000} rows={7} required
            placeholder="Cuéntale brevemente por qué quieres contactar y el contexto de tu proyecto."
            onChange={event => setLength(event.target.value.length)} />
        </label>
        <div className="profile-contact-count"><span>Mínimo 20 caracteres</span><span>{length} / 3000</span></div>
        <p className="profile-contact-note">Envía una consulta inicial. Tus datos privados no se comparten automáticamente.</p>
        {state.error && <p role="alert" className="profile-contact-error">{state.error}</p>}
        <button type="submit" className="p2-contact-button" disabled={pending}>{pending ? "Enviando…" : "Enviar consulta"}</button>
      </form>
    </dialog>
  </>;
}
