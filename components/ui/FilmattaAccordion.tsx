"use client";
import { useId, useState, type ReactNode } from "react";
export default function FilmattaAccordion({ title, summary, children, defaultOpen = false, open, onOpenChange, className = "", icon, closedLabel, openLabel }: { title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (value: boolean) => void; className?: string; icon?: ReactNode; closedLabel?: string; openLabel?: string }) {
  const id = useId(), [local, setLocal] = useState(defaultOpen), expanded = open ?? local;
  return <section className={`filmatta-accordion ${className}`} data-open={expanded}>
    <button type="button" id={`${id}-trigger`} className="filmatta-accordion-trigger" aria-expanded={expanded} aria-controls={id} onClick={() => { setLocal(!expanded); onOpenChange?.(!expanded); }}>
      {icon && <span className="filmatta-accordion-icon">{icon}</span>}<span className="filmatta-accordion-title">{title}</span><span className="filmatta-accordion-summary">{summary}</span>{closedLabel && openLabel && <span className="filmatta-accordion-action">{expanded ? openLabel : closedLabel}</span>}<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <div id={id} role="region" aria-labelledby={`${id}-trigger`} hidden={!expanded} className="filmatta-accordion-content">{children}</div>
  </section>;
}
