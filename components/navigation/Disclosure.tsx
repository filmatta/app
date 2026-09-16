"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export default function Disclosure({ label, active = false, align = "left", children }: {
  label: string; active?: boolean; align?: "left" | "right"; children: ReactNode;
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
  return <div ref={root} className="relative" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(!open)} className={`nav-trigger ${active ? "nav-active" : ""}`}>
      {label}<span aria-hidden="true" className="ml-1.5 text-xs text-white/50">{open ? "−" : "⌄"}</span>
    </button>
    {open && <div id={id} className={`nav-disclosure ${align === "right" ? "right-0" : "left-0"}`}
      onClick={event => { if ((event.target as HTMLElement).closest("a")) setOpen(false); }}>{children}</div>}
  </div>;
}
