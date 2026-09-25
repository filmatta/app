"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getLocationDatabaseError,
  LOCATION_ENVIRONMENTS,
  parseLocationFormData,
  type LocationFormError,
  type LocationStatus,
  type LocationSuccess,
} from "@/lib/locations/form";
import { parseLocationPublicContact, type LocationPublicContact } from "@/lib/locations/contact";
import { normalizeLocationCharacteristics, parseLocationCharacteristics } from "@/lib/locations/characteristics";
import { parseLocationConditions } from "@/lib/locations/conditions";
import { resolveMexicoGeography } from "@/lib/locations/geography";
import { normalizeLocationRateMode, parseLocationPricingForm } from "@/lib/locations/pricing";
import { slugify } from "@/lib/slugify";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExistingLocation = {
  id: string;
  slug: string;
  status: LocationStatus;
  price_amount: number | null;
  price_currency: string | null;
  price_unit: import("@/lib/locations/form").LocationPriceUnit | null;
  rate_mode: import("@/lib/locations/pricing").LocationRateMode;
  characteristics: import("@/lib/locations/characteristics").LocationCharacteristics;
  tour_video_url: string | null;
};

export async function createLocation(formData: FormData) {
  const { supabase, userId } = await requireLocationUser(
    "/mis-locaciones/nueva"
  );
  const title = getText(formData, "title");
  const spaceType = getText(formData, "space_type");
  const area = getText(formData, "area") || null;
  const creationKey = getText(formData, "creation_key");
  if (!title || title.length > 160) redirect(newLocationFeedback("invalid-title"));
  if (!spaceType || spaceType.length > 120) redirect(newLocationFeedback("invalid-space-type"));
  if (area && area.length > 120) redirect(newLocationFeedback("invalid-area"));
  if (!UUID_PATTERN.test(creationKey)) redirect(newLocationFeedback("invalid-action"));

  const capacityRaw = getText(formData, "characteristic.declared_capacity");
  const capacity = /^\d+$/.test(capacityRaw) ? Number(capacityRaw) : null;
  if (!Number.isSafeInteger(capacity) || capacity === null || capacity < 1 || capacity > 1_000_000) {
    redirect(newLocationFeedback("invalid-characteristics"));
  }
  const pricing = parseLocationPricingForm(formData, capacity, false);
  if (!pricing.ok) redirect(newLocationFeedback(pricing.error));

  let geography;
  try {
    geography = await resolveMexicoGeography({
      countryCode: getText(formData, "country_code"),
      regionCode: getText(formData, "region_code"),
      municipalityCode: getText(formData, "municipality_code"),
      localityCode: getText(formData, "locality_code"),
    });
  } catch (error) {
    console.error("Error validando geografía de la locación:", { name: error instanceof Error ? error.name : "UnknownError" });
    redirect(newLocationFeedback("geography-unavailable"));
  }
  if (!geography) redirect(newLocationFeedback("invalid-geography"));

  const baseSlug = slugify(title) || "locacion";
  const slug = `${baseSlug.slice(0, 151)}-${crypto.randomUUID().slice(0, 8)}`;

  const { data, error } = await supabase
    .from("locations")
    .insert({
      title,
      slug,
      summary: null,
      description: null,
      city: geography.localityName,
      area,
      space_type: spaceType,
      environment: "both",
      price_amount: null,
      price_currency: null,
      price_unit: null,
      rate_mode: pricing.value.rateMode,
      rate_tiers: pricing.value.rateTiers,
      minimum_hours: pricing.value.minimumHours,
      restrictions: null,
      characteristics: { declared_capacity: capacity },
      shooting_conditions: parseLocationConditions(formData),
      operational_notes: null,
      country_code: geography.countryCode,
      region_code: geography.regionCode,
      region_name: geography.regionName,
      municipality_code: geography.municipalityCode,
      municipality_name: geography.municipalityName,
      locality_code: geography.localityCode,
      geography_source: geography.source,
      creation_key: creationKey,
      owner_id: userId,
      status: "draft",
    })
    .select("id, slug")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      const existing = await supabase.from("locations").select("id,slug")
        .eq("owner_id", userId).eq("creation_key", creationKey).maybeSingle();
      if (existing.data) redirect(editLocationFeedback(existing.data.id, "success", "saved"));
    }
    logLocationError("Error creando la locación:", error);
    redirect(newLocationFeedback(getLocationDatabaseError(error)));
  }

  revalidateLocationPaths(data.slug);
  redirect(editLocationFeedback(data.id, "success", "created-draft"));
}

