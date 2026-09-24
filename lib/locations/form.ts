import { slugify } from "@/lib/slugify";
import { parseLocationCharacteristics, type LocationCharacteristics } from "@/lib/locations/characteristics";
import { parseLocationConditions, type LocationConditions } from "@/lib/locations/conditions";
import {
  parseLocationPricingForm,
  type LocationRateMode,
  type LocationRateTier,
} from "@/lib/locations/pricing";

export const LOCATION_ENVIRONMENTS = [
  { value: "interior", label: "Interior" },
  { value: "exterior", label: "Exterior" },
  { value: "both", label: "Interior y exterior" },
] as const;

export const LOCATION_PRICE_UNITS = [
  { value: "hour", label: "Por hora" },
  { value: "half_day", label: "Media jornada" },
  { value: "day", label: "Por jornada" },
  { value: "project", label: "Por proyecto" },
] as const;

export const LOCATION_STATUSES = ["draft", "published", "archived"] as const;

export type LocationEnvironment =
  (typeof LOCATION_ENVIRONMENTS)[number]["value"];
export type LocationPriceUnit = (typeof LOCATION_PRICE_UNITS)[number]["value"];
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

export type LocationFormValues = {
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  city: string;
  area: string | null;
  space_type: string;
  environment: LocationEnvironment;
  price_amount: number | null;
  price_currency: string | null;
  price_unit: LocationPriceUnit | null;
  rate_mode: LocationRateMode;
  rate_tiers: LocationRateTier[];
  minimum_hours: number | null;
  restrictions: string | null;
  characteristics: LocationCharacteristics;
  shooting_conditions: LocationConditions;
  tour_video_url: string | null;
  operational_notes: string | null;
};

export type LocationFormError =
  | "invalid-title"
  | "invalid-slug"
  | "invalid-summary"
  | "invalid-description"
  | "invalid-city"
  | "invalid-area"
  | "invalid-space-type"
  | "invalid-environment"
  | "incomplete-price"
  | "invalid-price"
  | "invalid-currency"
  | "invalid-price-unit"
  | "invalid-pricing"
  | "incomplete-pricing"
  | "invalid-restrictions"
  | "invalid-characteristics"
  | "invalid-video"
  | "invalid-operational-notes"
  | "invalid-contact"
  | "invalid-action"
  | "slug-taken"
  | "not-found"
  | "load-failed"
  | "save-failed"
  | "archive-failed";

export type LocationSuccess =
  | "created-draft"
  | "created-published"
  | "saved"
  | "published"
  | "unpublished"
  | "archived";

const LOCATION_ERROR_MESSAGES: Record<LocationFormError, string> = {
  "invalid-title": "Escribe un nombre de entre 1 y 160 caracteres.",
  "invalid-slug":
    "El slug debe contener únicamente letras minúsculas, números y guiones.",
  "invalid-summary": "La descripción corta no puede superar 500 caracteres.",
  "invalid-description": "La descripción no puede superar 20,000 caracteres.",
  "invalid-city": "Escribe una ciudad de entre 1 y 120 caracteres.",
  "invalid-area": "La zona no puede superar 120 caracteres.",
  "invalid-space-type":
    "Escribe un tipo de espacio de entre 1 y 120 caracteres.",
  "invalid-environment": "Selecciona un tipo de entorno válido.",
  "incomplete-price":
    "Para indicar una tarifa, completa importe, moneda y unidad; o deja los tres campos vacíos.",
  "invalid-price":
    "La tarifa debe ser un número válido, no negativo y con hasta dos decimales.",
  "invalid-currency": "Usa un código de moneda de tres letras, por ejemplo MXN.",
  "invalid-price-unit": "Selecciona una unidad de tarifa válida.",
  "invalid-pricing": "Revisa la capacidad y los rangos: deben ser enteros, consecutivos y terminar en la capacidad máxima.",
  "incomplete-pricing": "Completa la tarifa total por hora de cada rango, incluso cuando el importe sea cero.",
  "invalid-restrictions":
    "Las restricciones y notas no pueden superar 10,000 caracteres.",
  "invalid-characteristics": "Revisa los valores de características.",
  "invalid-video": "Usa un enlace válido de YouTube o Vimeo.",
  "invalid-operational-notes":
    "Las condiciones operativas no pueden superar 5,000 caracteres.",
  "invalid-contact": "Revisa los canales públicos de contacto.",
  "invalid-action": "La acción solicitada no es válida.",
  "slug-taken": "Ese slug ya está en uso. Prueba con otro.",
  "not-found": "La locación no existe o no pertenece a tu cuenta.",
  "load-failed": "No pudimos cargar la locación. Inténtalo de nuevo.",
  "save-failed": "No pudimos guardar la locación. Inténtalo de nuevo.",
  "archive-failed": "No pudimos archivar la locación. Inténtalo de nuevo.",
};

