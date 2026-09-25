"use client";

import type { Editor } from "@tiptap/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  SCREENPLAY_KINDS,
  deriveCharacters,
  type ScreenplayKind,
  type WriterDocument,
} from "@/lib/writer/document";
import {
  changeWriterBlockKind,
  findWriterBlockById,
  insertWriterBlock,
} from "@/lib/writer/editor-actions";
import {
  QUICK_INSERTS,
  buildSceneHeading,
  countTextualMentions,
  deriveCharacterWritingMetrics,
} from "@/lib/writer/writing-ux";

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
  targetId: string;
  kind: ScreenplayKind;
  x: number;
  y: number;
  multipleBlocks: boolean;
};

export type WriterInsertState = {
  targetId: string;
  x: number;
  y: number;
  view: "menu" | "scene";
};

export function WriterContextMenu({
  editor,
  state,
  onClose,
  onInsert,
}: {
  editor: Editor;
  state: WriterContextMenuState;
  onClose: () => void;
  onInsert: (view: WriterInsertState["view"]) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: state.x, top: state.y });
  const currentTarget = findWriterBlockById(editor, state.targetId);
  const currentKind = currentTarget?.kind ?? state.kind;

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(state.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(state.y, window.innerHeight - rect.height - 8)),
    });
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [state.x, state.y]);

  useEffect(() => {
    const closeOnPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", closeOnPointer);
    return () => window.removeEventListener("pointerdown", closeOnPointer);
  }, [onClose]);

  function applyKind(kind: ScreenplayKind) {
    if (state.multipleBlocks) return;
    if (!changeWriterBlockKind(editor, state.targetId, kind)) return onClose();
    onClose();
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
    if (/^[1-7]$/.test(event.key) && !state.multipleBlocks) {
      event.preventDefault();
      applyKind(SCREENPLAY_KINDS[Number(event.key) - 1]);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    buttons[(current + direction + buttons.length) % buttons.length]?.focus();
  }

  return (
    <div
      ref={menuRef}
      className="writer-context-menu"
      role="menu"
      aria-label="Acciones del bloque"
      style={position}
      onKeyDown={handleKeyDown}
    >
      <p className="writer-context-menu-label">Tipo de bloque</p>
      {state.multipleBlocks && (
        <p className="writer-context-menu-help">Selecciona texto de un solo bloque para cambiar su tipo.</p>
      )}
      {SCREENPLAY_KINDS.map((kind, index) => (
        <button
          key={kind}
          type="button"
          role="menuitemradio"
          aria-checked={currentKind === kind}
          disabled={state.multipleBlocks}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyKind(kind)}
        >
          <span>{WRITER_KIND_LABELS[kind]}{currentKind === kind ? " — actual" : ""}</span>
          <kbd>{index + 1}</kbd>
        </button>
      ))}
      <div className="writer-context-menu-separator" />
      <button type="button" role="menuitem" onClick={() => onInsert("scene")}>
        <span>Nueva escena…</span><small>Insertar</small>
      </button>
      <button type="button" role="menuitem" onClick={() => onInsert("menu")}>
        <span>Inserciones rápidas…</span><small>Insertar</small>
      </button>
      <p className="writer-context-menu-shortcut">Abrir: Mayús+F10 · Menú contextual</p>
    </div>
  );
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
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: state.x, top: state.y });

  useEffect(() => {
    if (!target) onClose();
  }, [onClose, target]);

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
  }, [sceneOpen, state.x, state.y]);

  useEffect(() => {
    if (sceneOpen) return;
    const closeOnPointer = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", closeOnPointer);
    return () => window.removeEventListener("pointerdown", closeOnPointer);
  }, [onClose, sceneOpen]);

  if (!target) return null;
  if (sceneOpen) {
    return (
      <SceneHeadingDialog
        editor={editor}
        targetId={state.targetId}
        original={target.kind === "sceneHeading" ? target.text : ""}
        onBack={state.view === "menu" ? () => setSceneOpen(false) : undefined}
        onClose={onClose}
      />
    );
  }

  function insertQuick(kind: ScreenplayKind, text: string) {
    insertWriterBlock(editor, state.targetId, kind, text);
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
      <button className="writer-insert-scene" type="button" onClick={() => setSceneOpen(true)}>
        <span><strong>Nueva escena</strong><small>Construir un encabezado</small></span><span aria-hidden="true">→</span>
      </button>
      <p className="writer-context-menu-label">Convenciones rápidas</p>
      {QUICK_INSERTS.map((item) => (
        <button key={item.text} type="button" onClick={() => insertQuick(item.kind, item.text)}>
          <span><strong>{item.text}</strong><small>{WRITER_KIND_LABELS[item.kind]}</small></span><span aria-hidden="true">+</span>
        </button>
      ))}
    </div>
  );
}

