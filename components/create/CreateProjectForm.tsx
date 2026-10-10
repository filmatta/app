"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveCompletedIdeaDraftAction, createProjectAction, saveCreateIdeaDraftAction, saveCreateOnboardingAction } from "@/app/create/actions";
import { analyzeCreateIdeaAction, completeIdeationAction, saveIdeationSynthesisAction, synthesizeCreateIdeaAction } from "@/app/create/ideation-actions";
import { IDEATION_QUESTIONS, IDEATION_SECTIONS, selectQuestions, type IdeationAnalysis, type IdeationSynthesis } from "@/lib/create/ideation/contract";
import type { CreateIdeaDraft, CreateIntention, CreateOnboardingState } from "@/lib/create/onboarding";

const intentions: { id: CreateIntention; label: string; description: string }[] = [
  { id: "idea", label: "Tengo una idea", description: "Tengo algo en mente y quiero desarrollarlo." },
  { id: "new_script", label: "Quiero escribir un guion nuevo", description: "Quiero empezar desde cero." },
  { id: "existing_script", label: "Ya tengo un guion o borrador", description: "Quiero traerlo a FILMATTA y seguir trabajando." },
];
const labels: Record<(typeof IDEATION_SECTIONS)[number], string> = {
  premise: "Premisa", protagonists: "Protagonista(s)", goal: "Objetivo", conflict: "Conflicto central", stakes: "Stakes", incident: "Incidente",
  milestones: "Hitos", images: "Escenas e imágenes", ending: "Final", theme: "Tema / sensación", openQuestions: "Preguntas abiertas",
};
type Step = "intent" | "name" | "idea" | "detail" | "review" | "project_name";

