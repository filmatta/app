"use client";

import type { Editor } from "@tiptap/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SCREENPLAY_KINDS,
  type ScreenplayKind,
} from "@/lib/writer/document";
import {
  changeWriterBlockKind,
  findWriterBlockById,
  insertWriterPlainText,
  insertWriterBlock,
  insertWriterEmptyBlock,
  replaceWriterBlockWithSceneHeading,
  writerSelectionTargetIsCurrent,
  type WriterSelectionTarget,
} from "@/lib/writer/editor-actions";
import {
  QUICK_INSERTS,
  buildSceneHeading,
} from "@/lib/writer/writing-ux";
import { parseSceneHeading } from "@/lib/writer/timeline";
import WriterIcon from "./WriterIcon";
import { WRITER_BREAKDOWN_CATEGORIES, WRITER_BREAKDOWN_CATEGORY_LABELS, type WriterBreakdownCategory } from "@/lib/writer/production";
import { normalizeManualTagSelection } from "@/lib/writer/breakdown-tagging";

export const WRITER_KIND_LABELS: Record<ScreenplayKind, string> = {
  sceneHeading: "Encabezado de escena",
  action: "Acción",
  character: "Personaje",
  dialogue: "Diálogo",
  parenthetical: "Acotación",
  transition: "Transición",
  authorNote: "Nota del autor",
};

export type WriterContextMenuState = {
  target: WriterSelectionTarget | null;
  x: number;
  y: number;
  sceneId: string | null;
  timelineReason: string | null;
  touch?: boolean;
};

export type WriterInsertState = {
  targetId: string;
  x: number;
  y: number;
  view: "menu" | "scene";
  intent: "insert" | "convert";
  expectedKind: ScreenplayKind;
  expectedText: string;
  selectionFrom: number;
  selectionTo: number;
  documentAtOpen: WriterSelectionTarget["document"];
};

