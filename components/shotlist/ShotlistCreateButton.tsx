"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";

export default function ShotlistCreateButton({ projectId }: { projectId?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const operationId = useRef<string | null>(null);
  async function create() {
    if (submitting.current || !projectId) return;
    submitting.current = true;
    setBusy(true); setError(null);
    operationId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/shotlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, title: "Shotlist sin título", operationId: operationId.current }) });
      const data = await response.json();
      if (!response.ok || typeof data.id !== "string") throw new Error("No pudimos crear la Shotlist. Reintenta para recuperar la misma solicitud.");
      router.push(`/shotlists/${data.id}?project=${projectId}`);
    } catch { setError("No pudimos confirmar la creación. Reintenta para abrir la misma Shotlist."); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (!projectId) return <div className="shotlist-create"><Link href="/create">Elegir proyecto para Shotlist</Link></div>;
  return <div className="shotlist-create"><button type="button" onClick={create} disabled={busy}>{busy ? "Creando Shotlist…" : "＋ Nueva shotlist"}</button>{error && <span role="alert">{error}</span>}</div>;
}
