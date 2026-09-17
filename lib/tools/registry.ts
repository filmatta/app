export type UtilitySlug =
  "obturacion" | "almacenamiento" | "relacion-aspecto" | "focal-equivalente";
export type Tool = {
  slug: string;
  name: string;
  category: "Escritura" | "Producción" | "Cámara" | "Video";
  description: string;
  status: "available" | "beta" | "in-development";
  access: "public";
  href: string;
  utility?: UtilitySlug;
};
export const toolStatus = {
  available: "Disponible",
  beta: "Beta",
  "in-development": "En desarrollo",
} as const;
export const tools: readonly Tool[] = [
  {
    slug: "writer",
    name: "FILMATTA Writer",
    category: "Escritura",
    description:
      "La visión de un espacio para escribir y comprender tu guion, con la creatividad en tus manos.",
    status: "in-development",
    access: "public",
    href: "/tools/writer",
  },
  {
    slug: "production-assistant",
    name: "Production Assistant",
    category: "Producción",
    description:
      "Conoce la dirección de una herramienta para relacionar escenas, personas y recursos.",
    status: "in-development",
    access: "public",
    href: "/tools/production-assistant",
  },
  {
    slug: "obturacion",
    utility: "obturacion",
    name: "Ángulo y tiempo de obturación",
    category: "Cámara",
    description:
      "Convierte grados y tiempo de exposición según la frecuencia de grabación.",
    status: "available",
    access: "public",
    href: "/tools/utilidades/obturacion",
  },
  {
    slug: "almacenamiento",
    utility: "almacenamiento",
    name: "Bitrate y almacenamiento",
    category: "Video",
    description:
      "Estima espacio a partir del bitrate total y la duración. MB, GB o TB y equivalencia en GiB.",
    status: "available",
    access: "public",
    href: "/tools/utilidades/almacenamiento",
  },
  {
    slug: "relacion-aspecto",
    utility: "relacion-aspecto",
    name: "Relación de aspecto",
    category: "Video",
    description:
      "Calcula dimensiones proporcionales o identifica la relación de un cuadro.",
    status: "available",
    access: "public",
    href: "/tools/utilidades/relacion-aspecto",
  },
  {
    slug: "focal-equivalente",
    utility: "focal-equivalente",
    name: "Crop factor y focal equivalente",
    category: "Cámara",
    description:
      "Compara encuadre respecto a full frame por factor conocido o diagonal del sensor.",
    status: "available",
    access: "public",
    href: "/tools/utilidades/focal-equivalente",
  },
];
export const utilityTools = tools.filter((tool) => tool.utility);
export const getUtility = (slug: string) =>
  utilityTools.find((tool) => tool.slug === slug);