export function WriterContextMenu({
  editor,
  state,
  onClose,
  onConvertSceneHeading,
  onTimeline,
  onAnalyzeScene,
  onAnalyzeSelection,
  onAssistant,
  onFeedback,
  onTagSelection,
}: {
  editor: Editor;
  state: WriterContextMenuState;
  onClose: () => void;
  onConvertSceneHeading: () => void;
  onTimeline: (sceneId: string) => void;
  onAnalyzeScene: (sceneId: string) => void;
  onAnalyzeSelection: (target: WriterSelectionTarget) => void;
  onAssistant: (sceneId: string) => void;
  onFeedback: (message: string) => void;
  onTagSelection: (target: WriterSelectionTarget, category: WriterBreakdownCategory) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: state.x, top: state.y });
  const [clipboardBusy, setClipboardBusy] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const tagTriggerRef = useRef<HTMLButtonElement>(null);
  const tagSubmenuRef = useRef<HTMLDivElement>(null);
  const [tagPosition, setTagPosition] = useState({ left: 0, top: 0 });
  const target = state.target;
  const hasValidTarget = Boolean(target);
  const currentTarget = target ? findWriterBlockById(editor, target.targetId) : null;
  const currentKind = currentTarget?.kind ?? target?.kind;
  const hasSelection = Boolean(target && target.from !== target.to);
  const hasTaggableSelection = Boolean(target && !target.multipleBlocks && currentTarget
    && normalizeManualTagSelection(currentTarget.text, target.from - currentTarget.position - 1, target.to - currentTarget.position - 1));
  const canUndo = editor.can().chain().undo().run();
  const canRedo = editor.can().chain().redo().run();

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    if (state.touch) {
      menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      return;
    }
    const rect = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(state.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(state.y, window.innerHeight - rect.height - 8)),
    });
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [state.touch, state.x, state.y, tagOpen]);

  useEffect(() => {
    const closeOnPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !tagSubmenuRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", closeOnPointer);
    return () => window.removeEventListener("pointerdown", closeOnPointer);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!tagOpen) return;
    const trigger = tagTriggerRef.current;
    const submenu = tagSubmenuRef.current;
    if (!trigger || !submenu) return;
    const anchor = trigger.getBoundingClientRect();
    const rect = submenu.getBoundingClientRect();
    setTagPosition({
      left: anchor.right + rect.width + 4 <= window.innerWidth - 8
        ? anchor.right + 4 : Math.max(8, anchor.left - rect.width - 4),
      top: Math.max(8, Math.min(anchor.top, window.innerHeight - rect.height - 8)),
    });
    submenu.querySelector<HTMLButtonElement>("button")?.focus();
  }, [tagOpen]);

  function applyKind(kind: ScreenplayKind) {
    if (!target || target.multipleBlocks) return;
    if (!contextIsCurrent()) return staleContext();
    if (kind === "sceneHeading") {
      onConvertSceneHeading();
      return;
    }
    if (!changeWriterBlockKind(editor, target.targetId, kind)) return staleContext();
    onClose();
  }

  function contextIsCurrent() {
    return Boolean(target && writerSelectionTargetIsCurrent(editor.state, target));
  }

  function staleContext() {
    onFeedback("El cursor o el documento cambió. Abre de nuevo el menú en el destino actual.");
    onClose();
  }

  async function runClipboard(action: "copy" | "cut" | "paste") {
    if (clipboardBusy) return;
    if (!target || !contextIsCurrent()) return staleContext();
    setClipboardBusy(true);
    try {
      if (!navigator.clipboard) throw new Error("El portapapeles no está disponible en este navegador.");
      if (action === "paste") {
        const text = await navigator.clipboard.readText();
        if (!contextIsCurrent()) {
          onFeedback("El destino cambió mientras se consultaba el portapapeles. No se pegó contenido.");
          return;
        }
        if (!text || !insertWriterPlainText(editor, text)) {
          onFeedback("No había texto para pegar. Usa Ctrl+V o ⌘V si el navegador bloqueó el acceso.");
          return;
        }
        onClose();
        return;
      }

      const text = target.document.textBetween(target.from, target.to, "\n");
      if (!text) return;
      await navigator.clipboard.writeText(text);
      if (action === "cut") {
        if (!contextIsCurrent()) {
          onFeedback("La selección cambió después de copiar. El texto no se eliminó.");
          return;
        }
        editor.view.dispatch(editor.state.tr.deleteSelection().scrollIntoView());
      }
      editor.commands.focus();
      onClose();
    } catch {
      onFeedback(action === "paste"
        ? "No se pudo pegar desde el menú. Usa Ctrl+V o ⌘V."
        : action === "cut"
          ? "No se pudo copiar al portapapeles; el texto no se eliminó."
          : "No se pudo copiar al portapapeles.");
      editor.commands.focus();
      onClose();
    } finally {
      setClipboardBusy(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      editor.commands.focus();
      return;
    }
    if (tagOpen && event.key === "ArrowLeft" && tagSubmenuRef.current?.contains(document.activeElement)) {
      event.preventDefault(); setTagOpen(false); tagTriggerRef.current?.focus(); return;
    }
    if (event.key === "ArrowRight" && document.activeElement === tagTriggerRef.current) {
      event.preventDefault(); setTagOpen(true); return;
    }
    if (/^[1-7]$/.test(event.key) && hasValidTarget && !target?.multipleBlocks) {
      event.preventDefault();
      applyKind(SCREENPLAY_KINDS[Number(event.key) - 1]);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [...((tagSubmenuRef.current?.contains(document.activeElement) ? tagSubmenuRef.current : menuRef.current)?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    buttons[(current + direction + buttons.length) % buttons.length]?.focus();
  }

  return (
    <div
      ref={menuRef}
      className={`writer-context-menu${state.touch ? " writer-context-menu--touch" : ""}`}
      role="menu"
      aria-label="Acciones del bloque"
      style={state.touch ? undefined : position}
      onKeyDown={handleKeyDown}
    >
      {state.touch && <div className="writer-touch-menu-head"><strong>Acciones Writer</strong><button type="button" onClick={onClose}>Cerrar</button></div>}
      <p className="writer-context-menu-label">En el cursor actual</p>
      {!target && <p className="writer-context-menu-help">Coloca el cursor en el guion para insertar.</p>}
      {!state.touch && <>
        <p className="writer-context-menu-label">Edición</p>
        <button type="button" role="menuitem" disabled={!hasValidTarget || !hasSelection || clipboardBusy} title={!hasSelection ? "Selecciona texto para cortar." : undefined} onClick={() => void runClipboard("cut")}>
          <span>Cortar</span><kbd>Ctrl/⌘ X</kbd>
        </button>
        <button type="button" role="menuitem" disabled={!hasValidTarget || !hasSelection || clipboardBusy} title={!hasSelection ? "Selecciona texto para copiar." : undefined} onClick={() => void runClipboard("copy")}>
          <span>Copiar</span><kbd>Ctrl/⌘ C</kbd>
        </button>
        <button type="button" role="menuitem" disabled={!hasValidTarget || clipboardBusy} onClick={() => void runClipboard("paste")}>
          <span>Pegar<small>Desde el menú: texto plano</small></span><kbd>Ctrl/⌘ V</kbd>
        </button>
      </>}
      <p className="writer-context-menu-label">Historial</p>
      <button type="button" role="menuitem" disabled={!hasValidTarget || !canUndo} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (!contextIsCurrent()) return staleContext(); editor.chain().focus().undo().run(); onClose(); }}>
        <span>Deshacer</span><kbd>Ctrl/⌘ Z</kbd>
      </button>
      <button type="button" role="menuitem" disabled={!hasValidTarget || !canRedo} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (!contextIsCurrent()) return staleContext(); editor.chain().focus().redo().run(); onClose(); }}>
        <span>Rehacer</span><kbd>Ctrl/⌘ ⇧ Z</kbd>
      </button>
      <p className="writer-context-menu-label">Cambiar bloque a</p>
      {target?.multipleBlocks && (
        <p className="writer-context-menu-help">Selecciona texto de un solo bloque para cambiar su tipo.</p>
      )}
      {SCREENPLAY_KINDS.map((kind, index) => (
        <button
          key={kind}
          type="button"
          role="menuitemradio"
          aria-checked={currentKind === kind}
          disabled={!hasValidTarget || target?.multipleBlocks}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyKind(kind)}
        >
          <span>{WRITER_KIND_LABELS[kind]}{currentKind === kind ? " — actual" : ""}</span>
          <kbd>{index + 1}</kbd>
        </button>
      ))}
      <div className="writer-context-menu-separator" />
      {hasTaggableSelection && target && <>
        <button ref={tagTriggerRef} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={tagOpen} onMouseDown={(event) => event.preventDefault()} onClick={() => setTagOpen((open) => !open)}><span><WriterIcon name="tag" size={14} /> Etiquetar como</span><span aria-hidden="true">▸</span></button>
        {tagOpen && createPortal(<div ref={tagSubmenuRef} className="writer-context-tag-categories" role="menu" aria-label="Categorías de Breakdown" style={tagPosition}>
          {WRITER_BREAKDOWN_CATEGORIES.map((category) => <button key={category} type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => { if (!contextIsCurrent()) return staleContext(); onTagSelection(target, category); onClose(); }}>{WRITER_BREAKDOWN_CATEGORY_LABELS[category]}</button>)}
        </div>, menuRef.current?.closest(".writer-workspace") ?? document.body)}
      </>}
      {hasSelection && target && <button type="button" role="menuitem" onClick={() => contextIsCurrent() ? onAnalyzeSelection(target) : staleContext()}>
        <span className="writer-smart-indicator"><WriterIcon name="sparkle" size={14} /><span>Analizar selección</span></span><small>Usar sólo el fragmento y su contexto cercano</small>
      </button>}
      <button type="button" role="menuitem" disabled={!hasValidTarget || !state.sceneId} title={state.timelineReason ?? undefined} onClick={() => state.sceneId && (contextIsCurrent() ? onAnalyzeScene(state.sceneId) : staleContext())}>
        <span>Analizar escena</span><small>Objective · Obstacle · Change</small>
      </button>
      <button type="button" role="menuitem" disabled={!hasValidTarget || !state.sceneId} title={state.timelineReason ?? undefined} onClick={() => state.sceneId && (contextIsCurrent() ? onAssistant(state.sceneId) : staleContext())}>
        <span>Ver Asistente</span><small>Abrir O-O-C y observaciones narrativas</small>
      </button>
      <button type="button" role="menuitem" disabled={!hasValidTarget || !state.sceneId} title={state.timelineReason ?? undefined} onClick={() => state.sceneId && (contextIsCurrent() ? onTimeline(state.sceneId) : staleContext())}>
        <span>Ver en línea de tiempo</span><small>{state.timelineReason ?? "Abrir la escena guardada"}</small>
      </button>
      <p className="writer-context-menu-shortcut">Abrir: Mayús+F10 · Menú contextual</p>
    </div>
  );
}
export function WriterTagMenu({
  x, y, anchorTop, selectedName, existingCategories, onChoose, onClose,
}: {
  x: number; y: number; anchorTop: number; selectedName: string;
  existingCategories: readonly WriterBreakdownCategory[];
  onChoose: (category: WriterBreakdownCategory) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    if (!returnFocusRef.current && document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement;
    const rect = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: y + rect.height + 8 <= window.innerHeight
        ? y : Math.max(8, anchorTop - rect.height - 5),
    });
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }, [anchorTop, x, y]);
  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); returnFocusRef.current?.focus({ preventScroll: true }); }
    };
    window.addEventListener("pointerdown", pointer);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("pointerdown", pointer); window.removeEventListener("keydown", key, true); };
  }, [onClose]);
  return <div ref={menuRef} className="writer-tag-menu" role="menu" aria-label="Etiquetar como" style={position} onMouseDown={(event) => event.preventDefault()} onKeyDown={(event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }}>
    <p className="writer-context-menu-label">Etiquetar como</p>
    <p className="writer-tag-selected">{selectedName}</p>
    {WRITER_BREAKDOWN_CATEGORIES.map((category) => <button type="button" key={category} role="menuitem" onClick={() => { onChoose(category); returnFocusRef.current?.focus({ preventScroll: true }); }}><span>{WRITER_BREAKDOWN_CATEGORY_LABELS[category]}</span>{existingCategories.includes(category) && <small>Añadir aparición</small>}</button>)}
  </div>;
}

