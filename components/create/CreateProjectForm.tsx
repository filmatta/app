"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction, saveCreateIdeaDraftAction, saveCreateOnboardingAction } from "@/app/create/actions";
import type { CreateIdeaDraft, CreateIntention, CreateOnboardingState } from "@/lib/create/onboarding";

const intentions: { id: CreateIntention; label: string; description: string }[] = [
  { id: "idea", label: "Tengo una idea", description: "Tengo algo en mente y quiero desarrollarlo." },
  { id: "new_script", label: "Quiero escribir un guion nuevo", description: "Quiero empezar desde cero." },
  { id: "existing_script", label: "Ya tengo un guion o borrador", description: "Quiero traerlo a FILMATTA y seguir trabajando." },
];

const questions = [
  ["protagonist", "¿Quién protagoniza esta historia?", "Describe a la persona que empuja la historia, aunque todavía no conozcas todos sus detalles."],
  ["goal", "¿Qué quiere conseguir?", "El objetivo nos ayuda a entender hacia dónde avanza la historia."],
  ["conflict", "¿Qué se lo impide?", "Esto es el conflicto: la fuerza que dificulta que el protagonista consiga lo que quiere."],
  ["stakes", "¿Qué puede perder?", "Piensa qué cambia si no consigue su objetivo."],
  ["incident", "¿Qué pone la historia en marcha?", "Puede ser una decisión, un encuentro o un hecho que rompe la normalidad."],
  ["escalation", "¿Cómo se complica?", "Anota obstáculos o cambios que aumentan la presión."],
  ["images", "¿Qué escenas o imágenes ya ves?", "Escribe momentos concretos, aunque aún no sepas dónde encajan."],
  ["turn", "¿Hay un giro o revelación?", "Puede cambiar lo que sabemos, lo que quiere el protagonista o el rumbo de la historia."],
  ["ending", "¿Cómo imaginas el final?", "Puede ser una imagen, una emoción o una consecuencia."],
  ["theme", "¿Qué quieres que permanezca?", "Una pregunta, sensación o tema que quieras dejar en quien la vea."],
] as const;

