import { surfacesFor } from "./create/catalog";

export type NavigationLink = {
  label: string;
  href: string;
  description?: string;
};

export type NavigationItem = NavigationLink & { children?: NavigationLink[] };

export const navigationFeatures = {
  createExperience: true,
} as const;

export function getPrimaryNavigation(_authenticated: boolean): NavigationItem[] {
  void _authenticated;
  const tools = surfacesFor("navbar")
    .filter((surface) => surface.id !== "learn")
    .map<NavigationLink>((surface) => ({
      label: surface.name,
      href: surface.href ?? `/#${surface.id}`,
      description: `${surface.eyebrow} · ${surface.statusLabel}`,
    }));

  return [
    {
      label: "Herramientas",
      href: "/#herramientas",
      children: tools,
    },
    { label: "Learn", href: "/cursos" },
  ];
}
export function getCreateNavigation(): NavigationLink[] {
  return surfacesFor("create").flatMap((surface) =>
    surface.href
      ? [{
          label: surface.id === "writer" ? "Nuevo guion" : "Nueva shotlist",
          href: surface.id === "writer" ? "/writer" : "/shotlists",
          description: surface.id === "writer"
            ? "Escribe o importa un guion."
            : "Crea una shotlist libre o desde Writer.",
        }]
      : [],
  );
}
export function getAccountNavigation(role: string): NavigationLink[] {
  return [
    { label: "Dashboard", href: "/cuenta" },
    { label: "Mis guiones", href: "/writer" },
    { label: "Mis shotlists", href: "/shotlists" },
    { label: "Mi aprendizaje", href: "/cuenta/configuracion#mis-cursos" },
    { label: "Mi perfil profesional", href: "/mi-perfil" },
    { label: "Mi suscripción", href: "/cuenta/suscripcion" },
    { label: "Ajustes", href: "/cuenta/configuracion#configuracion" },
    ...(role === "admin"
      ? [{ label: "Administrar FILMATTA", href: "/admin" }]
      : []),
  ];
}

// Legacy publishing destinations remain addressable, but are intentionally not
// consumed by the CREATE navigation. Keeping them here makes rollback explicit.
export const legacyPublishingNavigation: NavigationLink[] = [
  { label: "Completar mi perfil", href: "/mi-perfil" },
  { label: "Nuevo proyecto", href: "/mis-proyectos/nuevo" },
  { label: "Nueva locación", href: "/mis-locaciones/nueva" },
  { label: "Publicar oportunidad", href: "/mis-oportunidades/nueva" },
  { label: "Publicar encargo", href: "/mis-oportunidades/nueva?type=job" },
  { label: "Ofrecer servicio", href: "/mis-servicios/nuevo" },
];

export function isNavigationActive(pathname: string, href: string): boolean {
  const canonical = (path: string) => {
    const route = path.split(/[?#]/)[0].replace(/^\/descubre\//, "/");
    return route === "/learn" ? "/cursos" : route;
  };
  const route = canonical(href);
  const current = canonical(pathname);
  return (
    current === route || (route !== "/" && current.startsWith(`${route}/`))
  );
}
