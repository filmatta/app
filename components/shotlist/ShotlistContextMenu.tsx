"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function ShotlistContextMenu({ position, count, canPaste, onClose, onCopy, onPaste, onDuplicate, onDelete }: {
  position: { x: number; y: number } | null;
  count: number;
  canPaste: boolean;
  onClose: (restoreFocus?: boolean) => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!position) return;
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) onClose(); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(true); return; }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      event.preventDefault();
    };
    const dismiss = () => onClose();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", keyboard, true); window.removeEventListener("resize", dismiss); window.removeEventListener("scroll", dismiss, true); };
  }, [position, onClose]);
  if (!position) return null;
  const width = Math.min(250, window.innerWidth - 16);
  const x = Math.max(8, Math.min(position.x, window.innerWidth - width - 8));
  const y = Math.max(8, Math.min(position.y, window.innerHeight - 168));
  function run(action: () => void) { onClose(); action(); }
  return createPortal(<div ref={root} className="shotlist-context-menu shotlist-scroll" role="menu" aria-label="Acciones de planos" style={{ left: x, top: y, width, maxHeight: Math.max(96, window.innerHeight - 16) }}>
    <button type="button" role="menuitem" disabled={!count} onClick={() => run(onCopy)}>Copiar {count > 1 ? `(${count})` : ""}</button>
    <button type="button" role="menuitem" disabled={!canPaste} title={canPaste ? undefined : "Copia planos de esta Shotlist antes de pegar"} aria-label={canPaste ? undefined : "Pegar. Copia planos de esta Shotlist antes de pegar"} onClick={() => run(onPaste)}>Pegar</button>
    <button type="button" role="menuitem" disabled={!count || count > 50} title={count > 50 ? "Duplica hasta 50 planos por operación" : undefined} aria-label={count > 50 ? `Duplicar (${count}). Duplica hasta 50 planos por operación` : undefined} onClick={() => run(onDuplicate)}>Duplicar {count > 1 ? `(${count})` : ""}</button>
    <span role="separator" />
    <button type="button" role="menuitem" className="is-danger" disabled={!count || count > 500} title={count > 500 ? "Elimina hasta 500 planos por operación" : undefined} aria-label={count > 500 ? `Eliminar (${count}). Elimina hasta 500 planos por operación` : undefined} onClick={() => run(onDelete)}>Eliminar {count > 1 ? `(${count})` : ""}</button>
  </div>, document.body);
}