export default function CreateProjectForm({ ownerId, autoOpen, hasProjects, initialState, initialDraft }: { ownerId: string; autoOpen: boolean; hasProjects: boolean; initialState: CreateOnboardingState | null; initialDraft: CreateIdeaDraft | null }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const operationId = useRef<string | null>(null);
  const autoOpened = useRef(false);
  const resumableIdea = initialState?.intention === "idea" && initialState.status !== "completed" && initialState.status !== "skipped";
  const resumableGuide = (initialState?.intention === "new_script" || initialState?.intention === "existing_script") && initialState.currentStep === "project_spotlight" ? initialState.intention : null;
  const initialStep: Step = resumableIdea && initialDraft ? initialDraft.currentStep === "detail" ? "detail" : initialDraft.currentStep === "review" || initialDraft.currentStep === "project_name" ? initialDraft.currentStep : "idea" : "intent";
  const [step, setStep] = useState<Step>(initialStep);
  const [intention, setIntention] = useState<CreateIntention | null>(initialState?.intention ?? null);
  const [guided, setGuided] = useState<CreateIntention | null>(resumableGuide);
  const [name, setName] = useState("");
  const [idea, setIdea] = useState(initialDraft?.idea ?? "");
  const [answers, setAnswers] = useState<Record<string,string>>(initialDraft?.answers ?? {});
  const [analysis, setAnalysis] = useState<IdeationAnalysis | null>(initialDraft?.analysis ?? null);
  const [synthesis, setSynthesis] = useState<IdeationSynthesis | null>(initialDraft?.synthesis ?? null);
  const firstQuestions = initialDraft?.analysis ? selectQuestions(initialDraft.analysis, {}) : [];
  const [questionIndex, setQuestionIndex] = useState(Math.max(0, firstQuestions.findIndex((id) => id === initialDraft?.currentQuestionId)));
  const [destination, setDestination] = useState<"writer" | "explore">("writer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveLabel, setSaveLabel] = useState(initialDraft ? "Guardado" : "");
  const localKey = `filmatta:create:idea:${ownerId}`;
  const questionIds = analysis ? selectQuestions(analysis, {}) : [];
  const question = IDEATION_QUESTIONS.find((item) => item.id === questionIds[questionIndex]);

  useEffect(() => {
    try {
      const local = localStorage.getItem(localKey);
      if (!local) return;
      const parsed = JSON.parse(local) as { idea?: string; answers?: Record<string,string>; questionIndex?: number; savedAt?: string };
      if (initialDraft?.updatedAt && String(parsed.savedAt ?? "") <= initialDraft.updatedAt) return;
      queueMicrotask(() => {
        if (typeof parsed.idea === "string") setIdea(parsed.idea.slice(0,10000));
        if (parsed.answers && typeof parsed.answers === "object") setAnswers(parsed.answers);
        if (Number.isInteger(parsed.questionIndex)) setQuestionIndex(Math.max(0, Math.min(IDEATION_QUESTIONS.length - 1, Number(parsed.questionIndex))));
        if (initialStep === "review" || initialStep === "project_name") { setStep("idea"); setAnalysis(null); setSynthesis(null); }
      });
    } catch { /* local backup is best effort */ }
  }, [initialDraft?.updatedAt, initialStep, localKey]);
  useEffect(() => {
    if (!autoOpen || guided || autoOpened.current) return;
    autoOpened.current = true;
    queueMicrotask(() => dialog.current?.showModal());
  }, [autoOpen, guided]);
  useEffect(() => {
    if (busy || step !== "idea" && step !== "detail") return;
    try { localStorage.setItem(localKey, JSON.stringify({ idea, answers, questionIndex, savedAt: new Date().toISOString() })); queueMicrotask(() => setSaveLabel("Guardando…")); }
    catch { queueMicrotask(() => setSaveLabel("Guardado local no disponible")); }
    const timer = window.setTimeout(async () => {
      const result = await saveCreateIdeaDraftAction({ idea, answers, currentQuestionId: step === "detail" ? question?.id ?? null : null, currentStep: step === "detail" ? "detail" : "capture" });
      setSaveLabel(result.ok ? "Guardado" : "Guardado en este dispositivo");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [answers, busy, idea, localKey, question?.id, questionIndex, step]);

  function close() { dialog.current?.close(); trigger.current?.focus(); }
  async function choose(next: CreateIntention) {
    setIntention(next); setError(null);
    if (next === "idea" && initialDraft?.projectId && initialState?.status === "completed") {
      const archived = await archiveCompletedIdeaDraftAction();
      if (!archived.ok) { setError(archived.message); return; }
      try { localStorage.removeItem(localKey); } catch { /* local backup is best effort */ }
      setIdea(""); setAnswers({}); setAnalysis(null); setSynthesis(null); setQuestionIndex(0); setSaveLabel("");
    }
    await saveCreateOnboardingAction({ status: "intention_selected", intention: next, currentStep: next === "idea" ? "idea_capture" : "project_spotlight" });
    if (next === "idea") setStep("idea"); else { close(); setGuided(next); }
  }
  async function dismissGuided() { await saveCreateOnboardingAction({ status: "skipped", currentStep: "dashboard" }); setGuided(null); trigger.current?.focus(); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !intention) return;
    setBusy(true); setError(null); operationId.current ??= crypto.randomUUID();
    try {
      const result = await createProjectAction(name, "writer", operationId.current);
      if (!result.ok) { setError(result.message); return; }
      await saveCreateOnboardingAction({ status: "project_guided", intention, currentStep: "writer_spotlight", projectId: result.id });
      close(); setGuided(null); router.push(`/create/projects/${result.id}?onboarding=${intention}`);
    } catch { setError("No pudimos confirmar la creación. Reintenta; no duplicaremos el proyecto."); }
    finally { setBusy(false); }
  }
  async function saveDraft(currentStep: "capture" | "detail" | "ready") {
    const result = await saveCreateIdeaDraftAction({ idea, answers, currentQuestionId: currentStep === "detail" ? question?.id ?? null : null, currentStep });
    if (!result.ok) { setError(result.message); return false; }
    setSaveLabel("Guardado"); return true;
  }
  async function prepareSynthesis(saveFirst: boolean) {
    if (saveFirst && !await saveDraft("ready")) return;
    const result = await synthesizeCreateIdeaAction();
    if (!result.ok) { setError(result.message); return; }
    setSynthesis(result.synthesis); setStep("review"); setError(null);
    await saveCreateOnboardingAction({ status: "in_progress", intention: "idea", currentStep: "idea_review" });
  }
  async function startIdeation(mode: "prepare" | "detail") {
    if (busy || !idea.trim()) return;
    setBusy(true); setError(null);
    try {
      if (!await saveDraft("capture")) return;
      const result = await analyzeCreateIdeaAction();
      if (!result.ok) { setError(result.message); return; }
      setAnalysis(result.analysis);
      if (mode === "detail" && selectQuestions(result.analysis, {}).length) {
        setQuestionIndex(0); setStep("detail");
        await saveCreateOnboardingAction({ status: "in_progress", intention: "idea", currentStep: "idea_detail" });
      } else await prepareSynthesis(false);
    } catch { setError("No pudimos completar el análisis. Tu idea está guardada; inténtalo de nuevo."); }
    finally { setBusy(false); }
  }
  async function finishQuestions() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await prepareSynthesis(true); }
    catch { setError("No pudimos preparar el resumen. Tus respuestas permanecen guardadas."); }
    finally { setBusy(false); }
  }
  async function chooseDestination(next: "writer" | "explore") {
    if (!synthesis || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await saveIdeationSynthesisAction(synthesis);
      if (!result.ok) { setError(result.message); return; }
      setSaveLabel("Guardado"); setDestination(next); setStep("project_name");
    } catch { setError("No pudimos guardar tus correcciones. Reintenta."); }
    finally { setBusy(false); }
  }
  async function complete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !name.trim()) return;
    setBusy(true); setError(null);
    try {
      const result = await completeIdeationAction(name, destination);
      if (!result.ok) { setError(result.message); return; }
      close(); router.push(result.href); router.refresh();
    } catch { setError("No pudimos confirmar el Project. Reintenta; no duplicaremos tu trabajo."); }
    finally { setBusy(false); }
  }

  return <>
    <button ref={trigger} type="button" className="create-new-trigger" onClick={() => { setError(null); setGuided(null); dialog.current?.showModal(); }}><span aria-hidden="true">＋</span>Crear proyecto</button>
    {guided && <div className="create-guided-overlay" role="dialog" aria-modal="true" aria-label="Crear tu proyecto"><div className="create-guided-card"><p>{hasProjects ? "NUEVO PROJECT" : "PRIMER PASO"}</p><h2>{hasProjects ? "Cada historia tiene su propio Project." : "Todo en FILMATTA empieza en un Project."}</h2><span>Aquí vivirán tu guion, Shotlist, Storyboard, Production y documentos.</span><div><button type="button" onClick={() => void dismissGuided()}>Ahora no</button><button type="button" onClick={() => { setStep("name"); dialog.current?.showModal(); }}>{hasProjects ? "Crear Project" : "Crear mi primer proyecto"}</button></div></div></div>}
    <dialog ref={dialog} className={`create-project-dialog is-${step}`} onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => { setError(null); operationId.current = null; }}>
      <div className="create-dialog-heading"><div><p>FILMATTA CREATE</p><h2>{step === "intent" ? "¿Dónde estás con tu proyecto?" : step === "name" || step === "project_name" ? "Ponle nombre a tu proyecto" : step === "idea" ? "Cuéntame tu idea" : step === "detail" ? question?.title ?? "Tu historia" : "Lo que entendimos de tu historia"}</h2></div><button type="button" className="create-dialog-close" aria-label="Cerrar" onClick={close}>×</button></div>
      {step === "intent" && <div className="create-intention-step"><p>Elige el punto que mejor describe dónde estás. Podrás cambiar de rumbo después.</p><div className="create-entry-options">{intentions.map((option) => <button key={option.id} type="button" onClick={() => void choose(option.id)}><span><strong>{option.label}</strong><small>{option.description}</small></span><span aria-hidden="true">→</span></button>)}</div><button className="create-explore" type="button" onClick={() => void dismissGuided()}>Explorar por mi cuenta</button></div>}
      {step === "name" && <form onSubmit={submit} className="create-name-step"><p>Empezaremos con <strong>Guion</strong>. La importación estará disponible dentro de Writer.</p><label htmlFor="create-project-name">Nombre del proyecto</label><input id="create-project-name" autoFocus value={name} onChange={(event) => { setName(event.target.value); operationId.current = null; }} placeholder="Mi proyecto" maxLength={160} required />{error && <p className="create-form-error" role="alert">{error}</p>}<div className="create-dialog-actions"><button type="button" onClick={() => setStep("intent")}>← Volver</button><button type="submit" disabled={busy || !name.trim()}>{busy ? "Creando…" : "Crear proyecto"}</button></div></form>}
      {step === "idea" && <div className="create-idea-step"><p>Escríbela como venga. Puede ser una premisa, escenas, un final, una sensación o toda la historia.</p><label htmlFor="create-idea">Tu idea</label><textarea id="create-idea" autoFocus value={idea} onChange={(event) => setIdea(event.target.value.slice(0,10000))} maxLength={10000} placeholder="Empieza por lo que ya puedes ver…" /><div className="create-idea-status"><span>{saveLabel}</span><span>{idea.length.toLocaleString("es-MX")} / 10,000</span></div>{error && <p className="create-form-error" role="alert">{error}</p>}<div className="create-dialog-actions"><button type="button" disabled={!idea.trim() || busy} onClick={() => void startIdeation("prepare")}>{busy ? "Analizando…" : error ? "Intentar de nuevo" : "Preparar mi idea"}</button><button type="button" disabled={!idea.trim() || busy} onClick={() => void startIdeation("detail")}>Quiero detallarla más</button></div><small>Tu borrador se guarda antes de analizarlo. Todavía no creamos un Project.</small></div>}
      {step === "detail" && question && <div className="create-idea-step create-question-step"><p>{question.helper}</p><textarea autoFocus aria-label={question.title} value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value.slice(0,10000) }))} placeholder="Escribe lo que ya sabes…" /><div className="create-idea-status"><span>{saveLabel}</span><span>{questionIndex + 1} / {questionIds.length}</span></div>{error && <p className="create-form-error" role="alert">{error}</p>}<button className="create-prepare-now" type="button" disabled={busy} onClick={() => void finishQuestions()}>{busy ? "Preparando…" : error ? "Intentar de nuevo" : "Preparar mi idea ahora"}</button><div className="create-dialog-actions"><button type="button" disabled={busy} onClick={() => questionIndex ? setQuestionIndex(questionIndex - 1) : setStep("idea")}>← Atrás</button><button type="button" disabled={busy} onClick={() => questionIndex < questionIds.length - 1 ? setQuestionIndex(questionIndex + 1) : void finishQuestions()}>{questionIndex < questionIds.length - 1 ? "Continuar" : "Preparar resumen"}</button></div></div>}
      {step === "review" && synthesis && <div className="create-ideation-review"><p>Corrige lo que no encaje. Las inferencias y preguntas abiertas quedan señaladas; nada de esto es guion terminado.</p><div className="create-ideation-sections">{IDEATION_SECTIONS.map((id) => <label key={id}><span>{labels[id]} <small>{synthesis.sections[id].basis === "source" ? "Dicho por ti" : synthesis.sections[id].basis === "inference" ? "Interpretación" : "Por definir"}</small></span><textarea value={synthesis.sections[id].text} onChange={(event) => { setSynthesis((current) => current ? { ...current, sections: { ...current.sections, [id]: { ...current.sections[id], text: event.target.value.slice(0,1800) } } } : null); setSaveLabel("Cambios pendientes"); }} rows={2} /></label>)}</div>{error && <p className="create-form-error" role="alert">{error}</p>}<div className="create-dialog-actions"><button type="button" disabled={busy} onClick={() => { setStep(questionIds.length ? "detail" : "idea"); setQuestionIndex(0); }}>← Editar respuestas</button></div><div className="create-ideation-branches"><button type="button" disabled={busy} onClick={() => void chooseDestination("writer")}><strong>Preparar guion</strong><span>Organiza hitos y cues para empezar a escribir.</span></button><button type="button" disabled={busy} onClick={() => void chooseDestination("explore")}><strong>Explorar mi idea</strong><span>Conserva el contexto para descubrir otros caminos.</span></button></div><small>{busy ? "Guardando…" : saveLabel}</small></div>}
      {step === "project_name" && <form onSubmit={complete} className="create-name-step"><p>{destination === "writer" ? "Crearemos un Project con Writer vacío y una guía separada del guion." : "Guardaremos tu contexto creativo en un Project para seguir explorando."}</p><label htmlFor="create-ideation-project-name">Nombre del proyecto</label><input id="create-ideation-project-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Mi historia" maxLength={160} required />{error && <p className="create-form-error" role="alert">{error}</p>}<div className="create-dialog-actions"><button type="button" disabled={busy} onClick={() => setStep("review")}>← Volver</button><button type="submit" disabled={busy || !name.trim()}>{busy ? "Preparando…" : destination === "writer" ? "Crear Project y abrir Writer" : "Crear Project y explorar"}</button></div></form>}
    </dialog>
  </>;
}