export type LocationEditorSection =
  | "identity"
  | "location"
  | "pricing"
  | "description"
  | "characteristics"
  | "conditions"
  | "notes"
  | "contact";

export async function updateLocationSection(locationId: string, section: LocationEditorSection, formData: FormData) {
  if (!UUID_PATTERN.test(locationId)) redirect(locationsErrorFeedback("not-found"));
  const editPath = `/mis-locaciones/${locationId}/editar`;
  const { supabase, userId } = await requireLocationUser(editPath);
  const result = await supabase.from("locations")
    .select("id,slug,status,price_amount,price_currency,price_unit,rate_mode,rate_tiers,minimum_hours,characteristics,tour_video_url")
    .eq("id", locationId).eq("owner_id", userId).maybeSingle();
  if (result.error) {
    logLocationError("Error cargando sección de la locación:", result.error);
    redirect(editLocationSectionFeedback(locationId, section, "error", "load-failed"));
  }
  if (!result.data) redirect(locationsErrorFeedback("not-found"));

  const existing = result.data;
  let values: Record<string, unknown> = {};
  if (section === "identity") {
    const title = getText(formData, "title");
    const slug = slugify(getText(formData, "slug") || title);
    const spaceType = getText(formData, "space_type");
    const environment = getText(formData, "environment");
    if (!title || title.length > 160) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-title"));
    if (!slug || slug.length > 160) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-slug"));
    if (!spaceType || spaceType.length > 120) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-space-type"));
    if (!LOCATION_ENVIRONMENTS.some((item) => item.value === environment)) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-environment"));
    values = { title, slug, space_type: spaceType, environment };
  } else if (section === "location") {
    const area = getText(formData, "area") || null;
    const postalCode = getText(formData, "postal_code");
    if (area && area.length > 120) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-area"));
    if (!/^\d{5}$/.test(postalCode)) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-geography"));
    let geography;
    try {
      geography = await resolveMexicoGeography({
        countryCode: getText(formData, "country_code"), regionCode: getText(formData, "region_code"),
        municipalityCode: getText(formData, "municipality_code"), localityCode: getText(formData, "locality_code"),
      });
    } catch (error) {
      console.error("Error validando geografía de la locación:", { name: error instanceof Error ? error.name : "UnknownError" });
      redirect(editLocationSectionFeedback(locationId, section, "error", "geography-unavailable"));
    }
    if (!geography) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-geography"));
    values = {
      city: geography.localityName, area, country_code: geography.countryCode,
      region_code: geography.regionCode, region_name: geography.regionName,
      municipality_code: geography.municipalityCode, municipality_name: geography.municipalityName,
      locality_code: geography.localityCode, postal_code: postalCode, geography_source: geography.source,
    };
  } else if (section === "pricing") {
    const rawCapacity = getText(formData, "characteristic.declared_capacity");
    const capacity = /^\d+$/.test(rawCapacity) ? Number(rawCapacity) : null;
    if (!Number.isSafeInteger(capacity) || capacity === null || capacity < 1 || capacity > 1_000_000) {
      redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-characteristics"));
    }
    const currentMode = normalizeLocationRateMode(existing.rate_mode);
    const pricing = parseLocationPricingForm(formData, capacity, currentMode === "legacy");
    if (!pricing.ok) redirect(editLocationSectionFeedback(locationId, section, "error", pricing.error));
    const keepLegacy = pricing.value.rateMode === "legacy";
    values = {
      characteristics: { ...normalizeLocationCharacteristics(existing.characteristics), declared_capacity: capacity },
      rate_mode: pricing.value.rateMode,
      rate_tiers: pricing.value.rateTiers,
      minimum_hours: pricing.value.minimumHours,
      price_amount: keepLegacy ? existing.price_amount : null,
      price_currency: keepLegacy ? existing.price_currency : null,
      price_unit: keepLegacy ? existing.price_unit : null,
    };
  } else if (section === "description") {
    const summary = getText(formData, "summary") || null;
    const description = getText(formData, "description") || null;
    if (summary && summary.length > 500) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-summary"));
    if (description && description.length > 20_000) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-description"));
    values = { summary, description };
  } else if (section === "characteristics") {
    const current = normalizeLocationCharacteristics(existing.characteristics);
    const parsed = parseLocationCharacteristics(formData, current);
    if (!parsed.ok) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-characteristics"));
    values = { characteristics: { ...parsed.value, ...(typeof current.declared_capacity === "number" ? { declared_capacity: current.declared_capacity } : {}) } };
  } else if (section === "conditions") {
    values = { shooting_conditions: parseLocationConditions(formData) };
  } else if (section === "notes") {
    const restrictions = getText(formData, "restrictions") || null;
    const operationalNotes = getText(formData, "operational_notes") || null;
    if (restrictions && restrictions.length > 10_000) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-restrictions"));
    if (operationalNotes && operationalNotes.length > 5_000) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-operational-notes"));
    values = { restrictions, operational_notes: operationalNotes };
  } else if (section === "contact") {
    const contact = parseLocationPublicContact(formData);
    if (!contact.ok) redirect(editLocationSectionFeedback(locationId, section, "error", "invalid-contact"));
    const contactError = await saveLocationContact(supabase, userId, locationId, contact.value);
    if (contactError) {
      logLocationError("Error guardando contacto de la locación:", contactError);
      redirect(editLocationSectionFeedback(locationId, section, "error", "save-failed"));
    }
    revalidateLocationPaths(existing.slug, existing.slug, locationId);
    redirect(editLocationSectionFeedback(locationId, section, "success", "saved"));
  }

  const update = await supabase.from("locations").update(values)
    .eq("id", locationId).eq("owner_id", userId).select("slug").maybeSingle();
  if (update.error) {
    logLocationError("Error actualizando sección de la locación:", update.error);
    redirect(editLocationSectionFeedback(locationId, section, "error", getLocationDatabaseError(update.error)));
  }
  if (!update.data) redirect(locationsErrorFeedback("not-found"));
  revalidateLocationPaths(existing.slug, update.data.slug, locationId);
  redirect(editLocationSectionFeedback(locationId, section, "success", "saved"));
}

