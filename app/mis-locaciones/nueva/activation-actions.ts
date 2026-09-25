"use server";

import { revalidatePath } from "next/cache";
import { normalizeLocationCharacteristics } from "@/lib/locations/characteristics";
import {
  LOCATION_ACTIVATION_CONDITION_KEYS,
  LOCATION_SPACE_TYPES,
  locationActivationStep,
  type LocationActivationStep,
} from "@/lib/locations/activation";
import { parseLocationPublicContact } from "@/lib/locations/contact";
import {
  LOCATION_CONDITION_VALUES,
  normalizeLocationConditions,
  type LocationConditionValue,
} from "@/lib/locations/conditions";
import { LOCATION_ENVIRONMENTS } from "@/lib/locations/form";
import { resolveMexicoGeography } from "@/lib/locations/geography";
import {
  locationPricingProblem,
  normalizeLocationRateMode,
  normalizeLocationRateTiers,
  parseLocationPricingForm,
} from "@/lib/locations/pricing";
import { slugify } from "@/lib/slugify";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONDITION_VALUES = new Set<string>(LOCATION_CONDITION_VALUES);

export type LocationActivationResult =
  | { ok: true; locationId: string; nextStep: LocationActivationStep; completed: boolean }
  | { ok: false; message: string; field?: string };

type ActivationLocation = {
  id: string;
  slug: string;
  title: string;
  status: string;
  characteristics: unknown;
  shooting_conditions: unknown;
  rate_mode: unknown;
  rate_tiers: unknown;
  minimum_hours: number | null;
  price_amount: number | null;
  price_currency: string | null;
  price_unit: string | null;
  onboarding_step: number | null;
  onboarding_completed_at: string | null;
};

export async function createLocationActivationDraft(formData: FormData): Promise<LocationActivationResult> {
  const auth = await activationUser();
  if (!auth) return failure("Tu sesión terminó. Inicia sesión de nuevo.");
  const { supabase, userId } = auth;
  const title = text(formData, "title");
  const spaceType = text(formData, "space_type");
  const environment = text(formData, "environment");
  const area = text(formData, "area") || null;
  const creationKey = text(formData, "creation_key");
  if (!title || title.length > 160) return failure("Escribe un nombre válido para la locación.", "title");
  if (!LOCATION_SPACE_TYPES.some((item) => item === spaceType)) return failure("Selecciona el tipo de espacio.", "space_type");
  if (!LOCATION_ENVIRONMENTS.some((item) => item.value === environment)) return failure("Selecciona si el espacio es interior, exterior o mixto.", "environment");
  if (area && area.length > 120) return failure("La zona aproximada es demasiado larga.", "area");
  if (!UUID_PATTERN.test(creationKey)) return failure("No pudimos identificar este intento. Recarga la página.");

  const geography = await activationGeography(formData);
  if (!geography.ok) return geography.result;
  const slug = `${(slugify(title) || "locacion").slice(0, 151)}-${crypto.randomUUID().slice(0, 8)}`;
  const inserted = await supabase.from("locations").insert({
    title,
    slug,
    summary: null,
    description: null,
    city: geography.value.localityName,
    area,
    space_type: spaceType,
    environment,
    price_amount: null,
    price_currency: null,
    price_unit: null,
    rate_mode: "legacy",
    rate_tiers: [],
    minimum_hours: null,
    restrictions: null,
    characteristics: {},
    shooting_conditions: {},
    operational_notes: null,
    country_code: geography.value.countryCode,
    region_code: geography.value.regionCode,
    region_name: geography.value.regionName,
    municipality_code: geography.value.municipalityCode,
    municipality_name: geography.value.municipalityName,
    locality_code: geography.value.localityCode,
    geography_source: geography.value.source,
    creation_key: creationKey,
    owner_id: userId,
    status: "draft",
    onboarding_step: 3,
    onboarding_completed_at: null,
  }).select("id").single();

  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === "23505") {
      const existing = await supabase.from("locations")
        .select("id,onboarding_step,onboarding_completed_at")
        .eq("owner_id", userId)
        .eq("creation_key", creationKey)
        .maybeSingle();
      const step = locationActivationStep(existing.data?.onboarding_step);
      if (existing.data && step) {
        return { ok: true, locationId: existing.data.id, nextStep: step, completed: step === 8 && Boolean(existing.data.onboarding_completed_at) };
      }
    }
    logActivationError("Error creando el borrador de Location Activation:", inserted.error);
    return failure("No pudimos crear el borrador. Inténtalo de nuevo.");
  }

  revalidatePath("/mis-locaciones");
  return { ok: true, locationId: inserted.data.id, nextStep: 3, completed: false };
}

