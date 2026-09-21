"use client";

import ProfileAvatar from "@/components/profiles/ProfileAvatar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logout } from "@/app/cuenta/actions";
import LoadingButton from "@/components/ui/LoadingButton";
import Disclosure from "./Disclosure";
import NetworkingHeader from "@/components/networking/NetworkingHeader";
import { getAccountNavigation, getPrimaryNavigation, isNavigationActive, publishingNavigation, type NavigationLink } from "@/lib/navigation";

function MenuLinks({ items, descriptions = true }: { items: NavigationLink[]; descriptions?: boolean }) {
  return <>{items.map(item => {
    const content = <>
      <span>{item.label}</span>
      {descriptions && item.description && <span className="nav-menu-description">{item.description}</span>}
    </>;
    return item.href === "/admin"
      ? <a key={item.href} href={item.href} className="nav-menu-link">{content}</a>
      : <Link key={item.href} href={item.href} className="nav-menu-link">{content}</Link>;
  })}</>;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "F";
  return `${parts[0][0]}${parts.length > 1 ? parts.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
}

type AccountPortrait = { id?: string | null; url?: string | null };
function AccountAvatar({ name, small = false, portrait }: { name: string; small?: boolean; portrait?: AccountPortrait }) {
  return <i aria-hidden="true" className={`account-avatar ${small ? "account-avatar--small" : ""}`}>{portrait?.id || portrait?.url ? <ProfileAvatar id={portrait.id} fallbackUrl={portrait.url} name={name} /> : initials(name)}</i>;
}

function AccountIdentity({ name, mobile = false, portrait }: { name: string; mobile?: boolean; portrait?: AccountPortrait }) {
  return <Link href="/mi-perfil" className={`account-identity ${mobile ? "account-identity--mobile" : ""}`}>
    <AccountAvatar name={name} portrait={portrait} />
    <span className="min-w-0">
      <span className="account-identity-name">{name}</span>
      <span className="account-identity-meta">Mi perfil →</span>
    </span>
  </Link>;
}

function DesktopMenu({ item }: { item: { label: string; children: NavigationLink[] } }) {
  if (item.label === "Tools") {
    const byLabel = (label: string) => item.children.find(link => link.label === label)!;
    return <div className="nav-product-menu nav-product-menu--tools">
      <p className="nav-panel-heading">Tools</p>
      <div className="nav-tools-grid">
        <div className="nav-tools-column">
          <p className="nav-panel-group">Crear</p>
          <MenuLinks descriptions={false} items={[byLabel("FILMATTA Writer"), byLabel("Production Assistant")]} />
        </div>
        <div className="nav-tools-column">
          <p className="nav-panel-group">Utilidades</p>
          <MenuLinks descriptions={false} items={[byLabel("Calculadoras y conversores"), byLabel("Todas las herramientas")]} />
        </div>
      </div>
    </div>;
  }

  if (item.label === "Oportunidades") {
    return <div className="nav-product-menu nav-product-menu--opportunities">
      <p className="nav-panel-heading">Oportunidades</p>
      <div className="nav-opportunities-grid"><MenuLinks descriptions={false} items={item.children} /></div>
      <p className="nav-panel-note">Convocatorias para hacer posibles los proyectos.</p>
    </div>;
  }

  return <div className="nav-product-menu nav-product-menu--profiles">
    <p className="nav-panel-heading">Perfiles</p>
    <MenuLinks items={item.children} />
  </div>;
}

export function AccountNavigation({ role, displayName, portrait }: { role: string; displayName: string; portrait?: AccountPortrait }) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  const accountLinks = getAccountNavigation(role);
  const personalLinks = ["/mi-perfil", "/cuenta/contactos", "/mi-red", "/proyectos", "/mis-locaciones", "/mis-servicios", "/cuenta#mis-cursos", "/cuenta/suscripcion"]
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
  return <Disclosure key={pathname} label="Mi cuenta" leading={<AccountAvatar name={displayName} small portrait={portrait} />} align="right" panelClassName="account-panel" onOpen={() => setHash(window.location.hash)}>
    <nav aria-label="Menú de cuenta">
      <AccountIdentity name={displayName} portrait={portrait} />
      <div className="account-menu-section">
        <p className="account-menu-heading">Mi FILMATTA</p>
        {personalLinks.map(item => accountLink(item))}
      </div>
      <div className="account-menu-section">
        <p className="account-menu-heading">Cuenta</p>
        {accountLink(accountLinks.find(item => item.href === "/mi-cuenta")!, "Mi cuenta")}
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

export default function GlobalNavigation({ authenticated, role, accountName = "Mi cuenta", accountPortrait, hasContextLink = false, badge, children }: {
  authenticated: boolean; role?: string; accountName?: string; accountPortrait?: AccountPortrait; hasContextLink?: boolean; badge?: ReactNode; children?: ReactNode;
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
  return <header className={`global-header border-b border-white/15 bg-[#080808] text-[#f1efe9] ${hasContextLink ? "global-header--context" : ""}`}>
    <div className="global-header-inner">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <Link href="/" aria-label="FILMATTA — Inicio" className="nav-brand">FILMATTA</Link>{badge}
      </div>
      <nav aria-label="Navegación principal" className="hidden min-[1440px]:block">
        <ul className="flex items-center gap-3">
          {links.map((item, index) => <li key={item.label} className="flex items-center gap-3">
            {index > 0 && <span aria-hidden="true" className="select-none text-white/25">/</span>}
            {item.children ? <Disclosure label={item.label} panelClassName={`nav-primary-panel nav-primary-panel--${item.label.toLowerCase()}`} active={isNavigationActive(pathname, item.href) || item.children.some(link => isNavigationActive(pathname, link.href))}>
              <DesktopMenu item={{ label: item.label, children: item.children }} />
            </Disclosure> : <Link href={item.href} aria-current={isNavigationActive(pathname, item.href) ? "page" : undefined} className="nav-trigger">{item.label}</Link>}
          </li>)}
        </ul>
      </nav>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <NetworkingHeader authenticated={authenticated} />
        {authenticated ? <>
          <div className="nav-publish-slot hidden min-[1600px]:flex"><Disclosure label="Publicar" align="right" panelClassName="nav-publishing-panel"><MenuLinks items={publishingNavigation.filter(i => !["/mis-locaciones/nueva","/mis-servicios/nuevo"].includes(i.href))} /></Disclosure></div>
          <div className="nav-account-slot hidden min-[1280px]:flex"><AccountNavigation role={role ?? "user"} displayName={accountName} portrait={accountPortrait} /></div>
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
          {authenticated && <AccountIdentity name={accountName} mobile portrait={accountPortrait} />}
          {links.map(item => item.children ? <details key={item.label} className="border-b border-white/15 py-2">
            <summary className="nav-trigger cursor-pointer py-3">{item.label}</summary>
            <div className="pb-3 pl-4"><MenuLinks items={item.children} /></div>
          </details> : <Link key={item.href} href={item.href} aria-current={isNavigationActive(pathname, item.href) ? "page" : undefined} className="nav-menu-link border-b border-white/15 py-5">{item.label}</Link>)}
          <div className="mt-8">
            {authenticated ? <>
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">Tu espacio</p>

              <MenuLinks items={getAccountNavigation(role ?? "user")} />
              <p className="mb-2 mt-7 text-xs uppercase tracking-[0.2em] text-white/50">Publicar</p>
              <MenuLinks items={publishingNavigation.filter(i => !["/mis-locaciones/nueva","/mis-servicios/nuevo"].includes(i.href))} />
              <form action={logout} className="mt-5"><LoadingButton type="submit" loadingText="Saliendo…" className="nav-menu-link">Cerrar sesión</LoadingButton></form>
            </> : <div className="flex flex-wrap gap-4"><Link href="/login" className="nav-trigger">Entrar</Link><Link href="/registro" className="nav-signup">Crear cuenta</Link></div>}
          </div>
        </nav>
      </div>
    </dialog>
  </header>;
}