export async function updateLocationStatus(locationId: string, formData: FormData) {
  if (!UUID_PATTERN.test(locationId)) redirect(locationsErrorFeedback("not-found"));
  const { supabase, userId } = await requireLocationUser(`/mis-locaciones/${locationId}/editar`);
  const existing = await getOwnedLocation(supabase, userId, locationId);
  if (!existing) redirect(locationsErrorFeedback("not-found"));
  const intent = getText(formData, "intent");
  const nextStatus = getUpdateStatus(intent, existing.status);
  if (!nextStatus) redirect(editLocationFeedback(locationId, "error", "invalid-action"));
  const updated = await supabase.from("locations").update({ status: nextStatus })
    .eq("id", locationId).eq("owner_id", userId).select("slug,status").maybeSingle();
  if (updated.error) {
    logLocationError("Error cambiando estado de la locación:", updated.error);
    redirect(editLocationFeedback(locationId, "error", getLocationDatabaseError(updated.error)));
  }
  if (!updated.data) redirect(locationsErrorFeedback("not-found"));
  revalidateLocationPaths(existing.slug, updated.data.slug, locationId);
  redirect(editLocationFeedback(locationId, "success", getUpdateSuccess(existing.status, nextStatus)));
}

export async function updateLocation(locationId: string, formData: FormData) {
  if (!UUID_PATTERN.test(locationId)) {
    redirect(locationsErrorFeedback("not-found"));
  }

  const editPath = `/mis-locaciones/${locationId}/editar`;
  const { supabase, userId } = await requireLocationUser(editPath);
  const existing = await getOwnedLocation(supabase, userId, locationId);

  if (!existing) {
    redirect(locationsErrorFeedback("not-found"));
  }

  const parsed = parseLocationFormData(formData, existing);
  if (!parsed.ok) {
    redirect(editLocationFeedback(locationId, "error", parsed.error));
  }
  const contact = parseLocationPublicContact(formData);
  if (!contact.ok) redirect(editLocationFeedback(locationId, "error", "invalid-contact"));

  const intent = getText(formData, "intent");
  const nextStatus = getUpdateStatus(intent, existing.status);
  if (!nextStatus) {
    redirect(editLocationFeedback(locationId, "error", "invalid-action"));
  }

  const { data, error } = await supabase
    .from("locations")
    .update({
      ...parsed.values,
      status: nextStatus,
    })
    .eq("id", locationId)
    .eq("owner_id", userId)
    .select("id, slug, status")
    .maybeSingle();

  if (error) {
    logLocationError("Error actualizando la locación:", error);
    redirect(
      editLocationFeedback(
        locationId,
        "error",
        getLocationDatabaseError(error)
      )
    );
  }

  if (!data) {
    redirect(locationsErrorFeedback("not-found"));
  }

  const contactError = await saveLocationContact(supabase, userId, locationId, contact.value);
  if (contactError) {
    logLocationError("Error guardando el contacto de la locación:", contactError);
    redirect(editLocationFeedback(locationId, "error", "save-failed"));
  }

  revalidateLocationPaths(existing.slug, data.slug, locationId);
  redirect(
    editLocationFeedback(
      locationId,
      "success",
      getUpdateSuccess(existing.status, nextStatus)
    )
  );
}

