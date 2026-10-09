"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "@/app/create/actions";
import type { CreateEntryModule } from "@/lib/create/project";

const entryOptions: { id: CreateEntryModule; label: string; description: string; icon: string }[] = [
  { id: "writer", label: "Guion", description: "Escribe desde cero o trabaja sobre un guion existente.", icon: "▤" },
  { id: "shotlist", label: "Shotlist", description: "Planifica los planos a partir de un guion.", icon: "☷" },
  { id: "storyboard", label: "Storyboard", description: "Desarrolla visualmente las escenas de tu proyecto.", icon: "▧" },
  { id: "production", label: "Producción", description: "Organiza el rodaje, jornadas, recursos y documentos.", icon: "▦" },
];

export default function CreateProjectForm({ empty = false }: { empty?: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [entryModule, setEntryModule] = useState<CreateEntryModule | null>(null);
  const [step, setStep] = useState<"module" | "name">("module");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef<string | null>(null);
  const submitting = useRef(false);

  function open() {
    setStep("module"); setError(null);
    dialog.current?.showModal();
  }

  function close() { dialog.current?.close(); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !entryModule) return;
    submitting.current = true;
    setBusy(true); setError(null);
    operationId.current ??= crypto.randomUUID();
    try {
      const result = await createProjectAction(name, entryModule, operationId.current);
      if (!result.ok) { setError(result.message); return; }
      close();
      setName(""); setEntryModule(null); operationId.current = null;
      router.refresh();
    } catch {
      setError("No pudimos confirmar la creación. Reintenta sin cambiar los datos; no duplicaremos el proyecto.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return <>
    <button type="button" className={empty ? "create-empty-trigger" : "create-new-trigger"} onClick={open}>
      <span aria-hidden="true">＋</span>{empty ? "Crear proyecto" : "Crear proyecto"}
    </button>
    <dialog ref={dialog} className="create-project-dialog" onClose={() => { setError(null); setStep("module"); setName(""); setEntryModule(null); operationId.current = null; }}>
      <div className="create-dialog-heading">
        <div><p>FILMATTA CREATE</p><h2>{step === "module" ? "¿Qué tipo de proyecto quieres crear?" : "Ponle nombre a tu proyecto"}</h2></div>
        <button type="button" className="create-dialog-close" aria-label="Cerrar" onClick={close}>×</button>
      </div>
      {step === "module" ? <div className="create-entry-options">
        {entryOptions.map((option) => <button key={option.id} type="button" onClick={() => { setEntryModule(option.id); setStep("name"); setError(null); operationId.current = null; }}>
          <span className="create-entry-icon" aria-hidden="true">{option.icon}</span>
          <span><strong>{option.label}</strong><small>{option.description}</small></span>
          <span aria-hidden="true">→</span>
        </button>)}
      </div> : <form onSubmit={submit} className="create-name-step">
        <p>Comenzar con: <strong>{entryOptions.find((option) => option.id === entryModule)?.label}</strong></p>
        <label htmlFor="create-project-name">Nombre del proyecto</label>
        <input id="create-project-name" autoFocus value={name} onChange={(event) => { setName(event.target.value); operationId.current = null; }} placeholder="LA FRECUENCIA" maxLength={160} required />
        {error && <p className="create-form-error" role="alert">{error}</p>}
        <div className="create-dialog-actions">
          <button type="button" onClick={() => { setStep("module"); setError(null); }}>← Volver</button>
          <button type="submit" disabled={busy || !name.trim()}>{busy ? "Creando…" : "Crear proyecto"}</button>
        </div>
      </form>}
    </dialog>
  </>;
}
