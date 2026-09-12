"use client";

import { useEffect, useRef, useState } from "react";

export default function StudentNavigationDrawer({
  label = "Navegación",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key === "Tab") {
        const focusable = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
          ) ?? []
        );
        const first = focusable[0];
        const last = focusable.at(-1);

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="mb-6 min-[1100px]:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="student-navigation-drawer"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      >
        <MenuIcon />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Cerrar navegación"
            className="absolute inset-0 bg-black/75"
            onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
          />
          <aside
            ref={panelRef}
            id="student-navigation-drawer"
            aria-label={label}
            role="dialog"
            aria-modal="true"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) {
                setOpen(false);
              }
            }}
            className="absolute inset-y-0 left-0 w-[min(88vw,21rem)] overflow-y-auto border-r border-white/10 bg-[#0b0b0b] px-4 py-5 shadow-2xl shadow-black/40"
          >
            <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
              <p className="text-sm font-semibold">{label}</p>
              <button
                ref={closeRef}
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Cerrar
              </button>
            </div>
            {children}
          </aside>
        </div>
      )}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