export function WriterInsertPanel({
  editor,
  state,
  onClose,
}: {
  editor: Editor;
  state: WriterInsertState;
  onClose: () => void;
}) {
  const target = findWriterBlockById(editor, state.targetId);
  const [sceneOpen, setSceneOpen] = useState(state.view === "scene");
  const [conventionsOpen, setConventionsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: state.x, top: state.y });

  useLayoutEffect(() => {
    if (sceneOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(state.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(state.y, window.innerHeight - rect.height - 8)),
    });
    panel.querySelector<HTMLButtonElement>("button")?.focus();
  }, [conventionsOpen, sceneOpen, state.x, state.y]);

  useEffect(() => {
    if (sceneOpen) return;
    const closeOnPointer = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", closeOnPointer);
    return () => window.removeEventListener("pointerdown", closeOnPointer);
  }, [onClose, sceneOpen]);

  if (sceneOpen) {
    return (
      <SceneHeadingDialog
        editor={editor}
        targetId={state.targetId}
        intent={state.intent}
        expectedKind={state.expectedKind}
        original={state.expectedText}
        selectionFrom={state.selectionFrom}
        selectionTo={state.selectionTo}
        documentAtOpen={state.documentAtOpen}
        onBack={state.intent === "insert" && state.view === "menu" ? () => setSceneOpen(false) : undefined}
        onClose={onClose}
      />
    );
  }
  if (!target) return null;

  function insertQuick(kind: ScreenplayKind, text: string) {
    if (editor.state.doc !== state.documentAtOpen
      || editor.state.selection.from !== state.selectionFrom
      || editor.state.selection.to !== state.selectionTo
      || target?.kind !== state.expectedKind
      || target?.text !== state.expectedText) {
      onClose();
      return;
    }
    insertWriterBlock(editor, state.targetId, kind, text);
    onClose();
  }

  function insertKind(kind: ScreenplayKind) {
    if (kind === "sceneHeading") {
      setSceneOpen(true);
      return;
    }
    if (editor.state.doc !== state.documentAtOpen
      || editor.state.selection.from !== state.selectionFrom
      || editor.state.selection.to !== state.selectionTo
      || target?.kind !== state.expectedKind
      || target?.text !== state.expectedText) {
      onClose();
      return;
    }
    insertWriterEmptyBlock(editor, state.targetId, kind);
    onClose();
  }

  return (
    <div
      ref={panelRef}
      className="writer-insert-panel"
      role="dialog"
      aria-label="Insertar en el guion"
      style={position}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          editor.commands.focus();
        }
      }}
    >
      <div className="writer-insert-panel-head"><strong>Insertar</strong><button type="button" onClick={onClose}>Cerrar</button></div>
      {!conventionsOpen ? <>
        <p className="writer-context-menu-label">Elementos</p>
        {SCREENPLAY_KINDS.map((kind) => (
          <button key={kind} className={kind === "sceneHeading" ? "writer-insert-scene" : undefined} type="button" onClick={() => insertKind(kind)}>
            <span><strong>{WRITER_KIND_LABELS[kind]}</strong><small>{kind === "sceneHeading" ? "Construir encabezado" : "Insertar bloque vacío"}</small></span><span aria-hidden="true">+</span>
          </button>
        ))}
        <div className="writer-context-menu-separator" />
        <button className="writer-insert-conventions" type="button" aria-haspopup="menu" onClick={() => setConventionsOpen(true)}>
          <span><strong>Convenciones</strong><small>Transiciones y marcas compatibles</small></span><span aria-hidden="true">›</span>
        </button>
      </> : <>
        <button className="writer-insert-back" type="button" onClick={() => setConventionsOpen(false)}><span>← Convenciones</span></button>
        {QUICK_INSERTS.map((item) => (
          <button key={item.text} type="button" onClick={() => insertQuick(item.kind, item.text)}>
            <span><strong>{item.text}</strong><small>{WRITER_KIND_LABELS[item.kind]}</small></span><span aria-hidden="true">+</span>
          </button>
        ))}
      </>}
    </div>
  );
}
function SceneHeadingDialog({
  editor,
  targetId,
  intent,
  expectedKind,
  original,
  selectionFrom,
  selectionTo,
  documentAtOpen,
  onBack,
  onClose,
}: {
  editor: Editor;
  targetId: string;
  intent: WriterInsertState["intent"];
  expectedKind: ScreenplayKind;
  original: string;
  selectionFrom: number;
  selectionTo: number;
  documentAtOpen: WriterSelectionTarget["document"];
  onBack?: () => void;
  onClose: () => void;
}) {
  const [initial] = useState(() => sceneHeadingDialogDefaults(intent, original));
  const [environment, setEnvironment] = useState(initial.environment);
  const [place, setPlace] = useState(initial.place);
  const [momentChoice, setMomentChoice] = useState(initial.momentChoice);
  const [customMoment, setCustomMoment] = useState(initial.customMoment);
  const [error, setError] = useState<string | null>(null);
  const moment = momentChoice === "OTRO" ? customMoment : momentChoice;
  const preview = buildSceneHeading(environment, place, moment);

  function confirm() {
    if (!preview) return;
    const target = findWriterBlockById(editor, targetId);
    if (!target || editor.state.doc !== documentAtOpen
      || editor.state.selection.from !== selectionFrom
      || editor.state.selection.to !== selectionTo) {
      setError("El bloque objetivo ya no existe. No se aplicó ningún cambio.");
      return;
    }
    if (target.kind !== expectedKind || target.text !== original) {
      setError("El bloque objetivo cambió mientras el diálogo estaba abierto. Revisa el texto antes de intentarlo de nuevo.");
      return;
    }
    if (intent === "convert") {
      const result = replaceWriterBlockWithSceneHeading(editor, targetId, { kind: expectedKind, text: original }, preview);
      if (result === "missing" || result === "changed") {
        setError("El bloque objetivo cambió mientras el diálogo estaba abierto. No se aplicó el encabezado.");
        return;
      }
    } else if (!insertWriterBlock(editor, targetId, "sceneHeading", preview, { forceNew: true })) {
      setError("No se pudo insertar el encabezado en el destino original.");
      return;
    }
    onClose();
  }

  function cancel() {
    if (editor.state.doc === documentAtOpen) {
      editor.chain().focus().setTextSelection({ from: selectionFrom, to: selectionTo }).run();
    }
    onClose();
  }

  return (
    <div className="writer-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) cancel();
    }}>
      <section
        className="writer-modal writer-scene-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="writer-scene-dialog-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
        }}
      >
        <p className="writer-eyebrow">{intent === "convert" ? "Conversión asistida" : "Inserción asistida"}</p>
        <h2 id="writer-scene-dialog-title">{intent === "convert" ? "Configurar encabezado de escena" : "Nueva escena"}</h2>
        {original && <p className="writer-scene-original"><strong>Texto actual del bloque</strong><span>{original}</span></p>}
        {intent === "convert" && selectionFrom !== selectionTo && (
          <p className="writer-context-menu-help">La conversión sustituirá el bloque completo, no sólo la selección.</p>
        )}
        <div className="writer-scene-fields">
          <label>Entorno<select value={environment} onChange={(event) => setEnvironment(event.target.value)} autoFocus>
            <option value="" disabled>Seleccionar</option>
            <option>INT.</option><option>EXT.</option><option>INT./EXT.</option>
          </select></label>
          <label>Lugar<input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Escribe el lugar" /></label>
          <label>Momento<select value={momentChoice} onChange={(event) => setMomentChoice(event.target.value)}>
            <option value="" disabled>Seleccionar</option>
            {['DÍA', 'NOCHE', 'AMANECER', 'ATARDECER', 'CONTINUO'].map((item) => <option key={item}>{item}</option>)}
            <option value="OTRO">Otro…</option>
          </select></label>
          {momentChoice === "OTRO" && <label>Otro momento<input value={customMoment} onChange={(event) => setCustomMoment(event.target.value)} /></label>}
        </div>
        <div className="writer-scene-preview"><small>Vista previa · Encabezado de escena</small><strong>{preview || "Completa lugar y momento"}</strong></div>
        {intent === "convert" && <p className="writer-context-menu-help">Al confirmar, el bloque conservará su identificador y el cambio podrá deshacerse.</p>}
        {error && <p className="writer-context-menu-help" role="status">{error}</p>}
        <div className="writer-modal-actions">
          {onBack && <button type="button" onClick={onBack}>Atrás</button>}
          <button type="button" onClick={cancel}>Cancelar</button>
          <button className="writer-primary-button" type="button" onClick={confirm} disabled={!preview}>
            {intent === "convert" ? "Convertir bloque" : "Insertar encabezado"}
          </button>
        </div>
      </section>
    </div>
  );
}

const SCENE_MOMENTS = new Set(["DÍA", "NOCHE", "AMANECER", "ATARDECER", "CONTINUO"]);

function sceneHeadingDialogDefaults(intent: WriterInsertState["intent"], original: string) {
  if (original.trim()) {
    const parsed = parseSceneHeading(original);
    if (parsed.environment !== "unknown" && parsed.location && parsed.moment) {
      const normalizedMoment = parsed.moment.toLocaleUpperCase("es-MX");
      return {
        environment: parsed.environment === "interior" ? "INT." : parsed.environment === "exterior" ? "EXT." : "INT./EXT.",
        place: parsed.location,
        momentChoice: SCENE_MOMENTS.has(normalizedMoment) ? normalizedMoment : "OTRO",
        customMoment: SCENE_MOMENTS.has(normalizedMoment) ? "" : parsed.moment,
      };
    }
  }
  return intent === "insert"
    ? { environment: "INT.", place: "", momentChoice: "DÍA", customMoment: "" }
    : { environment: "", place: "", momentChoice: "", customMoment: "" };
}
