"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createWriterInProjectAction, saveCreateOnboardingAction } from "@/app/create/actions";

export default function CreateProjectWriterButton({ projectId, guidedIntent = null }: { projectId: string; guidedIntent?: "new_script" | "existing_script" | null }) {
  const router = useRouter();
  const operationId = useRef<string | null>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null);
    operationId.current ??= crypto.randomUUID();
    try {
      const result = await createWriterInProjectAction(projectId, operationId.current);
      if (!result.ok) { setError(result.message); return; }
      if (guidedIntent) await saveCreateOnboardingAction({ status: "writer_opened", intention: guidedIntent, currentStep: guidedIntent === "existing_script" ? "writer_import" : "writer_intro", projectId, writerId: result.writerId });
      router.push(`/writer/${result.writerId}?project=${projectId}${guidedIntent ? `&onboarding=${guidedIntent}` : ""}`);
    } catch {
      setError("No pudimos confirmar la creación. Reintenta para abrir el mismo guion.");
    } finally { submitting.current = false; setBusy(false); }
  }
  return <div className="create-source-action">
    <button type="button" onClick={() => void create()} disabled={busy}>{busy ? "Creando…" : "Crear guion"}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
