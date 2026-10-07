"use client";

import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useWriterPopoverDismissal } from "@/components/writer/useWriterPopoverDismissal";

export default function ShotlistMoreMenu({
  label,
  canOpenWriter,
  onDuplicate,
  onCopy,
  onPaste,
  pasteDisabled = false,
  onOpenWriter,
  onDelete,
  onInsertAfter,
}: {
  label: string;
  canOpenWriter: boolean;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste?: () => void;
  pasteDisabled?: boolean;
  onOpenWriter?: () => void;
  onDelete: () => void;
  onInsertAfter?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useWriterPopoverDismissal({ open, rootRef: root, triggerRef: trigger, onDismiss: () => setOpen(false) });
  function run(action: () => void) { setOpen(false); action(); }
  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ top: Math.min(rect.bottom + 5, window.innerHeight - 225), left: Math.max(8, Math.min(rect.right - 175, window.innerWidth - 183)) });
    setOpen((current) => !current);
  }
  return <div className="shotlist-more" ref={root} onClick={(event) => event.stopPropagation()}>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>⋮</button>
    {open && position && createPortal(<div role="menu" className="shotlist-more-popover is-portal" style={position} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      {onInsertAfter && <button type="button" role="menuitem" onClick={() => run(onInsertAfter)}>Añadir después</button>}
      <button type="button" role="menuitem" onClick={() => run(onDuplicate)}>Duplicar</button>
      <button type="button" role="menuitem" onClick={() => run(onCopy)}>Copiar</button>
      {onPaste && <button type="button" role="menuitem" disabled={pasteDisabled} title={pasteDisabled ? "Copia planos en esta Shotlist antes de pegar" : undefined} onClick={() => run(onPaste)}>Pegar después</button>}
      <button type="button" role="menuitem" disabled={!canOpenWriter} onClick={() => onOpenWriter && run(onOpenWriter)}>Ver en guion</button>
      <span role="separator" />
      <button type="button" role="menuitem" className="is-danger" onClick={() => run(onDelete)}>Eliminar</button>
    </div>, document.body)}
  </div>;
}
