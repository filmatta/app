import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { catalogErrorKind, PAGE_SIZE, parseCatalogFilters, type CatalogFilters } from "@/lib/catalogs/filters";
import { normalizeLocationCharacteristics, type LocationCharacteristics } from "@/lib/locations/characteristics";
import { normalizeLocationConditions, type LocationConditions } from "@/lib/locations/conditions";

export type PublicLocationPhoto = { id: string; imageUrl: string; altText: string | null };
export type PublicLocationContact = { email: string | null; phone: string | null; whatsapp: string | null; website: string | null };
export type PublicLocation = {
  id: string; title: string; slug: string; summary: string | null; description: string | null;
  city: string; area: string | null; spaceType: string; environment: "interior" | "exterior" | "both";
  priceAmount: number | null; priceCurrency: string | null; priceUnit: "hour" | "half_day" | "day" | "project" | null;
  restrictions: string | null; characteristics: LocationCharacteristics; shootingConditions: LocationConditions;
  tourVideoUrl: string | null; operationalNotes: string | null; publishedAt: string;
  photos: PublicLocationPhoto[]; contact: PublicLocationContact | null;
};
export type PublicLocationSummary = Omit<PublicLocation, "description" | "restrictions" | "characteristics" | "shootingConditions" | "tourVideoUrl" | "operationalNotes" | "contact">;
export type PublicLocationsResult = { ok: true; locations: PublicLocationSummary[]; hasNext: boolean } | { ok: false; locations: []; kind: "unconfigured" | "error" };
export type PublicLocationResult = { kind: "found"; location: PublicLocation } | { kind: "not-found" } | { kind: "error" };

type PublicRow = {
  id: string; title: string; slug: string; summary: string | null; description?: string | null;
  city: string; area: string | null; space_type: string; environment: PublicLocation["environment"];
  price_amount: number | null; price_currency: string | null; price_unit: PublicLocation["priceUnit"];
  restrictions?: string | null; characteristics?: unknown; shooting_conditions?: unknown;
  tour_video_url?: string | null; operational_notes?: string | null; published_at: string;
  photos?: unknown; contact?: PublicLocationContact | null;
};

function mapPhotos(value: unknown): PublicLocationPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((photo) => {
    if (!photo || typeof photo !== "object") return [];
    const row = photo as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.image_url !== "string") return [];
    return [{ id: row.id, imageUrl: row.image_url, altText: typeof row.alt_text === "string" ? row.alt_text : null }];
  });
}

function mapSummary(row: PublicRow): PublicLocationSummary {
  return {
    id: row.id, title: row.title, slug: row.slug, summary: row.summary, city: row.city, area: row.area,
    spaceType: row.space_type, environment: row.environment, priceAmount: row.price_amount,
    priceCurrency: row.price_currency, priceUnit: row.price_unit, publishedAt: row.published_at,
    photos: mapPhotos(row.photos),
  };
}

export const getPublishedLocations = cache(async (filters: CatalogFilters = parseCatalogFilters({})): Promise<PublicLocationsResult> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_public_locations", {
    p_query: filters.q || null, p_city: filters.city || null,
    p_environment: filters.environment || null, p_limit: PAGE_SIZE + 1,
    p_offset: (filters.page - 1) * PAGE_SIZE,
  });
  if (error) {
    console.error("Error loading public locations:", error);
    return { ok: false, locations: [], kind: catalogErrorKind(error) };
  }
  const rows = (data ?? []) as PublicRow[];
  return { ok: true, locations: rows.slice(0, PAGE_SIZE).map(mapSummary), hasNext: rows.length > PAGE_SIZE };
});

export const getPublishedLocation = cache(async (slug: string): Promise<PublicLocationResult> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_location", { p_slug: slug });
  if (error) {
    console.error("Error loading public location:", error);
    return { kind: "error" };
  }
  if (!data) return { kind: "not-found" };
  const row = data as PublicRow;
  return { kind: "found", location: {
    ...mapSummary(row), description: row.description ?? null, restrictions: row.restrictions ?? null,
    characteristics: normalizeLocationCharacteristics(row.characteristics),
    shootingConditions: normalizeLocationConditions(row.shooting_conditions),
    tourVideoUrl: row.tour_video_url ?? null, operationalNotes: row.operational_notes ?? null,
    contact: row.contact ?? null,
  } };
});