export async function archiveLocation(locationId: string) {
  if (!UUID_PATTERN.test(locationId)) {
    redirect(locationsErrorFeedback("not-found"));
  }

  const editPath = `/mis-locaciones/${locationId}/editar`;
  const { supabase, userId } = await requireLocationUser(editPath);
  const existing = await getOwnedLocation(supabase, userId, locationId);

  if (!existing) {
    redirect(locationsErrorFeedback("not-found"));
  }

  const { data, error } = await supabase
    .from("locations")
    .update({ status: "archived" })
    .eq("id", locationId)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    logLocationError("Error archivando la locación:", error);
    redirect(editLocationFeedback(locationId, "error", "archive-failed"));
  }

  if (!data) {
    redirect(locationsErrorFeedback("not-found"));
  }

  revalidateLocationPaths(existing.slug, undefined, locationId);
  redirect(locationsFeedback("archived"));
}

async function requireLocationUser(nextPath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect(`/acceso?next=${encodeURIComponent(nextPath)}`);
  }

  return { supabase, userId: data.user.id };
}

async function getOwnedLocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  locationId: string
) {
  const { data, error } = await supabase
    .from("locations")
    .select("id, slug, status, price_amount, price_currency, price_unit, rate_mode, characteristics, tour_video_url")
    .eq("id", locationId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    logLocationError("Error verificando la locación:", error);
    redirect(editLocationFeedback(locationId, "error", "load-failed"));
  }

  return (data as ExistingLocation | null) ?? null;
}

function getUpdateStatus(
  intent: string,
  currentStatus: LocationStatus
): LocationStatus | null {
  if (intent === "preserve") {
    return currentStatus;
  }

  if (intent === "draft" || intent === "published") {
    return intent;
  }

  return null;
}

function getUpdateSuccess(
  previousStatus: LocationStatus,
  nextStatus: LocationStatus
): LocationSuccess {
  if (previousStatus === "published" && nextStatus === "draft") {
    return "unpublished";
  }

  if (previousStatus !== "published" && nextStatus === "published") {
    return "published";
  }

  return "saved";
}

function revalidateLocationPaths(
  previousSlug?: string,
  currentSlug?: string,
  locationId?: string
) {
  revalidatePath("/mis-locaciones");
  revalidatePath("/locaciones");

  if (locationId) {
    revalidatePath(`/mis-locaciones/${locationId}/editar`);
  }

  const slugs = [previousSlug, currentSlug].filter(
    (slug): slug is string => Boolean(slug)
  );

  for (const slug of new Set(slugs)) {
    revalidatePath(`/locaciones/${slug}`);
  }
}

function newLocationFeedback(error: LocationFormError) {
  const searchParams = new URLSearchParams({ error });
  return `/mis-locaciones/nueva?${searchParams.toString()}`;
}

function editLocationFeedback(
  locationId: string,
  type: "error" | "success",
  code: LocationFormError | LocationSuccess
) {
  const searchParams = new URLSearchParams({
    [type]: code,
    notice: crypto.randomUUID(),
  });
  return `/mis-locaciones/${locationId}/editar?${searchParams.toString()}`;
}

function editLocationSectionFeedback(
  locationId: string,
  section: LocationEditorSection,
  type: "error" | "success",
  code: LocationFormError | LocationSuccess,
) {
  const searchParams = new URLSearchParams({
    [type]: code,
    section,
    notice: crypto.randomUUID(),
  });
  return `/mis-locaciones/${locationId}/editar?${searchParams.toString()}`;
}

function locationsFeedback(success: LocationSuccess) {
  const searchParams = new URLSearchParams({
    success,
    notice: crypto.randomUUID(),
  });
  return `/mis-locaciones?${searchParams.toString()}`;
}

function locationsErrorFeedback(error: LocationFormError) {
  const searchParams = new URLSearchParams({
    error,
    notice: crypto.randomUUID(),
  });
  return `/mis-locaciones?${searchParams.toString()}`;
}

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function logLocationError(
  message: string,
  error: { code?: string; message?: string } | null
) {
  console.error(message, {
    code: error?.code ?? "unknown",
    message: error?.message ?? "Unknown database error",
  });
}

async function saveLocationContact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  _userId: string,
  locationId: string,
  contact: LocationPublicContact,
) {
  const { error } = await supabase.rpc("save_my_location_contact_channels", {
    p_location_id: locationId,
    p_channels: contact,
  });
  return error;
}
