"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createWriterInProjectAction } from "@/app/create/actions";

export default function CreateProjectWriterButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const operationId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    if (busy) return;
    setBusy(true); setError(null);
    operationId.current ??= crypto.randomUUID();
    const result = await createWriterInProjectAction(projectId, operationId.current);
    if (!result.ok) { setError(result.message); setBusy(false); return; }
    router.push(`/writer/${result.writerId}?project=${projectId}`);
  }
  return <div className="mt-4"><button type="button" className="rounded-md border border-white/30 px-4 py-3 text-sm" onClick={() => void create()} disabled={busy}>{busy ? "Creando…" : "Crear Writer en este proyecto"}</button>
    {error && <p className="mt-2 text-sm text-red-300" role="alert">{error}</p>}
  </div>;
}
