"use client";

import { useFormStatus } from "react-dom";

export default function LocationSectionSubmit({ label = "Guardar sección" }: { label?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/85 disabled:cursor-wait disabled:opacity-55">
    {pending ? "Guardando…" : label}
  </button>;
}
