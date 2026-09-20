"use client";

import { useActionState, useEffect } from "react";
import {
  manageProfileContact, markProfileContactRead, respondProfileContact,
} from "@/app/cuenta/contactos/actions";

export function ContactReadMarker({ id, unread }: { id: string; unread: boolean }) {
  useEffect(() => { if (unread) void markProfileContactRead(id); }, [id, unread]);
  return null;
}

export function ContactReplyForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(respondProfileContact, { error: "" });
  return <form action={action} className="contact-reply-form">
    <input type="hidden" name="id" value={id} />
    <label>Tu respuesta
      <textarea name="message" required minLength={20} maxLength={3000} rows={6}
        placeholder="Responde una vez con el contexto necesario para continuar." />
    </label>
    <p>Respuesta interna simple. No comparte automáticamente tu email ni teléfono.</p>
    {state.error && <p role="alert" className="contact-error">{state.error}</p>}
    <button className="editorial-primary" disabled={pending}>{pending ? "Enviando…" : "Enviar respuesta"}</button>
  </form>;
}

export function ContactManageForms({ id, reported }: { id: string; reported: boolean }) {
  const [archiveState, archiveAction, archiving] = useActionState(manageProfileContact, { error: "" });
  const [reportState, reportAction, reporting] = useActionState(manageProfileContact, { error: "" });
  return <div className="contact-manage">
    <form action={archiveAction}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="action" value="archive" />
      <button className="editorial-secondary" disabled={archiving}>{archiving ? "Archivando…" : "Archivar"}</button>
      {archiveState.error && <p role="alert" className="contact-error">{archiveState.error}</p>}
    </form>
    {!reported && <details>
      <summary>Reportar consulta</summary>
      <form action={reportAction}>
        <input type="hidden" name="id" value={id} /><input type="hidden" name="action" value="report" />
        <label>Motivo<textarea name="reason" required minLength={3} maxLength={500} rows={4} /></label>
        {reportState.error && <p role="alert" className="contact-error">{reportState.error}</p>}
        <button className="editorial-secondary" disabled={reporting}>{reporting ? "Reportando…" : "Enviar reporte"}</button>
      </form>
    </details>}
  </div>;
}
