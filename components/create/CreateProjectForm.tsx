"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "@/app/create/actions";

export default function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const result = await createProjectAction(name, crypto.randomUUID());
    if (!result.ok) { setError(result.message); setBusy(false); return; }
    router.push(`/create/projects/${result.id}`);
  }
  return <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
    <label className="grid gap-2 text-sm">Nombre del proyecto
      <input className="min-h-11 rounded-md border border-white/30 bg-neutral-900 px-3 text-white" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
    </label>
    <button className="min-h-11 rounded-md border border-white/30 px-4 text-sm font-semibold" disabled={busy}>{busy ? "Creando…" : "Crear Project y Writer"}</button>
    {error && <p className="w-full text-sm text-red-300" role="alert">{error}</p>}
  </form>;
}
