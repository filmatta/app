export const LOCATION_RATE_MODES = ["legacy", "tiers", "inquire"] as const;
export type LocationRateMode = (typeof LOCATION_RATE_MODES)[number];

export type LocationRateTier = {
  min: number;
  max: number;
  price: number;
  currency: string;
};

export type LocationPricing = {
  rateMode: LocationRateMode;
  rateTiers: LocationRateTier[];
  minimumHours: number | null;
};

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const HOURS_PATTERN = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;
const INTEGER_PATTERN = /^[1-9]\d*$/;
const MAX_PRICE = 9_999_999_999.99;

export function isPositiveIntegerCapacity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1_000_000;
}

export function normalizeLocationRateMode(value: unknown): LocationRateMode {
  return LOCATION_RATE_MODES.includes(value as LocationRateMode) ? value as LocationRateMode : "legacy";
}

export function normalizeLocationRateTiers(value: unknown): LocationRateTier[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (!isPositiveIntegerCapacity(row.min) || !isPositiveIntegerCapacity(row.max) || row.max < row.min) return [];
    if (typeof row.price !== "number" || !Number.isFinite(row.price) || row.price < 0 || row.price > MAX_PRICE) return [];
    if (typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency)) return [];
    return [{ min: row.min, max: row.max, price: row.price, currency: row.currency }];
  });
}

export function suggestedLocationRanges(capacity: number) {
  if (!isPositiveIntegerCapacity(capacity)) return [];
  if (capacity <= 5) return [{ min: 1, max: capacity }];
  if (capacity <= 15) return [{ min: 1, max: 5 }, { min: 6, max: capacity }];
  return [{ min: 1, max: 5 }, { min: 6, max: 15 }, { min: 16, max: capacity }];
}

export function locationPricingProblem(
  capacity: number | null,
  tiers: Array<Pick<LocationRateTier, "min" | "max"> & { price: string | number }>,
) {
  if (!isPositiveIntegerCapacity(capacity)) return "Indica una capacidad máxima con un entero positivo.";
  if (tiers.length < 1 || tiers.length > 3 || tiers.length > capacity) return "Usa entre uno y tres rangos válidos para la capacidad indicada.";
  let expected = 1;
  for (const tier of tiers) {
    if (!Number.isInteger(tier.min) || !Number.isInteger(tier.max) || tier.min !== expected || tier.max < tier.min) return "Los rangos deben ser consecutivos, sin huecos ni solapamientos.";
    if (String(tier.price).trim() === "" || !MONEY_PATTERN.test(String(tier.price).trim()) || Number(tier.price) > MAX_PRICE) return "Completa cada tarifa con un importe no negativo y hasta dos decimales.";
    expected = tier.max + 1;
  }
  return expected === capacity + 1 ? null : "El último rango debe terminar en la capacidad máxima.";
}

export function parseLocationPricingForm(
  formData: FormData,
  capacity: number | null,
  allowLegacy: boolean,
): { ok: true; value: LocationPricing } | { ok: false; error: "invalid-pricing" | "incomplete-pricing" } {
  const mode = String(formData.get("rate_mode") ?? "").trim();
  if (mode === "legacy") {
    return allowLegacy
      ? { ok: true, value: { rateMode: "legacy", rateTiers: [], minimumHours: null } }
      : { ok: false, error: "invalid-pricing" };
  }
  if (mode === "inquire") return { ok: true, value: { rateMode: "inquire", rateTiers: [], minimumHours: null } };
  if (mode !== "tiers" || !isPositiveIntegerCapacity(capacity)) return { ok: false, error: "invalid-pricing" };

  const countRaw = String(formData.get("rate_tier_count") ?? "").trim();
  const currency = String(formData.get("rate_currency") ?? "").trim().toUpperCase();
  const minimumRaw = String(formData.get("minimum_hours") ?? "").trim();
  if (!INTEGER_PATTERN.test(countRaw) || !/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "invalid-pricing" };
  const count = Number(countRaw);
  if (count < 1 || count > 3 || count > capacity) return { ok: false, error: "invalid-pricing" };
  let minimumHours: number | null = null;
  if (minimumRaw) {
    if (!HOURS_PATTERN.test(minimumRaw)) return { ok: false, error: "invalid-pricing" };
    minimumHours = Number(minimumRaw);
    if (!Number.isFinite(minimumHours) || minimumHours <= 0 || minimumHours > 1000) return { ok: false, error: "invalid-pricing" };
  }

  const tiers: LocationRateTier[] = [];
  let min = 1;
  for (let index = 0; index < count; index++) {
    const maxRaw = String(formData.get(`rate_tier_${index}_max`) ?? "").trim();
    const priceRaw = String(formData.get(`rate_tier_${index}_price`) ?? "").trim();
    if (!priceRaw) return { ok: false, error: "incomplete-pricing" };
    if (!INTEGER_PATTERN.test(maxRaw) || !MONEY_PATTERN.test(priceRaw)) return { ok: false, error: "invalid-pricing" };
    const max = Number(maxRaw);
    const price = Number(priceRaw);
    if (!Number.isSafeInteger(max) || max < min || max > capacity || (index === count - 1 && max !== capacity) || !Number.isFinite(price) || price < 0 || price > MAX_PRICE) return { ok: false, error: "invalid-pricing" };
    tiers.push({ min, max, price, currency });
    min = max + 1;
  }
  if (min !== capacity + 1) return { ok: false, error: "invalid-pricing" };
  return { ok: true, value: { rateMode: "tiers", rateTiers: tiers, minimumHours } };
}

export function formatAttendeeRange(min: number, max: number) {
  return min === max ? `${min} persona${min === 1 ? "" : "s"}` : `${min}–${max} personas`;
}
