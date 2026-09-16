export type NavigationLink = { label: string; href: string; description?: string };
export type NavigationItem = NavigationLink & { children?: NavigationLink[] };

// Enable destinations in the checkpoint that delivers them.
export const navigationFeatures = {
  landings: true,
  talent: false,
  opportunityFilters: false,
  marketplace: false,
  jobs: false,
  tools: false,
} as const;

export function getPrimaryNavigation(authenticated: boolean): NavigationItem[] {
  const destination = (name: string, catalog: string) =>
    !authenticated && navigationFeatures.landings ? `/descubre/${name}` : catalog;
  return [
    { label: "Perfiles", href: destination("perfiles", "/perfiles"), children: [
      { label: "Profesionales", href: destination("perfiles", "/perfiles"), description: "Reel, experiencia y disciplinas audiovisuales." },
      ...(navigationFeatures.talent ? [{ label: "Talento", href: destination("talento", "/talento"), description: "Actuación y modelaje, con una misma identidad." }] : []),
    ] },
    { label: "Oportunidades", href: destination("oportunidades", "/oportunidades"), children: [
      { label: "Todas", href: destination("oportunidades", "/oportunidades"), description: "Convocatorias para hacer posibles los proyectos." },
      ...(navigationFeatures.jobs ? [{ label: "Jobs", href: destination("jobs", "/jobs") }] : []),
      ...(navigationFeatures.opportunityFilters ? [
        { label: "Casting", href: "/oportunidades?category=casting" },
        { label: "Crew", href: "/oportunidades?category=crew" },
        { label: "Colaboraciones", href: "/oportunidades?category=collaboration" },
      ] : []),
    ] },
    { label: "Locaciones", href: destination("locaciones", "/locaciones") },
    ...(navigationFeatures.marketplace ? [{ label: "Marketplace", href: destination("marketplace", "/marketplace") }] : []),
    { label: "Learn", href: destination("learn", "/cursos") },
    ...(navigationFeatures.tools ? [{ label: "Tools", href: "/tools", children: [
      { label: "Todas las herramientas", href: "/tools" },
      { label: "FILMATTA Writer", href: "/tools/writer" },
      { label: "Production Assistant", href: "/tools/production-assistant" },
      { label: "Calculadoras y conversores", href: "/tools/utilidades" },
    ] }] : []),
    { label: "Planes", href: "/planes" },
  ];
}

export function getAccountNavigation(role: string): NavigationLink[] {
  return [
    { label: "Mi cuenta", href: "/cuenta" },
    { label: "Mi perfil profesional", href: "/mi-perfil" },
    { label: "Mi aprendizaje", href: "/cuenta#mis-cursos" },
    { label: "Mis locaciones", href: "/mis-locaciones" },
    { label: "Mi suscripción", href: "/cuenta/suscripcion" },
    { label: "Ajustes", href: "/cuenta#configuracion" },
    ...(role === "admin" ? [{ label: "Administrar FILMATTA", href: "/admin" }] : []),
  ];
}

export const publishingNavigation: NavigationLink[] = [
  { label: "Completar mi perfil", href: "/mi-perfil" },
  { label: "Nueva locación", href: "/mis-locaciones/nueva" },
];

export function isNavigationActive(pathname: string, href: string): boolean {
  const route = href.split(/[?#]/)[0];
  return pathname === route || (route !== "/" && pathname.startsWith(`${route}/`));
}
