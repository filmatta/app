export const LOCATION_ACTIVATION_STEPS = 8;

export const LOCATION_SPACE_TYPES = [
  "Casa",
  "Departamento",
  "Estudio",
  "Foro",
  "Oficina",
  "Bodega",
  "Terraza",
  "Jardín",
] as const;

export const LOCATION_ACTIVATION_CONDITION_KEYS = [
  "day_shoots",
  "night_shoots",
  "rearrange_furniture",
  "loud_music",
  "cats_dogs",
] as const;

export type LocationActivationStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function locationActivationStep(value: unknown): LocationActivationStep | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= LOCATION_ACTIVATION_STEPS
    ? parsed as LocationActivationStep
    : null;
}

export function locationActivationInProgress(step: unknown, completedAt: unknown) {
  const parsed = locationActivationStep(step);
  return parsed !== null && parsed <= 7 && completedAt === null;
}

export function locationActivationCompleted(step: unknown, completedAt: unknown) {
  return locationActivationStep(step) === 8
    && typeof completedAt === "string"
    && completedAt.length > 0;
}

export function locationActivationHref(locationId: string, step: LocationActivationStep) {
  const params = new URLSearchParams({ location: locationId, step: String(step) });
  return `/mis-locaciones/nueva?${params.toString()}`;
}
