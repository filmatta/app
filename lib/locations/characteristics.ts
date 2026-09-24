export const LOCATION_NUMERIC_CHARACTERISTICS = [
  { key: "surface_m2", label: "Superficie aproximada", unit: "m²", max: 1_000_000 },
  { key: "ceiling_height_m", label: "Altura de techo", unit: "m", max: 1_000 },
  { key: "declared_capacity", label: "Capacidad declarada", unit: "personas", max: 1_000_000 },
] as const;

export const LOCATION_BOOLEAN_CHARACTERISTICS = [
  ["natural_light", "Luz natural"], ["blackout", "Posibilidad de oscurecimiento"],
  ["bathrooms", "Baños"], ["kitchen", "Cocina"], ["dressing_room", "Camerino"],
  ["makeup_wardrobe", "Área de maquillaje o vestuario"], ["loading_access", "Acceso de carga"],
  ["street_level", "Acceso a nivel de calle"], ["freight_elevator", "Elevador o montacargas"],
  ["parking", "Estacionamiento"], ["wifi", "Wi-Fi"], ["climate_control", "Climatización"],
  ["water_showers", "Agua o regaderas"], ["storage", "Bodega"], ["garden_patio", "Patio o jardín"],
  ["rooftop", "Azotea"], ["pool", "Alberca"], ["cyclorama", "Ciclorama"],
  ["sound_insulation", "Aislamiento acústico"],
].map(([key, label]) => ({ key, label })) as readonly { key: string; label: string }[];

export const LOCATION_TEXT_CHARACTERISTICS = [
  { key: "exterior_noise", label: "Ruido exterior", maxLength: 300 },
  { key: "accessibility", label: "Características de accesibilidad", maxLength: 1_000 },
  { key: "electrical_supply", label: "Alimentación eléctrica declarada", maxLength: 1_000 },
] as const;

export type LocationCharacteristics = Record<string, number | boolean | string>;

export function parseLocationCharacteristics(
  formData: FormData,
): { ok: true; value: LocationCharacteristics } | { ok: false } {
  const value: LocationCharacteristics = {};
  for (const field of LOCATION_NUMERIC_CHARACTERISTICS) {
    const raw = String(formData.get(`characteristic.${field.key}`) ?? "").trim();
    if (!raw) continue;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > field.max) return { ok: false };
    value[field.key] = parsed;
  }
  for (const field of LOCATION_BOOLEAN_CHARACTERISTICS) {
    const raw = String(formData.get(`characteristic.${field.key}`) ?? "");
    if (!raw) continue;
    if (raw !== "yes" && raw !== "no") return { ok: false };
    value[field.key] = raw === "yes";
  }
  for (const field of LOCATION_TEXT_CHARACTERISTICS) {
    const raw = String(formData.get(`characteristic.${field.key}`) ?? "").trim();
    if (!raw) continue;
    if (raw.length > field.maxLength) return { ok: false };
    value[field.key] = raw;
  }
  return { ok: true, value };
}

export function normalizeLocationCharacteristics(value: unknown): LocationCharacteristics {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set([
    ...LOCATION_NUMERIC_CHARACTERISTICS.map((field) => field.key),
    ...LOCATION_BOOLEAN_CHARACTERISTICS.map((field) => field.key),
    ...LOCATION_TEXT_CHARACTERISTICS.map((field) => field.key),
  ]);
  return Object.fromEntries(Object.entries(value).filter(([key]) => allowed.has(key)));
}