function SceneHeadingDialog({
  editor,
  targetId,
  original,
  onBack,
  onClose,
}: {
  editor: Editor;
  targetId: string;
  original: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  const [environment, setEnvironment] = useState("INT.");
  const [place, setPlace] = useState("");
  const [momentChoice, setMomentChoice] = useState("DÍA");
  const [customMoment, setCustomMoment] = useState("");
  const moment = momentChoice === "OTRO" ? customMoment : momentChoice;
  const preview = buildSceneHeading(environment, place, moment);

  function confirm() {
    if (!preview) return;
    insertWriterBlock(editor, targetId, "sceneHeading", preview, { replaceExistingSceneHeading: true });
    onClose();
  }

  return (
    <div className="writer-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
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
            onClose();
            editor.commands.focus();
          }
        }}
      >
        <p className="writer-eyebrow">Inserción asistida</p>
        <h2 id="writer-scene-dialog-title">Nueva escena</h2>
        {original && <p className="writer-scene-original"><strong>Encabezado actual</strong><span>{original}</span></p>}
        <div className="writer-scene-fields">
          <label>Entorno<select value={environment} onChange={(event) => setEnvironment(event.target.value)} autoFocus>
            <option>INT.</option><option>EXT.</option><option>INT./EXT.</option>
          </select></label>
          <label>Lugar<input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Escribe el lugar" /></label>
          <label>Momento<select value={momentChoice} onChange={(event) => setMomentChoice(event.target.value)}>
            {['DÍA', 'NOCHE', 'AMANECER', 'ATARDECER', 'CONTINUO'].map((item) => <option key={item}>{item}</option>)}
            <option value="OTRO">Otro…</option>
          </select></label>
          {momentChoice === "OTRO" && <label>Otro momento<input value={customMoment} onChange={(event) => setCustomMoment(event.target.value)} /></label>}
        </div>
        <div className="writer-scene-preview"><small>Vista previa · Encabezado de escena</small><strong>{preview || "Completa lugar y momento"}</strong></div>
        {original && <p className="writer-context-menu-help">Al confirmar, este encabezado se actualizará y conservará su identificador.</p>}
        <div className="writer-modal-actions">
          {onBack && <button type="button" onClick={onBack}>Atrás</button>}
          <button type="button" onClick={onClose}>Cancelar</button>
          <button className="writer-primary-button" type="button" onClick={confirm} disabled={!preview}>Insertar encabezado</button>
        </div>
      </section>
    </div>
  );
}

export function WriterCharacterPanel({ document }: { document: WriterDocument }) {
  const metrics = useMemo(() => deriveCharacterWritingMetrics(document), [document]);
  const characters = useMemo(() => deriveCharacters(document), [document]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = metrics.find((character) => character.key === selectedKey) ?? null;
  const mentions = useMemo(
    () => selected ? countTextualMentions(document, selected.key, characters) : 0,
    [characters, document, selected],
  );

  return (
    <section className="writer-character-section" aria-labelledby="writer-character-heading">
      <p id="writer-character-heading" className="writer-sidebar-heading">Personajes identificados <span>{metrics.length}</span></p>
      {metrics.length ? (
        <ul>{metrics.map((character) => (
          <li key={character.key}>
            <button type="button" onClick={() => setSelectedKey(character.key)} aria-expanded={selectedKey === character.key}>
              <strong>{character.name}</strong>
              <span>{character.interventions} interv. · {character.sceneInterventions} escenas</span>
            </button>
          </li>
        ))}</ul>
      ) : <p className="writer-sidebar-empty">Los nombres aparecerán al usar bloques de personaje.</p>}
      {selected && (
        <div className="writer-character-detail">
          <div><strong>{selected.name}</strong><button type="button" onClick={() => setSelectedKey(null)}>Cerrar</button></div>
          <dl>
            <div><dt>Intervenciones con diálogo</dt><dd>{selected.interventions}</dd></div>
            <div><dt>Escenas con intervención</dt><dd>{selected.sceneInterventions}</dd></div>
            <div><dt>Menciones textuales</dt><dd>{mentions}</dd></div>
          </dl>
          <p>Menciones en Acción y Diálogo; no equivalen a presencia en escena. Las intervenciones requieren diálogo asociado y las escenas cuentan encabezados distintos.</p>
        </div>
      )}
    </section>
  );
}
