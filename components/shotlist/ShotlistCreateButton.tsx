"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function ShotlistCreateButton({ projectId }: { projectId?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    if (busy || !projectId) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/shotlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, title: "Shotlist sin título", operationId: crypto.randomUUID() }) });
      const data = await response.json();
      if (!response.ok || typeof data.id !== "string") throw new Error(data.error ?? "No pudimos crearla.");
      router.push(`/shotlists/${data.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos crearla."); setBusy(false); }
  }
  if (!projectId) return <div className="shotlist-create"><Link href="/create">Elegir proyecto para Shotlist</Link></div>;
  return <div className="shotlist-create"><button type="button" onClick={create} disabled={busy}>＋ Nueva shotlist</button>{error && <span role="alert">{error}</span>}</div>;
}
