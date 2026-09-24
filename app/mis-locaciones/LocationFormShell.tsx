"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function LocationFormShell({
  action,
  storageKey,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  storageKey: string;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const hasError = new URLSearchParams(window.location.search).has("error");
    if (!hasError) {
      sessionStorage.removeItem(storageKey);
      return;
    }
    const saved = sessionStorage.getItem(storageKey);
    sessionStorage.removeItem(storageKey);
    if (!saved || !formRef.current) return;
    try {
      const values = JSON.parse(saved) as Record<string, string[]>;
      for (const element of Array.from(formRef.current.elements)) {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
        const stored = values[element.name];
        if (!element.name || !stored) continue;
        if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
          element.checked = stored.includes(element.value);
        } else {
          element.value = stored[0] ?? "";
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  return <form ref={formRef} action={action} className="mt-12 space-y-12" onSubmit={(event) => {
    const values: Record<string, string[]> = {};
    for (const [key, value] of new FormData(event.currentTarget).entries()) {
      if (key === "intent" || typeof value !== "string") continue;
      (values[key] ??= []).push(value);
    }
    sessionStorage.setItem(storageKey, JSON.stringify(values));
  }}>{children}</form>;
}
