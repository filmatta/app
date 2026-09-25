"use client";

import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { getLocationErrorMessage } from "@/lib/locations/form";
import type { LocationStatus } from "@/lib/locations/form";
import type { LocationEditorActionResult, LocationEditorSection } from "./actions";

type SectionAction = (formData: FormData) => Promise<LocationEditorActionResult>;
export type LocationEditorPanelSection = "photos" | "basic" | "location" | "pricing" | "characteristics" | "conditions" | "contact";

const PANEL_FORMS: Record<LocationEditorPanelSection, LocationEditorSection[]> = {
  photos: [],
  basic: ["identity", "description"],
  location: ["location"],
  pricing: ["pricing"],
  characteristics: ["characteristics"],
  conditions: ["conditions", "notes"],
  contact: ["contact"],
};

type EditorContextValue = {
  activePanel: LocationEditorPanelSection | null;
  closeGuardPanel: LocationEditorPanelSection | null;
  openPanel: (panel: LocationEditorPanelSection, trigger: HTMLButtonElement) => void;
  requestClose: (panel: LocationEditorPanelSection) => void;
  continueEditing: () => void;
  discardAndClose: (panel: LocationEditorPanelSection) => void;
  registerForm: (section: LocationEditorSection, form: HTMLFormElement | null) => void;
  registerReset: (section: LocationEditorSection, reset: (() => void) | null) => void;
  markDirty: (section: LocationEditorSection) => void;
  markSaving: (section: LocationEditorSection) => void;
  resolveSave: (section: LocationEditorSection, result: LocationEditorActionResult) => void;
};

const INITIAL_RESULT: LocationEditorActionResult = { ok: false, nonce: "initial" };
const EditorContext = createContext<EditorContextValue | null>(null);
const subscribeToHydration = () => () => undefined;

