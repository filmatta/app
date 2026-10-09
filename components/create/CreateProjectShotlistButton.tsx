"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createShotlistInProjectAction } from "@/app/create/actions";

export default function CreateProjectShotlistButton({ projectId, writers }: {
  projectId: string;
  writers: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [scriptId, setScriptId] = useState(writers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ scriptId: string; id: string } | null>(null);
  const submitting = useRef(false);

  async function create() {
    if (submitting.current || !scriptId) return;
    submitting.current = true; setBusy(true); setError(null);
    if (operation.current?.scriptId !== scriptId) operation.current = { scriptId, id: crypto.randomUUID() };
    try {
      const result = await createShotlistInProjectAction(projectId, scriptId, operation.current.id);
      if (!result.ok) { setError(result.message); return; }
      router.push(`/shotlists/${result.shotlistId}?project=${projectId}`);
    } catch {
      setError("No pudimos confirmar la creación. Reintenta sin cambiar el guion.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return <div className="create-source-action">
    {writers.length > 1 && <label>Guion fuente<select value={scriptId} onChange={(event) => { setScriptId(event.target.value); setError(null); }}>
      {writers.map((writer) => <option key={writer.id} value={writer.id}>{writer.title}</option>)}
    </select></label>}
    <button type="button" onClick={() => void create()} disabled={busy || !scriptId}>{busy ? "Creando…" : "Crear Shotlist desde guion"}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
