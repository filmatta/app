import type {
  AvailabilityStatus,
  ContactPolicy,
  PortfolioItemKind,
} from "@/lib/profiles/types";

export const PROFILE_DISCIPLINES = [
  "Dirección",
  "Producción",
  "Dirección de fotografía",
  "Cámara",
  "Iluminación",
  "Sonido",
  "Dirección de arte",
  "Edición",
  "Color",
  "VFX",
  "Animación",
  "Actuación",
  "Guion",
  "Música",
  "Foto fija",
] as const;

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  available: "Disponible",
  limited: "Disponibilidad limitada",
  unavailable: "No disponible",
  not_specified: "Disponibilidad por confirmar",
};

export const CONTACT_POLICY_LABELS: Record<ContactPolicy, string> = {
  members_only: "Acepto solicitudes dentro de FILMATTA",
  closed: "No recibir solicitudes por ahora",
};

export const PORTFOLIO_KIND_LABELS: Record<PortfolioItemKind, string> = {
  reel: "Reel",
  project: "Proyecto",
  link: "Enlace",
};

export const PROFILE_LIMITS = {
  disciplines: 5,
  skills: 12,
  equipment: 10,
  portfolioItems: 6,
  city: 80,
  bio: 1200,
  itemTitle: 80,
  itemSummary: 180,
  itemUrl: 500,
} as const;
