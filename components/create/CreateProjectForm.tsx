"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "@/app/create/actions";

export default function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef<string | null>(null);
  const submitting = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null);
    operationId.current ??= crypto.randomUUID();
    try {
      const result = await createProjectAction(name, operationId.current);
      if (!result.ok) { setError(result.message); return; }
      router.push(`/writer/${result.writerId}?project=${result.id}`);
    } catch {
      setError("No pudimos confirmar la creación. Reintenta sin cambiar el nombre; no duplicaremos el proyecto.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
    <label className="grid gap-2 text-sm">Nombre del proyecto
      <input className="min-h-11 rounded-md border border-white/30 bg-neutral-900 px-3 text-white" value={name} onChange={(event) => { setName(event.target.value); operationId.current = null; }} maxLength={160} required />
    </label>
    <button className="min-h-11 rounded-md border border-white/30 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50" disabled={busy}>{busy ? "Creando proyecto y guion…" : "Crear proyecto y comenzar en Writer"}</button>
    {error && <p className="w-full text-sm text-red-300" role="alert">{error}</p>}
  </form>;
}