export default function LocationOwnerEditorShell({ currentStatus, statusAction, initialPanel = null, children }: {
  currentStatus: LocationStatus;
  statusAction: SectionAction;
  initialPanel?: LocationEditorPanelSection | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const forms = useRef(new Map<LocationEditorSection, HTMLFormElement>());
  const resets = useRef(new Map<LocationEditorSection, () => void>());
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const dirtyRef = useRef<LocationEditorSection[]>([]);
  const activePanelRef = useRef<LocationEditorPanelSection | null>(initialPanel);
  const [dirtySections, setDirtySections] = useState<LocationEditorSection[]>([]);
  const [lastDirty, setLastDirty] = useState<LocationEditorSection | null>(null);
  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "saved">("idle");
  const [status, setStatus] = useState(currentStatus);
  const [barMessage, setBarMessage] = useState("");
  const [requirements, setRequirements] = useState<LocationEditorActionResult["requirements"]>([]);
  const [activePanel, setActivePanel] = useState<LocationEditorPanelSection | null>(initialPanel);
  const [closeGuardPanel, setCloseGuardPanel] = useState<LocationEditorPanelSection | null>(null);
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

  const finishClose = useCallback(() => {
    activePanelRef.current = null;
    setActivePanel(null);
    setCloseGuardPanel(null);
    window.requestAnimationFrame(() => returnFocus.current?.focus());
  }, []);

  const openPanel = useCallback((panel: LocationEditorPanelSection, trigger: HTMLButtonElement) => {
    returnFocus.current = trigger;
    activePanelRef.current = panel;
    setCloseGuardPanel(null);
    setActivePanel(panel);
  }, []);

  const requestClose = useCallback((panel: LocationEditorPanelSection) => {
    const hasPanelChanges = PANEL_FORMS[panel].some((section) => dirtyRef.current.includes(section));
    if (hasPanelChanges) {
      setCloseGuardPanel(panel);
      return;
    }
    finishClose();
  }, [finishClose]);

  const discardAndClose = useCallback((panel: LocationEditorPanelSection) => {
    const discarded = PANEL_FORMS[panel];
    for (const section of discarded) {
      forms.current.get(section)?.reset();
      resets.current.get(section)?.();
    }
    const remaining = dirtyRef.current.filter((section) => !discarded.includes(section));
    dirtyRef.current = remaining;
    setDirtySections(remaining);
    setLastDirty((current) => current && discarded.includes(current) ? remaining.at(-1) ?? null : current);
    setSavePhase("idle");
    setBarMessage("");
    finishClose();
  }, [finishClose]);

  const registerForm = useCallback((section: LocationEditorSection, form: HTMLFormElement | null) => {
    if (form) forms.current.set(section, form);
    else forms.current.delete(section);
  }, []);

  const registerReset = useCallback((section: LocationEditorSection, reset: (() => void) | null) => {
    if (reset) resets.current.set(section, reset);
    else resets.current.delete(section);
  }, []);

  const markDirty = useCallback((section: LocationEditorSection) => {
    setDirtySections((current) => {
      const next = current.includes(section) ? current : [...current, section];
      dirtyRef.current = next;
      return next;
    });
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
    const remaining = dirtyRef.current.filter((item) => item !== section);
    dirtyRef.current = remaining;
    setDirtySections(remaining);
    setSavePhase("saved");
    setBarMessage("Guardado");
    const panel = activePanelRef.current;
    if (panel && PANEL_FORMS[panel].includes(section) && !PANEL_FORMS[panel].some((item) => remaining.includes(item))) finishClose();
    router.refresh();
  }, [finishClose, router]);

  const context = useMemo<EditorContextValue>(() => ({
    activePanel,
    closeGuardPanel,
    openPanel,
    requestClose,
    continueEditing: () => setCloseGuardPanel(null),
    discardAndClose,
    registerForm,
    registerReset,
    markDirty,
    markSaving,
    resolveSave,
  }), [activePanel, closeGuardPanel, discardAndClose, markDirty, markSaving, openPanel, registerForm, registerReset, requestClose, resolveSave]);

  const hasDirtyChanges = dirtySections.length > 0;
  function saveCurrentSection() {
    const target = lastDirty && dirtySections.includes(lastDirty) ? lastDirty : dirtySections.at(-1);
    if (target) forms.current.get(target)?.requestSubmit();
  }
  function guardStatusSubmit(event: FormEvent<HTMLFormElement>) {
    if (hasDirtyChanges) {
      event.preventDefault();
      setRequirements([]);
      setBarMessage("Guarda los cambios pendientes antes de cambiar la publicación.");
      return;
    }
    if (status === "published" && !window.confirm("¿Despublicar esta locación?\n\nDejará de estar visible públicamente, pero conservarás toda su información.")) event.preventDefault();
  }
  function focusRequirement(section: LocationEditorSection) {
    const panel = panelForForm(section);
    const trigger = document.querySelector<HTMLButtonElement>(`[data-location-panel-trigger="${panel}"]`);
    if (trigger) openPanel(panel, trigger);
  }

  return <EditorContext.Provider value={context}>
    <div className="pb-36 sm:pb-32" inert={activePanel ? true : undefined} aria-hidden={activePanel ? true : undefined}>{children}</div>
    <div aria-hidden={activePanel ? true : undefined} className={`fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0b0b0b]/[0.98] shadow-[0_-18px_45px_rgba(0,0,0,.38)] backdrop-blur transition-opacity duration-200 ${activePanel ? "pointer-events-none opacity-0" : "opacity-100"}`} style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div aria-live="polite" className="min-h-5 text-xs text-white/55">
          {barMessage || (hasDirtyChanges ? "Cambios sin guardar" : "Sin cambios pendientes")}
          {requirements && requirements.length > 0 && <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-amber-100"><strong className="block">Antes de publicar completa:</strong><div className="mt-2 flex flex-wrap gap-2">{requirements.map((item) => <button key={item.id} type="button" onClick={() => focusRequirement(item.section)} className="underline underline-offset-4">{item.label}</button>)}</div></div>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-end">
          <button type="button" onClick={saveCurrentSection} disabled={!hasDirtyChanges || savePhase === "saving"} className="min-h-12 rounded-xl border border-white/20 px-6 text-sm font-semibold text-white/80 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-default disabled:opacity-40 sm:rounded-full">{savePhase === "saving" ? "Guardando…" : !hasDirtyChanges && savePhase === "saved" ? "Guardado" : "Guardar"}</button>
          <form action={runStatusAction} onSubmit={guardStatusSubmit}><button type="submit" name="intent" value={status === "published" ? "draft" : "published"} disabled={statusPending} className={status === "published" ? "min-h-12 w-full rounded-xl border border-white/20 px-6 text-sm font-semibold text-white transition hover:bg-white/[0.06] disabled:opacity-50 sm:rounded-full" : "min-h-12 w-full rounded-xl bg-[#ff625f] px-6 text-sm font-semibold text-black transition hover:bg-[#ff7774] disabled:opacity-50 sm:rounded-full"}>{statusPending ? status === "published" ? "Despublicando…" : "Publicando…" : status === "published" ? "Despublicar" : "Publicar"}</button></form>
        </div>
      </div>
    </div>
  </EditorContext.Provider>;
}

export function LocationPanelButton({ panel, className, children, ariaLabel }: { panel: LocationEditorPanelSection; className?: string; children: ReactNode; ariaLabel?: string }) {
  const context = useEditorContext();
  return <button type="button" data-location-panel-trigger={panel} aria-haspopup="dialog" aria-expanded={context.activePanel === panel} aria-label={ariaLabel} onClick={(event) => context.openPanel(panel, event.currentTarget)} className={className}>{children}</button>;
}

export function LocationEditorWindow({ panel, title, description, children, media = false }: { panel: LocationEditorPanelSection; title: string; description?: string; children: ReactNode; media?: boolean }) {
  const context = useEditorContext();
  const dialog = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const active = context.activePanel === panel;

  useEffect(() => {
    if (!active) return;
    const node = dialog.current;
    if (!node) return;
    node.querySelector<HTMLElement>("[data-dialog-close]")?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        context.requestClose(panel);
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((item) => !item.closest("[hidden]"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, context, panel]);

  if (!mounted) return null;
  return createPortal(<div hidden={!active} className="fixed inset-0 z-[80] bg-black/80 sm:flex sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) context.requestClose(panel); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`location-editor-window-${panel}`} className="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden border-white/10 bg-[#0d0d0d] shadow-2xl transition duration-200 motion-reduce:transition-none sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-3xl sm:border">
      <header className="flex shrink-0 items-start justify-between gap-5 border-b border-white/10 px-5 py-4 sm:px-7 sm:py-5"><div><h2 id={`location-editor-window-${panel}`} className="text-xl font-semibold tracking-[-.02em] sm:text-2xl">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-white/45">{description}</p>}</div><button data-dialog-close type="button" onClick={() => context.requestClose(panel)} className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 text-xl text-white/55 transition hover:bg-white/[0.06] hover:text-white" aria-label={`Cerrar ${title}`}>×</button></header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 [overscroll-behavior:contain] sm:px-7">{children}</div>
      {context.closeGuardPanel === panel ? <div role="alert" className="shrink-0 border-t border-amber-300/20 bg-[#17140d] px-5 py-4 sm:px-7"><p className="text-sm font-semibold text-amber-100">Hay cambios sin guardar.</p><p className="mt-1 text-xs leading-5 text-amber-100/65">Puedes seguir editando o descartar los cambios de esta ventana.</p><div className="mt-3 flex justify-end gap-3"><button type="button" onClick={context.continueEditing} className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold">Seguir editando</button><button type="button" onClick={() => context.discardAndClose(panel)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">Descartar cambios</button></div></div> : media ? <footer className="shrink-0 border-t border-white/10 bg-[#0d0d0d] px-5 py-3 sm:px-7" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}><div className="flex justify-end"><button type="button" onClick={() => context.requestClose(panel)} className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black">Listo</button></div></footer> : null}
    </div>
  </div>, document.body);
}

export function LocationModalCancel({ panel }: { panel: LocationEditorPanelSection }) {
  const context = useEditorContext();
  return <button type="button" onClick={() => context.requestClose(panel)} className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white">Cancelar</button>;
}

export function LocationSectionForm({ section, action, className, children }: { section: LocationEditorSection; action: SectionAction; className?: string; children: ReactNode }) {
  const context = useEditorContext();
  const [resetVersion, setResetVersion] = useState(0);
  const [result, formAction] = useActionState(async (_previous: LocationEditorActionResult, formData: FormData) => {
    const nextResult = await action(formData);
    context.resolveSave(section, nextResult);
    return nextResult;
  }, INITIAL_RESULT);

  useEffect(() => {
    context.registerReset(section, () => setResetVersion((value) => value + 1));
    return () => context.registerReset(section, null);
  }, [context, section]);

  return <form ref={(form) => context.registerForm(section, form)} action={formAction} className={className} data-location-editor-section={section} onInputCapture={() => context.markDirty(section)} onChangeCapture={() => context.markDirty(section)} onSubmitCapture={() => context.markSaving(section)}>
    <div key={resetVersion}>{children}</div>
    {!result.ok && result.error && result.nonce !== "initial" && <p role="alert" className="mt-4 text-sm leading-6 text-red-200">{getLocationErrorMessage(result.error)}</p>}
  </form>;
}

function panelForForm(section: LocationEditorSection): LocationEditorPanelSection {
  if (section === "identity" || section === "description") return "basic";
  if (section === "conditions" || section === "notes") return "conditions";
  return section;
}

function useEditorContext() {
  const context = useContext(EditorContext);
  if (!context) throw new Error("Location editor controls must be rendered inside LocationOwnerEditorShell");
  return context;
}
