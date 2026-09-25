"use client";

import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { getLocationErrorMessage } from "@/lib/locations/form";
import type { LocationStatus } from "@/lib/locations/form";
import type {
  LocationEditorActionResult,
  LocationEditorSection,
} from "./actions";

type SectionAction = (formData: FormData) => Promise<LocationEditorActionResult>;
type EditorContextValue = {
  registerForm: (section: LocationEditorSection, form: HTMLFormElement | null) => void;
  markDirty: (section: LocationEditorSection) => void;
  markSaving: (section: LocationEditorSection) => void;
  resolveSave: (section: LocationEditorSection, result: LocationEditorActionResult) => void;
};

const INITIAL_RESULT: LocationEditorActionResult = { ok: false, nonce: "initial" };
const EditorContext = createContext<EditorContextValue | null>(null);

export default function LocationOwnerEditorShell({
  currentStatus,
  statusAction,
  children,
}: {
  currentStatus: LocationStatus;
  statusAction: SectionAction;
  children: ReactNode;
}) {
  const router = useRouter();
  const forms = useRef(new Map<LocationEditorSection, HTMLFormElement>());
  const [dirtySections, setDirtySections] = useState<LocationEditorSection[]>([]);
  const [lastDirty, setLastDirty] = useState<LocationEditorSection | null>(null);
  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "saved">("idle");
  const [status, setStatus] = useState(currentStatus);
  const [barMessage, setBarMessage] = useState("");
  const [requirements, setRequirements] = useState<LocationEditorActionResult["requirements"]>([]);
  const [, runStatusAction, statusPending] = useActionState(
    async (_previous: LocationEditorActionResult, formData: FormData) => {
      const result = await statusAction(formData);
      if (result.ok && result.status) {
        setStatus(result.status);
        setRequirements([]);
        setBarMessage(result.status === "published" ? "Locación publicada" : "Locación despublicada");
        router.refresh();
      } else {
        setRequirements(result.requirements ?? []);
        setBarMessage(result.error ? getLocationErrorMessage(result.error) ?? "No pudimos cambiar el estado." : "Revisa lo pendiente antes de publicar.");
      }
      return result;
    },
    INITIAL_RESULT,
  );

  const registerForm = useCallback((section: LocationEditorSection, form: HTMLFormElement | null) => {
    if (form) forms.current.set(section, form);
    else forms.current.delete(section);
  }, []);

  const markDirty = useCallback((section: LocationEditorSection) => {
    setDirtySections((current) => current.includes(section) ? current : [...current, section]);
    setLastDirty(section);
    setSavePhase("idle");
    setBarMessage("");
  }, []);

  const markSaving = useCallback((section: LocationEditorSection) => {
    setLastDirty(section);
    setSavePhase("saving");
    setBarMessage("");
  }, []);

  const resolveSave = useCallback((section: LocationEditorSection, result: LocationEditorActionResult) => {
    if (!result.ok) {
      setSavePhase("idle");
      return;
    }
    setDirtySections((current) => current.filter((item) => item !== section));
    setSavePhase("saved");
    setBarMessage("Guardado");
    router.refresh();
  }, [router]);

  const context = useMemo<EditorContextValue>(() => ({
    registerForm,
    markDirty,
    markSaving,
    resolveSave,
  }), [markDirty, markSaving, registerForm, resolveSave]);

  const hasDirtyChanges = dirtySections.length > 0;

  function saveCurrentSection() {
    const target = lastDirty && dirtySections.includes(lastDirty) ? lastDirty : dirtySections.at(-1);
    if (!target) return;
    forms.current.get(target)?.requestSubmit();
  }

  function guardStatusSubmit(event: FormEvent<HTMLFormElement>) {
    if (hasDirtyChanges) {
      event.preventDefault();
      setRequirements([]);
      setBarMessage("Guarda los cambios pendientes antes de cambiar la publicación.");
      return;
    }
    if (status === "published" && !window.confirm("¿Despublicar esta locación?\n\nDejará de estar visible públicamente, pero conservarás toda su información.")) {
      event.preventDefault();
    }
  }

  function focusRequirement(section: LocationEditorSection) {
    const target = document.getElementById(`location-section-${section}`);
    const details = target?.querySelector("details");
    if (details instanceof HTMLDetailsElement) details.open = true;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return <EditorContext.Provider value={context}>
    <div className="pb-36 sm:pb-32">{children}</div>
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0b0b0b]/[0.98] shadow-[0_-18px_45px_rgba(0,0,0,.38)] backdrop-blur" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div aria-live="polite" className="min-h-5 text-xs text-white/55">
          {barMessage || (hasDirtyChanges ? "Cambios sin guardar" : "Sin cambios pendientes")}
          {requirements && requirements.length > 0 && <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-amber-100">
            <strong className="block">Antes de publicar completa:</strong>
            <div className="mt-2 flex flex-wrap gap-2">{requirements.map((item) => <button key={item.id} type="button" onClick={() => focusRequirement(item.section)} className="underline underline-offset-4">{item.label}</button>)}</div>
          </div>}
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <button type="button" onClick={saveCurrentSection} disabled={!hasDirtyChanges || savePhase === "saving"} className="min-h-11 rounded-full border border-white/15 px-6 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-default disabled:opacity-40">
            {savePhase === "saving" ? "Guardando…" : !hasDirtyChanges && savePhase === "saved" ? "Guardado" : "Guardar"}
          </button>
          <form action={runStatusAction} onSubmit={guardStatusSubmit}>
            <button type="submit" name="intent" value={status === "published" ? "draft" : "published"} disabled={statusPending} className={status === "published" ? "min-h-11 rounded-full border border-white/20 px-6 text-sm font-semibold text-white transition hover:bg-white/[0.06] disabled:opacity-50" : "min-h-11 rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-white/85 disabled:opacity-50"}>
              {statusPending ? status === "published" ? "Despublicando…" : "Publicando…" : status === "published" ? "Despublicar" : "Publicar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  </EditorContext.Provider>;
}

export function LocationSectionForm({
  section,
  action,
  className,
  children,
}: {
  section: LocationEditorSection;
  action: SectionAction;
  className?: string;
  children: ReactNode;
}) {
  const context = useEditorContext();
  const [result, formAction] = useActionState(
    async (_previous: LocationEditorActionResult, formData: FormData) => {
      const nextResult = await action(formData);
      context.resolveSave(section, nextResult);
      return nextResult;
    },
    INITIAL_RESULT,
  );

  return <form
    ref={(form) => context.registerForm(section, form)}
    action={formAction}
    className={className}
    data-location-editor-section={section}
    onInputCapture={() => context.markDirty(section)}
    onChangeCapture={() => context.markDirty(section)}
    onSubmitCapture={() => context.markSaving(section)}
  >
    {children}
    {!result.ok && result.error && result.nonce !== "initial" && <p role="alert" className="text-sm leading-6 text-red-200">{getLocationErrorMessage(result.error)}</p>}
  </form>;
}

function useEditorContext() {
  const context = useContext(EditorContext);
  if (!context) throw new Error("LocationSectionForm must be rendered inside LocationOwnerEditorShell");
  return context;
}
