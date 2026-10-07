"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useWriterPopoverDismissal } from "@/components/writer/useWriterPopoverDismissal";

export default function ShotlistBadgeSelect({
  label,
  value,
  options,
  onChange,
  allowCustom = true,
  nullable = false,
  compact = false,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (value: string | null) => void;
  allowCustom?: boolean;
  nullable?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>();
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  useWriterPopoverDismissal({ open, rootRef: root, triggerRef: trigger, onDismiss: () => setOpen(false) });
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(230, rect.width), window.innerWidth - 16);
      const height = Math.min(popover.current?.offsetHeight ?? 360, window.innerHeight - 16);
      const below = window.innerHeight - rect.bottom - 8;
      const top = below >= height || below >= rect.top - 8 ? rect.bottom + 5 : rect.top - height - 5;
      setPosition({ top: Math.max(8, Math.min(top, window.innerHeight - height - 8)), left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, maxHeight: window.innerHeight - 16 });
    };
    reposition();
    const frame = window.requestAnimationFrame(reposition);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open]);
  const choices = useMemo(() => {
    const current = value && !options.includes(value) ? [value] : [];
    const normalized = query.trim().toLocaleLowerCase("es-MX");
    return [...current, ...options].filter((candidate, index, all) => all.indexOf(candidate) === index && (!normalized || candidate.toLocaleLowerCase("es-MX").includes(normalized)));
  }, [options, query, value]);
  const color = badgeColor(value || label);

  function choose(next: string | null) {
    setOpen(false);
    setQuery("");
    setCustom("");
    onChange(next);
  }

  return <div ref={root} className={`shotlist-badge-select${compact ? " is-compact" : ""}`} onClick={(event) => event.stopPropagation()}>
    <button ref={trigger} type="button" className="shotlist-badge-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${value || "vacío"}`} style={{ "--badge-hue": color } as CSSProperties} onClick={() => setOpen((current) => !current)}><span>{value || "—"}</span><i aria-hidden="true">⌄</i></button>
    {open && position && createPortal(<div ref={popover} className="shotlist-badge-popover is-portal" style={position} role="listbox" aria-label={label} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      {options.length > 8 && <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar ${label.toLocaleLowerCase("es-MX")}…`} aria-label={`Buscar ${label}`} />}
      <div className="shotlist-badge-options">
        {nullable && <button type="button" role="option" aria-selected={!value} onClick={() => choose(null)}>Sin valor</button>}
        {choices.map((option) => <button key={option} type="button" role="option" aria-selected={value === option} style={{ "--badge-hue": badgeColor(option) } as CSSProperties} onClick={() => choose(option)}><span>{option}</span>{value === option && <i>✓</i>}</button>)}
        {!choices.length && <p>Sin coincidencias.</p>}
      </div>
      {allowCustom && <form onSubmit={(event) => { event.preventDefault(); const next = custom.trim(); if (next) choose(next); }}><label>Personalizada<input value={custom} maxLength={80} onChange={(event) => setCustom(event.target.value)} placeholder="Escribe un valor" /></label><button type="submit" disabled={!custom.trim()}>Usar</button></form>}
    </div>, document.body)}
  </div>;
}

function badgeColor(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) % 360;
  return String(hash);
}