export default function CreateProjectForm({ ownerId, autoOpen, initialState, initialDraft }: { ownerId: string; autoOpen: boolean; initialState: CreateOnboardingState | null; initialDraft: CreateIdeaDraft | null }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const operationId = useRef<string | null>(null);
  const submitting = useRef(false);
  const autoOpened = useRef(false);
  const resumableIdea = initialState?.intention === "idea" && initialState.status !== "completed" && initialState.status !== "skipped";
  const resumableGuide = (initialState?.intention === "new_script" || initialState?.intention === "existing_script") && initialState.currentStep === "project_spotlight" ? initialState.intention : null;
  const [step, setStep] = useState<"intent" | "name" | "idea" | "detail" | "saved">(resumableIdea ? initialDraft?.currentStep === "detail" ? "detail" : "idea" : "intent");
  const [intention, setIntention] = useState<CreateIntention | null>(initialState?.intention ?? null);
  const [guided, setGuided] = useState<CreateIntention | null>(resumableGuide);
  const [name, setName] = useState("");
  const [idea, setIdea] = useState(initialDraft?.idea ?? "");
  const [answers, setAnswers] = useState<Record<string,string>>(initialDraft?.answers ?? {});
  const initialIndex = Math.max(0, questions.findIndex(([id]) => id === initialDraft?.currentQuestionId));
  const [questionIndex, setQuestionIndex] = useState(initialIndex);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveLabel, setSaveLabel] = useState(initialDraft ? "Guardado" : "");
  const localKey = `filmatta:create:idea:${ownerId}`;

  useEffect(() => {
    try {
      const local = localStorage.getItem(localKey);
      if (local) {
        const parsed = JSON.parse(local) as { idea?: string; answers?: Record<string,string>; questionIndex?: number; savedAt?: string };
        if (!initialDraft?.updatedAt || String(parsed.savedAt ?? "") > initialDraft.updatedAt) {
          queueMicrotask(() => {
            if (typeof parsed.idea === "string") setIdea(parsed.idea.slice(0,10000));
            if (parsed.answers && typeof parsed.answers === "object") setAnswers(parsed.answers);
            if (Number.isInteger(parsed.questionIndex)) setQuestionIndex(Math.max(0,Math.min(questions.length-1,Number(parsed.questionIndex))));
          });
        }
      }
    } catch { /* browser protection is best effort */ }
  }, [initialDraft?.updatedAt, localKey]);

  useEffect(() => {
    if (!autoOpen || guided || autoOpened.current) return;
    autoOpened.current = true;
    queueMicrotask(() => dialog.current?.showModal());
  }, [autoOpen, guided]);

  useEffect(() => {
    if (step !== "idea" && step !== "detail") return;
    const payload = { idea, answers, questionIndex, savedAt: new Date().toISOString() };
    try { localStorage.setItem(localKey, JSON.stringify(payload)); queueMicrotask(() => setSaveLabel("Guardando…")); } catch { queueMicrotask(() => setSaveLabel("Guardado local no disponible")); }
    const timer = window.setTimeout(async () => {
      const currentQuestionId = step === "detail" ? questions[questionIndex][0] : null;
      const result = await saveCreateIdeaDraftAction({ idea, answers, currentQuestionId, currentStep: step === "detail" ? "detail" : "capture" });
      setSaveLabel(result.ok ? "Guardado" : "Guardado en este dispositivo");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [answers, idea, localKey, questionIndex, step]);

  function openSelector() { setStep("intent"); setError(null); setGuided(null); dialog.current?.showModal(); }
  function close() { dialog.current?.close(); trigger.current?.focus(); }

  async function choose(next: CreateIntention) {
    setIntention(next); setError(null);
    await saveCreateOnboardingAction({ status: "intention_selected", intention: next, currentStep: next === "idea" ? "idea_capture" : "project_spotlight" });
    if (next === "idea") setStep("idea");
    else { close(); setGuided(next); }
  }

  async function explore() { await saveCreateOnboardingAction({ status: "skipped", currentStep: "dashboard" }); close(); setGuided(null); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !intention) return;
    submitting.current = true; setBusy(true); setError(null); operationId.current ??= crypto.randomUUID();
    try {
      const result = await createProjectAction(name, "writer", operationId.current);
      if (!result.ok) { setError(result.message); return; }
      await saveCreateOnboardingAction({ status: "project_guided", intention, currentStep: "writer_spotlight", projectId: result.id });
      close(); setGuided(null); router.push(`/create/projects/${result.id}?onboarding=${intention}`);
    } catch { setError("No pudimos confirmar la creación. Reintenta; no duplicaremos el proyecto."); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function markIdeaReady() {
    setBusy(true); setError(null);
    const result = await saveCreateIdeaDraftAction({ idea, answers, currentQuestionId: step === "detail" ? questions[questionIndex][0] : null, currentStep: "ready" });
    if (result.ok) { await saveCreateOnboardingAction({ status: "in_progress", intention: "idea", currentStep: "idea_ready" }); setStep("saved"); setSaveLabel("Guardado"); }
    else setError(result.message);
    setBusy(false);
  }

  return <>
    <button ref={trigger} type="button" className="create-new-trigger" onClick={openSelector}><span aria-hidden="true">＋</span>Crear proyecto</button>
    {guided && <div className="create-guided-overlay" role="dialog" aria-modal="true" aria-label="Crear tu proyecto"><div className="create-guided-card"><p>PRIMER PASO</p><h2>Todo en FILMATTA empieza en un Project.</h2><span>Aquí vivirán tu guion, Shotlist, Storyboard, Production y documentos.</span><div><button type="button" onClick={() => setGuided(null)}>Ahora no</button><button type="button" onClick={() => { setStep("name"); dialog.current?.showModal(); }}>Crear mi primer proyecto</button></div></div></div>}
    <dialog ref={dialog} className={`create-project-dialog is-${step}`} onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => { setError(null); operationId.current = null; }}>
      <div className="create-dialog-heading"><div><p>FILMATTA CREATE</p><h2>{step === "intent" ? "¿Dónde estás con tu proyecto?" : step === "name" ? "Ponle nombre a tu proyecto" : step === "idea" ? "Cuéntame tu idea" : step === "detail" ? questions[questionIndex][1] : "Tu idea está a salvo"}</h2></div><button type="button" className="create-dialog-close" aria-label="Cerrar" onClick={close}>×</button></div>
      {step === "intent" && <div className="create-intention-step"><p>Elige el punto que mejor describe dónde estás. Podrás cambiar de rumbo después.</p><div className="create-entry-options">{intentions.map((option) => <button key={option.id} type="button" onClick={() => void choose(option.id)}><span><strong>{option.label}</strong><small>{option.description}</small></span><span aria-hidden="true">→</span></button>)}</div><button className="create-explore" type="button" onClick={() => void explore()}>Explorar por mi cuenta</button></div>}
      {step === "name" && <form onSubmit={submit} className="create-name-step"><p>Empezaremos con <strong>Guion</strong>. La importación estará disponible dentro de Writer.</p><label htmlFor="create-project-name">Nombre del proyecto</label><input id="create-project-name" autoFocus value={name} onChange={(event) => { setName(event.target.value); operationId.current = null; }} placeholder="Mi proyecto" maxLength={160} required />{error && <p className="create-form-error" role="alert">{error}</p>}<div className="create-dialog-actions"><button type="button" onClick={() => setStep("intent")}>← Volver</button><button type="submit" disabled={busy || !name.trim()}>{busy ? "Creando…" : "Crear proyecto"}</button></div></form>}
      {step === "idea" && <div className="create-idea-step"><p>Escríbela como venga. No necesitas usar términos técnicos ni tener todo resuelto. Puede ser una premisa, escenas, un final, una sensación o toda la historia.</p><label htmlFor="create-idea">Tu idea</label><textarea id="create-idea" autoFocus value={idea} onChange={(event) => setIdea(event.target.value.slice(0,10000))} maxLength={10000} placeholder="Empieza por lo que ya puedes ver…" /><div className="create-idea-status"><span>{saveLabel}</span><span>{idea.length.toLocaleString("es-MX")} / 10,000</span></div>{error && <p className="create-form-error" role="alert">{error}</p>}<div className="create-dialog-actions"><button type="button" disabled={!idea.trim() || busy} onClick={() => void markIdeaReady()}>Preparar mi idea</button><button type="button" disabled={!idea.trim()} onClick={() => setStep("detail")}>Quiero detallarla más</button></div><small>En esta etapa guardamos tu material. La preparación inteligente se conectará en Ideation MVP.</small></div>}
      {step === "detail" && <div className="create-idea-step create-question-step"><p>{questions[questionIndex][2]}</p><textarea autoFocus aria-label={questions[questionIndex][1]} value={answers[questions[questionIndex][0]] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [questions[questionIndex][0]]: event.target.value.slice(0,10000) }))} placeholder="Escribe lo que ya sabes…" /><div className="create-idea-status"><span>{saveLabel}</span><span>{questionIndex + 1} / {questions.length}</span></div><button className="create-prepare-now" type="button" onClick={() => void markIdeaReady()}>Preparar mi idea ahora</button><div className="create-dialog-actions"><button type="button" onClick={() => questionIndex ? setQuestionIndex(questionIndex - 1) : setStep("idea")}>← Atrás</button><button type="button" onClick={() => questionIndex < questions.length - 1 ? setQuestionIndex(questionIndex + 1) : void markIdeaReady()}>{questionIndex < questions.length - 1 ? "Continuar" : "Guardar detalle"}</button></div></div>}
      {step === "saved" && <div className="create-idea-saved"><p>Guardamos el texto y tus respuestas como un borrador de ideación. Todavía no se creó ningún Project.</p><p>Podrás retomarlo aquí y conectarlo al motor de Ideation en el siguiente sprint.</p><button type="button" onClick={close}>Volver a Create</button></div>}
    </dialog>
  </>;
}
