"use client";
import { useActionState, useState } from "react";
import { sendServiceInquiry, updateInquiry } from "@/app/mis-servicios/actions";
export default function InquiryForm({
  slug,
  sendAction = sendServiceInquiry,
}: {
  slug: string;
  sendAction?: typeof sendServiceInquiry;
}) {
  const [state, action, pending] = useActionState(sendAction, { error: "" });
  const [message, setMessage] = useState("");
  return (
    <form action={action} className="mt-6 max-w-2xl">
      <input type="hidden" name="slug" value={slug} />
      <label className="block">
        Tu consulta
        <textarea
          name="message"
          minLength={20}
          maxLength={3000}
          required
          rows={5}
          className="catalog-input mt-3"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      <p className="mt-3 text-sm leading-6 text-white/65">
        La consulta y tu perfil público llegarán al responsable. Sólo los
        participantes y administración pueden leerla. Una consulta por ficha;
        máximo 10 cada 24 horas. No se envían correos ni se formaliza una
        contratación.
      </p>
      {state.error && (
        <p role="alert" className="mt-4 text-red-200">
          {state.error}
        </p>
      )}
      <button
        className="editorial-primary mt-5 disabled:opacity-50"
        disabled={pending}
      >
        {pending ? "Enviando…" : "Enviar consulta privada"}
      </button>
    </form>
  );
}
export function InquiryResponse({ id }: { id: string }) {
  const [state, action, pending] = useActionState(updateInquiry, { error: "" });
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-5">
        {[
          { value: "accepted", label: "Aceptar interés" },
          { value: "declined", label: "Declinar" },
          { value: "archived", label: "Archivar" },
        ].map((s) => (
          <button
            key={s.value}
            className="editorial-secondary disabled:opacity-50"
            name="status"
            value={s.value}
            disabled={pending}
          >
            {s.label}
          </button>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="mt-3 text-red-200">
          {state.error}
        </p>
      )}
    </form>
  );
}