const LOCATION_SUCCESS_MESSAGES: Record<LocationSuccess, string> = {
  "created-draft": "Borrador creado.",
  "created-published": "Locación publicada.",
  saved: "Cambios guardados.",
  published: "Locación publicada.",
  unpublished: "La locación volvió a borrador y ya no es pública.",
  archived: "Locación archivada.",
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRICE_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const MAX_PRICE = 9_999_999_999.99;

export function parseLocationFormData(
  formData: FormData,
  existing?: Pick<LocationFormValues, "price_amount" | "price_currency" | "price_unit" | "rate_mode" | "characteristics" | "tour_video_url">,
):
  | { ok: true; values: LocationFormValues }
  | { ok: false; error: LocationFormError } {
  const title = getText(formData, "title");
  if (!isRequiredText(title, 160)) {
    return { ok: false, error: "invalid-title" };
  }

  const slug = slugify(getText(formData, "slug") || title);
  if (!slug || slug.length > 160 || !SLUG_PATTERN.test(slug)) {
    return { ok: false, error: "invalid-slug" };
  }

  const summary = getOptionalText(formData, "summary");
  if (summary && summary.length > 500) {
    return { ok: false, error: "invalid-summary" };
  }

  const description = getOptionalText(formData, "description");
  if (description && description.length > 20_000) {
    return { ok: false, error: "invalid-description" };
  }

  const city = getText(formData, "city");
  if (!isRequiredText(city, 120)) {
    return { ok: false, error: "invalid-city" };
  }

  const area = getOptionalText(formData, "area");
  if (area && area.length > 120) {
    return { ok: false, error: "invalid-area" };
  }

  const spaceType = getText(formData, "space_type");
  if (!isRequiredText(spaceType, 120)) {
    return { ok: false, error: "invalid-space-type" };
  }

  const environment = getText(formData, "environment");
  if (!isLocationEnvironment(environment)) {
    return { ok: false, error: "invalid-environment" };
  }

  const restrictions = getOptionalText(formData, "restrictions");
  if (restrictions && restrictions.length > 10_000) {
    return { ok: false, error: "invalid-restrictions" };
  }

  const priceResult = existing ? {
    ok: true as const,
    priceAmount: existing.price_amount,
    priceCurrency: existing.price_currency,
    priceUnit: existing.price_unit,
  } : parsePrice(formData);
  if (!priceResult.ok) {
    return priceResult;
  }

  const characteristics = parseLocationCharacteristics(formData, existing?.characteristics);
  if (!characteristics.ok) {
    return { ok: false, error: "invalid-characteristics" };
  }
  const rawCapacity = characteristics.value.declared_capacity;
  const pricing = parseLocationPricingForm(
    formData,
    typeof rawCapacity === "number" ? rawCapacity : null,
    existing?.rate_mode === "legacy",
  );
  if (!pricing.ok) return pricing;

  const operationalNotes = getOptionalText(formData, "operational_notes");
  if (operationalNotes && operationalNotes.length > 5_000) {
    return { ok: false, error: "invalid-operational-notes" };
  }

  return {
    ok: true,
    values: {
      title,
      slug,
      summary,
      description,
      city,
      area,
      space_type: spaceType,
      environment,
      price_amount: priceResult.priceAmount,
      price_currency: priceResult.priceCurrency,
      price_unit: priceResult.priceUnit,
      rate_mode: pricing.value.rateMode,
      rate_tiers: pricing.value.rateTiers,
      minimum_hours: pricing.value.minimumHours,
      restrictions,
      characteristics: characteristics.value,
      shooting_conditions: parseLocationConditions(formData),
      // Historical external tours are immutable from this editor. New tours
      // can only become active after Mux/provider attestation.
      tour_video_url: existing?.tour_video_url ?? null,
      operational_notes: operationalNotes,
    },
  };
}

export function getLocationErrorMessage(code: string | undefined) {
  return isLocationFormError(code) ? LOCATION_ERROR_MESSAGES[code] : undefined;
}

export function getLocationSuccessMessage(code: string | undefined) {
  return isLocationSuccess(code) ? LOCATION_SUCCESS_MESSAGES[code] : undefined;
}

export function getLocationDatabaseError(
  error: { code?: string; message?: string } | null
): LocationFormError {
  if (error?.code === "23505") {
    return "slug-taken";
  }

  const message = error?.message ?? "";
  if (message.includes("locations_price_fields_check")) {
    return "incomplete-price";
  }

  if (
    error?.code === "22P02" ||
    error?.code === "22003" ||
    message.includes("locations_price_amount_check")
  ) {
    return "invalid-price";
  }

  if (message.includes("locations_slug_check")) {
    return "invalid-slug";
  }

  if (message.includes("locations_attendee_pricing_check") || message.includes("locations_minimum_hours_check")) {
    return "invalid-pricing";
  }

  if (message.includes("locations_beta_v1")) {
    return "save-failed";
  }

  return "save-failed";
}

export function getLocationStatusLabel(status: LocationStatus) {
  return {
    draft: "Borrador",
    published: "Publicada",
    archived: "Archivada",
  }[status];
}

function parsePrice(
  formData: FormData
):
  | {
      ok: true;
      priceAmount: number | null;
      priceCurrency: string | null;
      priceUnit: LocationPriceUnit | null;
    }
  | { ok: false; error: LocationFormError } {
  const amount = getText(formData, "price_amount");
  const currency = getText(formData, "price_currency").toUpperCase();
  const unit = getText(formData, "price_unit");

  if (!amount && !currency && !unit) {
    return {
      ok: true,
      priceAmount: null,
      priceCurrency: null,
      priceUnit: null,
    };
  }

  if (!amount || !currency || !unit) {
    return { ok: false, error: "incomplete-price" };
  }

  const parsedAmount = Number(amount);
  if (
    !PRICE_PATTERN.test(amount) ||
    !Number.isFinite(parsedAmount) ||
    parsedAmount < 0 ||
    parsedAmount > MAX_PRICE
  ) {
    return { ok: false, error: "invalid-price" };
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, error: "invalid-currency" };
  }

  if (!isLocationPriceUnit(unit)) {
    return { ok: false, error: "invalid-price-unit" };
  }

  return {
    ok: true,
    priceAmount: parsedAmount,
    priceCurrency: currency,
    priceUnit: unit,
  };
}

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getOptionalText(formData: FormData, key: string) {
  return getText(formData, key) || null;
}

function isRequiredText(value: string, maxLength: number) {
  return value.length > 0 && value.length <= maxLength && /\S/.test(value);
}

function isLocationEnvironment(value: string): value is LocationEnvironment {
  return LOCATION_ENVIRONMENTS.some((option) => option.value === value);
}

function isLocationPriceUnit(value: string): value is LocationPriceUnit {
  return LOCATION_PRICE_UNITS.some((option) => option.value === value);
}

function isLocationFormError(value: string | undefined): value is LocationFormError {
  return Boolean(value && value in LOCATION_ERROR_MESSAGES);
}

function isLocationSuccess(value: string | undefined): value is LocationSuccess {
  return Boolean(value && value in LOCATION_SUCCESS_MESSAGES);
}