export async function saveLocationActivationStep(
  locationId: string,
  requestedStep: number,
  formData: FormData,
): Promise<LocationActivationResult> {
  const step = locationActivationStep(requestedStep);
  if (!UUID_PATTERN.test(locationId) || !step || step === 8) return failure("La etapa solicitada no es válida.");
  const auth = await activationUser();
  if (!auth) return failure("Tu sesión terminó. Inicia sesión de nuevo.");
  const { supabase, userId } = auth;
  const loaded = await supabase.from("locations")
    .select("id,slug,title,status,characteristics,shooting_conditions,rate_mode,rate_tiers,minimum_hours,price_amount,price_currency,price_unit,onboarding_step,onboarding_completed_at")
    .eq("id", locationId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (loaded.error) {
    logActivationError("Error cargando Location Activation:", loaded.error);
    return failure("No pudimos cargar el borrador. Inténtalo de nuevo.");
  }
  if (!loaded.data) return failure("No encontramos una locación propia con ese identificador.");
  const location = loaded.data as ActivationLocation;
  const savedStep = locationActivationStep(location.onboarding_step);
  if (!savedStep) return failure("Esta locación usa el editor normal y no pertenece al walkthrough.");
  const alreadyCompleted = savedStep === 8 && Boolean(location.onboarding_completed_at);
  if (!alreadyCompleted && step > savedStep) return failure("Completa primero la etapa anterior.");

  let values: Record<string, unknown> = {};
  if (step === 1) {
    const title = text(formData, "title");
    const spaceType = text(formData, "space_type");
    const environment = text(formData, "environment");
    if (!title || title.length > 160) return failure("Escribe un nombre válido para la locación.", "title");
    if (!LOCATION_SPACE_TYPES.some((item) => item === spaceType)) return failure("Selecciona el tipo de espacio.", "space_type");
    if (!LOCATION_ENVIRONMENTS.some((item) => item.value === environment)) return failure("Selecciona el tipo de entorno.", "environment");
    values = { title, space_type: spaceType, environment };
  } else if (step === 2) {
    const area = text(formData, "area") || null;
    if (area && area.length > 120) return failure("La zona aproximada es demasiado larga.", "area");
    const geography = await activationGeography(formData);
    if (!geography.ok) return geography.result;
    values = {
      city: geography.value.localityName,
      area,
      country_code: geography.value.countryCode,
      region_code: geography.value.regionCode,
      region_name: geography.value.regionName,
      municipality_code: geography.value.municipalityCode,
      municipality_name: geography.value.municipalityName,
      locality_code: geography.value.localityCode,
      geography_source: geography.value.source,
    };
  } else if (step === 3) {
    const capacity = positiveInteger(text(formData, "characteristic.declared_capacity"));
    if (capacity === null) return failure("Indica cuántas personas caben cómodamente.", "characteristic.declared_capacity");
    const mode = normalizeLocationRateMode(location.rate_mode);
    const tiers = normalizeLocationRateTiers(location.rate_tiers);
    if (mode === "tiers" && locationPricingProblem(capacity, tiers.map((tier) => ({ ...tier, price: tier.price })))) {
      return failure("La nueva capacidad no coincide con los rangos guardados. Ajusta capacidad y tarifas desde la ficha owner.");
    }
    values = { characteristics: { ...normalizeLocationCharacteristics(location.characteristics), declared_capacity: capacity } };
  } else if (step === 4) {
    const characteristics = normalizeLocationCharacteristics(location.characteristics);
    const capacity = typeof characteristics.declared_capacity === "number" ? characteristics.declared_capacity : null;
    const pricing = parseLocationPricingForm(formData, capacity, false);
    if (!pricing.ok) {
      return failure(pricing.error === "incomplete-pricing" ? "Completa todos los importes de los rangos." : "Revisa la tarifa y sus rangos.");
    }
    values = {
      rate_mode: pricing.value.rateMode,
      rate_tiers: pricing.value.rateTiers,
      minimum_hours: pricing.value.minimumHours,
      price_amount: null,
      price_currency: null,
      price_unit: null,
    };
  } else if (step === 5) {
    const photos = await supabase.from("location_photos")
      .select("id", { count: "exact", head: true })
      .eq("location_id", locationId)
      .eq("owner_id", userId)
      .eq("lifecycle_status", "uploading");
    if (photos.error) return failure("No pudimos comprobar el estado de las fotos.");
    if ((photos.count ?? 0) > 0) return failure("Espera a que las fotos terminen de verificarse o resuelve las pendientes antes de continuar.");
  } else if (step === 6) {
    if (text(formData, "activation_skip") !== "conditions") {
      const conditions = { ...normalizeLocationConditions(location.shooting_conditions) };
      for (const key of LOCATION_ACTIVATION_CONDITION_KEYS) {
        const raw = text(formData, `condition.${key}`);
        if (CONDITION_VALUES.has(raw)) conditions[key] = raw as LocationConditionValue;
        else delete conditions[key];
      }
      values = { shooting_conditions: conditions };
    }
  } else if (step === 7) {
    if (text(formData, "activation_skip") !== "contact") {
      const parsed = parseLocationPublicContact(formData);
      if (!parsed.ok) return failure("Revisa los canales de contacto.");
      if (!Object.values(parsed.value).some(Boolean)) return failure("Añade al menos un canal o elige “Omitir por ahora”.");
      const contact = await supabase.rpc("save_my_location_contact_channels", {
        p_location_id: locationId,
        p_channels: parsed.value,
      });
      if (contact.error) {
        logActivationError("Error guardando contacto de Location Activation:", contact.error);
        return failure("No pudimos guardar el contacto. Inténtalo de nuevo.");
      }
    }
  }

  const nextStep = alreadyCompleted ? 8 : Math.max(savedStep, step + 1) as LocationActivationStep;
  const completing = !alreadyCompleted && nextStep === 8;
  const updated = await supabase.from("locations").update({
    ...values,
    onboarding_step: nextStep,
    onboarding_completed_at: completing ? new Date().toISOString() : location.onboarding_completed_at,
  }).eq("id", locationId).eq("owner_id", userId).select("id,status,onboarding_step,onboarding_completed_at").maybeSingle();
  if (updated.error) {
    logActivationError("Error guardando Location Activation:", updated.error);
    return failure("No pudimos guardar esta etapa. Tus datos siguen en pantalla para reintentar.");
  }
  if (!updated.data) return failure("No encontramos una locación propia con ese identificador.");
  revalidatePath("/mis-locaciones");
  revalidatePath(`/mis-locaciones/${locationId}/editar`);
  return { ok: true, locationId, nextStep, completed: nextStep === 8 && Boolean(updated.data.onboarding_completed_at) };
}

async function activationUser() {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  return auth.error || !auth.data.user ? null : { supabase, userId: auth.data.user.id };
}

async function activationGeography(formData: FormData): Promise<
  | { ok: true; value: NonNullable<Awaited<ReturnType<typeof resolveMexicoGeography>>> }
  | { ok: false; result: LocationActivationResult }
> {
  try {
    const geography = await resolveMexicoGeography({
      countryCode: text(formData, "country_code"),
      regionCode: text(formData, "region_code"),
      municipalityCode: text(formData, "municipality_code"),
      localityCode: text(formData, "locality_code"),
    });
    return geography
      ? { ok: true, value: geography }
      : { ok: false, result: failure("Selecciona una ubicación válida del catálogo.", "region_code") };
  } catch (error) {
    console.error("Error validando geografía de Location Activation:", { name: error instanceof Error ? error.name : "UnknownError" });
    return { ok: false, result: failure("No pudimos validar la ubicación. Inténtalo de nuevo.") };
  }
}

function positiveInteger(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 1_000_000 ? parsed : null;
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function failure(message: string, field?: string): LocationActivationResult {
  return { ok: false, message, ...(field ? { field } : {}) };
}

function logActivationError(message: string, error: { code?: string; message?: string } | null) {
  console.error(message, { code: error?.code ?? "unknown", message: error?.message ?? "Unknown database error" });
}
