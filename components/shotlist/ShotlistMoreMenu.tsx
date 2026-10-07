"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
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
  onAddShot,
  onInsertScene,
}: {
  label: string;
  canOpenWriter: boolean;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste?: () => void;
  pasteDisabled?: boolean;
  onOpenWriter?: () => void;
  onDelete: () => void;
  onAddShot?: () => void;
  onInsertScene?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useWriterPopoverDismissal({ open, rootRef: root, triggerRef: trigger, onDismiss: () => setOpen(false) });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(250, window.innerWidth - 16);
      const height = menu.current?.scrollHeight ?? 220;
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const maxHeight = Math.max(96, Math.min(height, Math.max(below, above)));
      const top = below >= Math.min(height, 160) || below >= above ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4);
      setPosition({ top: Math.min(top, window.innerHeight - maxHeight - 8), left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), width, maxHeight });
    };
    place();
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  function run(action: () => void) { setOpen(false); action(); }
  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - Math.min(250, window.innerWidth - 16)) });
    setOpen((current) => !current);
  }
  return <div className="shotlist-more" ref={root} onClick={(event) => event.stopPropagation()}>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>⋮</button>
    {open && position && createPortal(<div ref={menu} role="menu" className="shotlist-more-popover is-portal shotlist-scroll" style={position} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      event.preventDefault();
    }}>
      <button type="button" role="menuitem" onClick={() => run(onCopy)}>Copiar</button>
      {onPaste && <button type="button" role="menuitem" disabled={pasteDisabled} title={pasteDisabled ? "Copia planos en esta Shotlist antes de pegar" : undefined} aria-label={pasteDisabled ? "Pegar. Copia planos en esta Shotlist antes de pegar" : undefined} onClick={() => run(onPaste)}>Pegar</button>}
      <button type="button" role="menuitem" onClick={() => run(onDuplicate)}>Duplicar</button>
      <span role="separator" />
      {onAddShot && <button type="button" role="menuitem" onClick={() => run(onAddShot)}>Añadir plano</button>}
      {onInsertScene && <button type="button" role="menuitem" onClick={() => run(onInsertScene)}>Nueva escena…</button>}
      <span role="separator" />
      <button type="button" role="menuitem" disabled={!canOpenWriter} onClick={() => onOpenWriter && run(onOpenWriter)}>Ver en guion</button>
      <span role="separator" />
      <button type="button" role="menuitem" className="is-danger" onClick={() => run(onDelete)}>Eliminar</button>
    </div>, document.body)}
  </div>;
}
