"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logout } from "@/app/cuenta/actions";
import LoadingButton from "@/components/ui/LoadingButton";
import Disclosure from "./Disclosure";
import { getAccountNavigation, getPrimaryNavigation, isNavigationActive, publishingNavigation, type NavigationLink } from "@/lib/navigation";

function MenuLinks({ items }: { items: NavigationLink[] }) {
  return <>{items.map(item => {
    const content = <>
      <span>{item.label}</span>
      {item.description && <span className="mt-1 block text-xs leading-5 text-white/55">{item.description}</span>}
    </>;
    return item.href === "/admin"
      ? <a key={item.href} href={item.href} className="nav-menu-link">{content}</a>
      : <Link key={item.href} href={item.href} className="nav-menu-link">{content}</Link>;
  })}</>;
}

export function AccountNavigation({ role }: { role: string }) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  const accountLinks = getAccountNavigation(role);
  const personalLinks = ["/mi-perfil", "/mis-locaciones", "/mis-servicios", "/cuenta#mis-cursos", "/cuenta/suscripcion"]
    .map(href => accountLinks.find(item => item.href === href)!);
  const settings = accountLinks.find(item => item.href === "/cuenta#configuracion")!;
  const admin = accountLinks.find(item => item.href === "/admin");
  const accountLink = (item: NavigationLink, label = item.label) => {
    const active = item.href.includes("#")
      ? pathname === "/cuenta" && (item.href.endsWith("#mis-cursos") ? hash === "#mis-cursos" : hash !== "#mis-cursos")
      : isNavigationActive(pathname, item.href);
    const attributes = {
      "aria-current": active ? (item.href.includes("#") ? "location" as const : "page" as const) : undefined,
      className: "account-menu-link",
    };
    return item.href === "/admin"
      ? <a key={item.href} href={item.href} {...attributes}>{label}</a>
      : <Link key={item.href} href={item.href} {...attributes}>{label}</Link>;
  };
  return <Disclosure key={pathname} label="Mi cuenta" align="right" panelClassName="account-panel" onOpen={() => setHash(window.location.hash)}>
    <nav aria-label="Menú de cuenta">
      <div className="account-menu-section">
        <p className="account-menu-heading">Mi FILMATTA</p>
        {personalLinks.map(item => accountLink(item))}
      </div>
      <div className="account-menu-section">
        <p className="account-menu-heading">Cuenta</p>
        {accountLink(settings, "Configuración / cuenta")}
        <form action={logout}>
          <LoadingButton type="submit" loadingText="Saliendo…" className="account-menu-link account-signout w-full">Cerrar sesión</LoadingButton>
        </form>
      </div>
      {admin && <div className="account-menu-section">
        <p className="account-menu-heading">Administración</p>
        {accountLink(admin, "Panel admin")}
      </div>}
    </nav>
  </Disclosure>;
}

export default function GlobalNavigation({ authenticated, role, badge, children }: {
  authenticated: boolean; role?: string; badge?: ReactNode; children?: ReactNode;
}) {
  const pathname = usePathname();
  const links = getPrimaryNavigation(authenticated);
  const dialog = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const close = () => { dialog.current?.close(); document.body.style.overflow = ""; menuButton.current?.focus(); };
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1440px)");
    const resize = () => { if (media.matches && dialog.current?.open) dialog.current.close(); };
    media.addEventListener("change", resize);
    return () => { media.removeEventListener("change", resize); document.body.style.overflow = ""; };
  }, []);
  return <header className="global-header border-b border-white/15 bg-[#080808] text-[#f1efe9]">
    <div className="global-header-inner">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <Link href="/" aria-label="FILMATTA — Inicio" className="nav-brand">FILMATTA</Link>{badge}
      </div>
      <nav aria-label="Navegación principal" className="hidden min-[1440px]:block">
        <ul className="flex items-center gap-3">
          {links.map((item, index) => <li key={item.label} className="flex items-center gap-3">
            {index > 0 && <span aria-hidden="true" className="select-none text-white/25">/</span>}
            {item.children ? <Disclosure label={item.label} active={isNavigationActive(pathname, item.href) || item.children.some(link => isNavigationActive(pathname, link.href))}>
              <MenuLinks items={item.children} />
            </Disclosure> : <Link href={item.href} aria-current={isNavigationActive(pathname, item.href) ? "page" : undefined} className="nav-trigger">{item.label}</Link>}
          </li>)}
        </ul>
      </nav>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        {authenticated ? <>
          <div className="hidden min-[1600px]:block"><Disclosure label="Publicar" align="right"><MenuLinks items={publishingNavigation} /></Disclosure></div>
          <div className="hidden min-[1280px]:block"><AccountNavigation role={role ?? "user"} /></div>
        </> : <>
          <Link href="/login" className="nav-trigger hidden sm:inline-flex">Entrar</Link>
          <Link href="/registro" className="nav-signup hidden sm:inline-flex">Crear cuenta</Link>
        </>}
        <button type="button" ref={menuButton} aria-haspopup="dialog" aria-controls="global-navigation-drawer"
          className="nav-trigger min-[1440px]:hidden" onClick={() => {
            dialog.current?.showModal(); document.body.style.overflow = "hidden";
          }}>Menú <span aria-hidden="true" className="ml-2">☰</span></button>
      </div>
    </div>
    {children}
    <dialog id="global-navigation-drawer" ref={dialog} aria-labelledby="navigation-drawer-title"
      className="nav-drawer" onClose={() => { document.body.style.overflow = ""; }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),summary'))
          .filter(item => item.getClientRects().length > 0);
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="min-h-full p-6">
        <div className="mb-8 flex items-center justify-between border-b border-white/15 pb-5">
          <p id="navigation-drawer-title" className="text-sm font-semibold tracking-[0.2em]">EXPLORA FILMATTA</p>
          <button type="button" className="nav-trigger" onClick={close} autoFocus>Cerrar ×</button>
        </div>
        <nav aria-label="Navegación móvil" onClick={event => { if ((event.target as HTMLElement).closest("a")) close(); }}>
          {links.map(item => item.children ? <details key={item.label} className="border-b border-white/15 py-2">
            <summary className="nav-trigger cursor-pointer py-3">{item.label}</summary>
            <div className="pb-3 pl-4"><MenuLinks items={item.children} /></div>
          </details> : <Link key={item.href} href={item.href} aria-current={isNavigationActive(pathname, item.href) ? "page" : undefined} className="nav-menu-link border-b border-white/15 py-5">{item.label}</Link>)}
          <div className="mt-8">
            {authenticated ? <>
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">Tu espacio</p>
              <MenuLinks items={getAccountNavigation(role ?? "user")} />
              <p className="mb-2 mt-7 text-xs uppercase tracking-[0.2em] text-white/50">Publicar</p>
              <MenuLinks items={publishingNavigation} />
              <form action={logout} className="mt-5"><LoadingButton type="submit" loadingText="Saliendo…" className="nav-menu-link">Cerrar sesión</LoadingButton></form>
            </> : <div className="flex flex-wrap gap-4"><Link href="/login" className="nav-trigger">Entrar</Link><Link href="/registro" className="nav-signup">Crear cuenta</Link></div>}
          </div>
        </nav>
      </div>
    </dialog>
  </header>;
}
