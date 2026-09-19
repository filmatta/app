"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export default function Disclosure({ label, leading, active = false, align = "left", panelClassName = "", onOpen, children }: {
  label: string; leading?: ReactNode; active?: boolean; align?: "left" | "right"; panelClassName?: string; onOpen?: () => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return <div ref={root} className="nav-disclosure-root relative" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <button id={`${id}-trigger`} ref={trigger} type="button" aria-expanded={open} aria-controls={id}
      onClick={() => { if (!open) onOpen?.(); setOpen(!open); }} className={`nav-trigger ${active ? "nav-active" : ""}`}>
      {leading}
      <span>{label}</span>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="nav-caret" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </button>
    <div id={id} aria-labelledby={`${id}-trigger`} hidden={!open} className={`nav-disclosure ${align === "right" ? "right-0" : "left-0"} ${panelClassName}`}
      onClick={event => { if ((event.target as HTMLElement).closest("a")) setOpen(false); }}>{children}</div>
  </div>;
}
