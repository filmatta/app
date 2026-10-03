"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SmartFeatureIndicator } from "./WriterSmartFormatting";

export default function WriterAssistantSectionHeading({ title, help, count }: {
  title: string;
  help: string;
  count?: number;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
      } else if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  return <div ref={rootRef} className="writer-assistant-section-title" onKeyDownCapture={(event) => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  }}>
    <h3><SmartFeatureIndicator label={title} /></h3>
    {typeof count === "number" && <span>{count}</span>}
    <button type="button" aria-label={`Ayuda sobre ${title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>?</button>
    {open && <div id={id} className="writer-assistant-help" role="note"><p>{help}</p></div>}
  </div>;
}
