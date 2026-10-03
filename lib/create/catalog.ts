export type CreateSurfaceId =
  | "writer"
  | "shotlist"
  | "storyboard"
  | "production"
  | "rec"
  | "learn";

export type CreateAvailability = "available" | "beta" | "development";
export type CreateVisualKind = "real-ui" | "concept";

export type CreateSurface = {
  id: CreateSurfaceId;
  name: string;
  eyebrow: string;
  description: string;
  availability: CreateAvailability;
  statusLabel: string;
  visualKind: CreateVisualKind;
  href?: string;
  actionLabel?: string;
  visibility: {
    home: boolean;
    navbar: boolean;
    dashboard: boolean;
    create: boolean;
  };
};

/**
 * Product truth for FILMATTA CREATE.
 *
 * Visibility is deliberately independent from availability and access. This
 * catalog is presentation metadata only; route authorization stays in each
 * server page and in Supabase RLS.
 */
export const createSurfaces = [
  {
    id: "writer",
    name: "Writer",
    eyebrow: "Escribe y entiende tu historia",
    description:
      "Escribe, importa, revisa estructura y prepara el breakdown sin salir del guion.",
    availability: "available",
    statusLabel: "Disponible",
    visualKind: "real-ui",
    href: "/writer",
    actionLabel: "Abrir Writer",
    visibility: { home: true, navbar: true, dashboard: true, create: true },
  },
  {
    id: "shotlist",
    name: "Shotlist",
    eyebrow: "Convierte escenas en planos",
    description:
      "Diseña cobertura, intención y propiedades técnicas con el guion como contexto.",
    availability: "beta",
    statusLabel: "Beta",
    visualKind: "real-ui",
    href: "/shotlists",
    actionLabel: "Abrir Shotlist",
    visibility: { home: true, navbar: true, dashboard: true, create: true },
  },
  {
    id: "storyboard",
    name: "Storyboard",
    eyebrow: "Visualiza sólo cuando aporta valor",
    description:
      "Una capa opcional de Shotlist para ordenar referencias, dibujar y revisar continuidad.",
    availability: "development",
    statusLabel: "En desarrollo",
    visualKind: "concept",
    visibility: { home: true, navbar: true, dashboard: true, create: false },
  },
  {
    id: "production",
    name: "Production",
    eyebrow: "Transforma el plan creativo en trabajo",
    description:
      "Organiza jornadas, tareas, departamentos, recursos y faltantes del proyecto.",
    availability: "development",
    statusLabel: "En desarrollo",
    visualKind: "concept",
    visibility: { home: true, navbar: true, dashboard: true, create: false },
  },
  {
    id: "rec",
    name: "REC",
    eyebrow: "Lleva el plan al set",
    description:
      "Consulta la jornada, los planos, documentos y notas de ejecución durante el rodaje.",
    availability: "development",
    statusLabel: "Dirección futura",
    visualKind: "concept",
    visibility: { home: true, navbar: true, dashboard: false, create: false },
  },
  {
    id: "learn",
    name: "Learn",
    eyebrow: "Aprende a usar FILMATTA",
    description:
      "Cursos y contenidos publicados para desarrollar habilidades audiovisuales.",
    availability: "available",
    statusLabel: "Disponible",
    visualKind: "real-ui",
    href: "/cursos",
    actionLabel: "Explorar Learn",
    visibility: { home: true, navbar: true, dashboard: true, create: false },
  },
] as const satisfies readonly CreateSurface[];

export function getCreateSurface(id: CreateSurfaceId) {
  return createSurfaces.find((surface) => surface.id === id)!;
}

export function surfacesFor(
  target: keyof CreateSurface["visibility"],
): readonly CreateSurface[] {
  return createSurfaces.filter((surface) => surface.visibility[target]);
}
