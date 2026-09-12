"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/cuenta/actions";
import type { Viewer } from "@/lib/auth/get-viewer";
import LoadingButton from "@/components/ui/LoadingButton";

const IDENTITY_LINKS = [
  { href: "/cuenta#perfil", label: "Perfil" },
  { href: "/cuenta#avatar", label: "Avatar" },
  { href: "/cuenta", label: "Cuenta" },
];

const BILLING_LINKS = [
  { href: "/cuenta#pagos", label: "Pagos" },
  { href: "/cuenta#metodos-pago", label: "Métodos de pago" },
  { href: "/cuenta#facturacion", label: "Datos de facturación" },
];

export default function AccountDropdown({ viewer }: { viewer: Viewer }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);
  const initial = viewer.displayName.trim().charAt(0).toUpperCase() || "F";

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => firstItemRef.current?.focus());

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative justify-self-end">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="account-menu"
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] p-1.5 pr-2 text-left transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-black">
          {initial}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium text-white/75 md:block">
          {viewer.displayName}
        </span>
        <ChevronIcon />
      </button>

      {open && (
        <div
          id="account-menu"
          role="menu"
          aria-label="Menú de cuenta"
          className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/12 bg-[#111] p-1.5 shadow-2xl shadow-black/50"
        >
          <div className="border-b border-white/10 px-3 py-3">
            <p className="truncate text-sm font-medium text-white/85">
              {viewer.displayName}
            </p>
            {viewer.email && (
              <p className="mt-1 truncate text-xs text-white/35">{viewer.email}</p>
            )}
          </div>

          <div className="py-1.5">
            {IDENTITY_LINKS.map((item, index) => (
              <Link
                key={`${item.href}-${item.label}`}
                ref={index === 0 ? firstItemRef : undefined}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white focus-visible:bg-white/[0.06] focus-visible:text-white focus-visible:outline-none"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="border-t border-white/10 py-1.5">
            {BILLING_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white focus-visible:bg-white/[0.06] focus-visible:text-white focus-visible:outline-none"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="border-t border-white/10 py-1.5">
            <Link
              href="/cuenta#seguridad"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white focus-visible:bg-white/[0.06] focus-visible:text-white focus-visible:outline-none"
            >
              Seguridad
            </Link>
          </div>

          {viewer.role === "admin" && (
            <div className="border-t border-white/10 py-1.5">
              <Link
                href="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white focus-visible:bg-white/[0.06] focus-visible:text-white focus-visible:outline-none"
              >
                Administrar FILMATTA
              </Link>
            </div>
          )}

          <form action={logout} className="border-t border-white/10 pt-1.5">
            <LoadingButton
              type="submit"
              role="menuitem"
              loadingText="Saliendo…"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-200/80 transition hover:bg-red-500/10 hover:text-red-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
            >
              Cerrar sesión
            </LoadingButton>
          </form>
        </div>
      )}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-3.5 fill-none stroke-current text-white/35"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 8 4 4 4-4" />
    </svg>
  );
}
