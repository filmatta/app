import type { LocationCharacteristics } from "./characteristics";
import type { LocationConditions } from "./conditions";
import type { LocationRateMode, LocationRateTier } from "./pricing";

export type LocationCompletenessInput = {
  title: string;
  spaceType: string;
  city: string;
  capacity: unknown;
  rateMode: LocationRateMode;
  rateTiers: LocationRateTier[];
  summary: string | null;
  description: string | null;
  readyPhotoCount: number;
  hasReadyCover: boolean;
  characteristics: LocationCharacteristics;
  conditions: LocationConditions;
  contact: Record<string, string | null> | null;
  hasReadyTour: boolean;
};

export function getLocationCompleteness(input: LocationCompletenessInput) {
  const advancedCharacteristics = Object.keys(input.characteristics).filter((key) => key !== "declared_capacity");
  const items = [
    { key: "identity", label: "Nombre y tipo", complete: Boolean(input.title.trim() && input.spaceType.trim()) },
    { key: "location", label: "Ubicación", complete: Boolean(input.city.trim()) },
    { key: "capacity", label: "Capacidad", complete: typeof input.capacity === "number" && Number.isInteger(input.capacity) && input.capacity > 0 },
    { key: "pricing", label: "Tarifa", complete: input.rateMode === "inquire" || (input.rateMode === "tiers" && input.rateTiers.length > 0) || input.rateMode === "legacy" },
    { key: "description", label: "Descripción", complete: Boolean(input.summary?.trim() || input.description?.trim()) },
    { key: "photos", label: "Fotos y portada", complete: input.readyPhotoCount > 0 && input.hasReadyCover },
    { key: "characteristics", label: "Características", complete: advancedCharacteristics.length > 0 },
    { key: "conditions", label: "Condiciones", complete: Object.keys(input.conditions).length > 0 },
    { key: "contact", label: "Contacto", complete: Boolean(input.contact && Object.values(input.contact).some((value) => value?.trim())) },
    { key: "tour", label: "Recorrido opcional", complete: input.hasReadyTour },
  ];
  return { complete: items.filter((item) => item.complete).length, total: items.length, items };
}
