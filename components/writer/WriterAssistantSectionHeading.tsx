"use client";

import { useCallback, useId, useRef, useState } from "react";
import { SmartFeatureIndicator } from "./WriterSmartFormatting";
import { useWriterPopoverDismissal } from "./useWriterPopoverDismissal";

export default function WriterAssistantSectionHeading({ title, help, count }: {
  title: string;
  help: string;
  count?: number;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useWriterPopoverDismissal({ open, rootRef, triggerRef, onDismiss: close });

  return <div ref={rootRef} className="writer-assistant-section-title">
    <h3><SmartFeatureIndicator label={title} /></h3>
    {typeof count === "number" && <span>{count}</span>}
    <button ref={triggerRef} type="button" title="Ayuda" aria-label={`Ayuda sobre ${title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>?</button>
    {open && <div id={id} className="writer-assistant-help" role="note"><p>{help}</p></div>}
  </div>;
}
