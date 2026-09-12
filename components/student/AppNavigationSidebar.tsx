import Link from "next/link";

export type WorkspaceArea =
  | "learn"
  | "profile"
  | "community"
  | "opportunities"
  | "professionals"
  | "account";

const APP_LINKS: Array<{
  area: WorkspaceArea;
  href: string;
  label: string;
}> = [
  { area: "learn", href: "/cursos", label: "Aprender" },
  { area: "profile", href: "/cuenta#perfil", label: "Perfil" },
  { area: "opportunities", href: "/oportunidades", label: "Oportunidades" },
  { area: "community", href: "/comunidad", label: "Comunidad" },
  { area: "professionals", href: "/perfiles", label: "Profesionales" },
  { area: "account", href: "/cuenta", label: "Cuenta" },
];

export default function AppNavigationSidebar({
  currentArea,
  children,
}: {
  currentArea: WorkspaceArea;
  children?: React.ReactNode;
}) {
  return (
    <nav
      aria-label="Navegación de FILMATTA"
      className="space-y-7 text-sm"
    >
      <WorkspaceNavigationGroup label="FILMATTA">
        {APP_LINKS.map((item) => (
          <WorkspaceNavigationLink
            key={item.area}
            href={item.href}
            active={item.area === currentArea}
          >
            {item.label}
          </WorkspaceNavigationLink>
        ))}
      </WorkspaceNavigationGroup>

      {children}
    </nav>
  );
}

export function WorkspaceNavigationGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
        {label}
      </p>
      <div className="mt-2 space-y-0.5">{children}</div>
    </div>
  );
}

export function WorkspaceNavigationLink({
  href,
  active = false,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "location" : undefined}
      className={`block rounded-lg border-l-2 px-3 py-2 transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/70 ${
        active
          ? "border-red-400 bg-white/[0.07] text-white"
          : "border-transparent text-white/55 hover:bg-white/[0.04] hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
