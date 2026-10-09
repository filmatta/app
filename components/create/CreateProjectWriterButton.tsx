"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createWriterInProjectAction } from "@/app/create/actions";

export default function CreateProjectWriterButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const operationId = useRef<string | null>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create(openImport: boolean) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null);
    operationId.current ??= crypto.randomUUID();
    try {
      const result = await createWriterInProjectAction(projectId, operationId.current);
      if (!result.ok) { setError(result.message); return; }
      router.push(`/writer/${result.writerId}?project=${projectId}${openImport ? "&import=1" : ""}`);
    } catch {
      setError("No pudimos confirmar la creación. Reintenta para abrir el mismo guion.");
    } finally { submitting.current = false; setBusy(false); }
  }
  return <div className="create-source-action">
    <button type="button" onClick={() => void create(false)} disabled={busy}>{busy ? "Creando…" : "Crear guion"}</button>
    <button type="button" onClick={() => void create(true)} disabled={busy}>Importar guion</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
