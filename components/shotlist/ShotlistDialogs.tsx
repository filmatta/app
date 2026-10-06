"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";

function DialogFrame({ open, title, eyebrow, onClose, children, footer, initialFocus }: { open: boolean; title: string; eyebrow?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; initialFocus?: React.RefObject<HTMLElement | null> }) {
  const dialog = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => [...element.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')];
    window.requestAnimationFrame(() => (initialFocus?.current ?? controls()[0])?.focus());
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = controls();
      if (!items.length) return;
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      window.requestAnimationFrame(() => returnFocus.current?.focus());
    };
  }, [initialFocus, open]);
  if (!open) return null;
  return <div className="shotlist-dialog-layer" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="shotlist-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><div>{eyebrow && <p>{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></header>
      <div className="shotlist-dialog-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  </div>;
}

export function NewSceneDialog({ open, anchorLabel, busy, onClose, onCreate }: { open: boolean; anchorLabel?: string | null; busy: boolean; onClose: () => void; onCreate: (title: string) => void }) {
  const [title, setTitle] = useState("Escena manual");
  const input = useRef<HTMLInputElement>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value || busy) return;
    setTitle("Escena manual");
    onCreate(value);
  }
  function close() { setTitle("Escena manual"); onClose(); }
  return <DialogFrame open={open} title="Nueva escena" eyebrow="SHOTLIST" onClose={close} initialFocus={input} footer={<><button type="button" className="is-secondary" onClick={close}>Cancelar</button><button type="submit" form="shotlist-new-scene" disabled={busy || !title.trim()}>{busy ? "Creando…" : "Crear"}</button></>}>
    <form id="shotlist-new-scene" onSubmit={submit}>
      {anchorLabel && <p className="shotlist-dialog-context">Se insertará después de {anchorLabel}.</p>}
      <label>Nombre<input ref={input} value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} required /></label>
      <p className="shotlist-dialog-note">Crea un grupo manual en Shotlist. No añade ni modifica una escena en Writer.</p>
    </form>
  </DialogFrame>;
}

export function StoryboardCreateDialog({ open, shotlistId, onClose }: { open: boolean; shotlistId: string; onClose: () => void }) {
  return <DialogFrame open={open} title="Crear storyboard" eyebrow="SIN IA" onClose={onClose} footer={<><button type="button" className="is-secondary" onClick={onClose}>Cancelar</button><Link className="shotlist-dialog-link" href={`/shotlists/${shotlistId}/storyboard`}>Crear espacio</Link></>}>
    <p>Se abrirá un tablero vacío para dibujar o subir referencias a tus planos.</p>
    <p className="shotlist-dialog-note">Esta acción no genera imágenes, no ejecuta IA y no consume créditos.</p>
  </DialogFrame>;
}

export function ShotlistHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <DialogFrame open={open} title="Atajos y navegación" eyebrow="AYUDA" onClose={onClose} footer={<button type="button" onClick={onClose}>Entendido</button>}>
    <dl className="shotlist-shortcuts"><div><dt>Tab / Mayús + Tab</dt><dd>Recorrer controles, inserciones y menús.</dd></div><div><dt>Enter</dt><dd>Abrir la fila o confirmar un formulario.</dd></div><div><dt>↑ / ↓</dt><dd>Cambiar de plano cuando la fila tiene foco.</dd></div><div><dt>Escape</dt><dd>Cerrar menú o diálogo y volver al control anterior.</dd></div></dl>
    <p className="shotlist-dialog-note">En dispositivos sin hover, las acciones de inserción también están disponibles en Añadir y en los menús ⋮.</p>
  </DialogFrame>;
}

export function ConfirmDialog({ open, title, description, confirmLabel, danger = false, busy = false, onClose, onConfirm }: { open: boolean; title: string; description: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onClose: () => void; onConfirm: () => void }) {
  return <DialogFrame open={open} title={title} onClose={onClose} footer={<><button type="button" className="is-secondary" onClick={onClose}>Cancelar</button><button type="button" className={danger ? "is-danger" : ""} disabled={busy} onClick={onConfirm}>{busy ? "Procesando…" : confirmLabel}</button></>}><div>{description}</div></DialogFrame>;
}

export { DialogFrame };
