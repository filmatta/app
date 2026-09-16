import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  catalogErrorKind,
  escapeLike,
  PAGE_SIZE,
  parseCatalogFilters,
  type CatalogFilters,
} from "@/lib/catalogs/filters";

export type PublicLocationPhoto = {
  id: string;
  imageUrl: string;
  altText: string | null;
};

export type PublicLocation = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  city: string;
  area: string | null;
  spaceType: string;
  environment: "interior" | "exterior" | "both";
  priceAmount: number | null;
  priceCurrency: string | null;
  priceUnit: "hour" | "day" | "project" | null;
  restrictions: string | null;
  publishedAt: string;
  photos: PublicLocationPhoto[];
};

export type PublicLocationSummary = Omit<
  PublicLocation,
  "description" | "restrictions"
>;

export type PublicLocationsResult =
  | { ok: true; locations: PublicLocationSummary[]; hasNext: boolean }
  | { ok: false; locations: []; kind: "unconfigured" | "error" };

export type PublicLocationResult =
  | { kind: "found"; location: PublicLocation }
  | { kind: "not-found" }
  | { kind: "error" };

type LocationRow = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  city: string;
  area: string | null;
  space_type: string;
  environment: PublicLocation["environment"];
  price_amount: number | null;
  price_currency: string | null;
  price_unit: PublicLocation["priceUnit"];
  restrictions: string | null;
  published_at: string;
};

type LocationSummaryRow = Omit<LocationRow, "description" | "restrictions">;

type PhotoRow = {
  id: string;
  location_id: string;
  image_url: string;
  alt_text: string | null;
};

const LOCATION_SUMMARY_FIELDS =
  "id, title, slug, summary, city, area, space_type, environment, price_amount, price_currency, price_unit, published_at";

const LOCATION_DETAIL_FIELDS =
  "id, title, slug, summary, description, city, area, space_type, environment, price_amount, price_currency, price_unit, restrictions, published_at";

const getPublishedPhotos = async (locationIds: string[]) => {
  if (locationIds.length === 0) {
    return {
      photosByLocation: new Map<string, PublicLocationPhoto[]>(),
      error: false,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("location_photos")
    .select("id, location_id, image_url, alt_text")
    .in("location_id", locationIds)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("Error loading public location photos:", error);
    return {
      photosByLocation: new Map<string, PublicLocationPhoto[]>(),
      error: true,
    };
  }

  const photosByLocation = new Map<string, PublicLocationPhoto[]>();

  for (const photo of (data ?? []) as PhotoRow[]) {
    const photos = photosByLocation.get(photo.location_id) ?? [];
    photos.push({
      id: photo.id,
      imageUrl: photo.image_url,
      altText: photo.alt_text,
    });
    photosByLocation.set(photo.location_id, photos);
  }

  return { photosByLocation, error: false };
};

function mapLocationSummary(
  row: LocationSummaryRow,
  photosByLocation: Map<string, PublicLocationPhoto[]>,
): PublicLocationSummary {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    city: row.city,
    area: row.area,
    spaceType: row.space_type,
    environment: row.environment,
    priceAmount: row.price_amount,
    priceCurrency: row.price_currency,
    priceUnit: row.price_unit,
    publishedAt: row.published_at,
    photos: photosByLocation.get(row.id) ?? [],
  };
}

function mapLocation(
  row: LocationRow,
  photosByLocation: Map<string, PublicLocationPhoto[]>,
): PublicLocation {
  return {
    ...mapLocationSummary(row, photosByLocation),
    description: row.description,
    restrictions: row.restrictions,
  };
}

export const getPublishedLocations = cache(
  async (
    filters: CatalogFilters = parseCatalogFilters({}),
  ): Promise<PublicLocationsResult> => {
    const supabase = await createClient();
    let query = supabase
      .from("locations")
      .select(LOCATION_SUMMARY_FIELDS)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .order("id", { ascending: true });
    if (filters.city)
      query = query.ilike("city", `%${escapeLike(filters.city)}%`);
    if (filters.q) query = query.ilike("title", `%${escapeLike(filters.q)}%`);
    if (filters.environment)
      query = query.eq("environment", filters.environment);
    const offset = (filters.page - 1) * PAGE_SIZE;
    const { data, error } = await query.range(offset, offset + PAGE_SIZE);

    if (error) {
      console.error("Error loading public locations:", error);
      return { ok: false, locations: [], kind: catalogErrorKind(error) };
    }

    const allRows = (data ?? []) as LocationSummaryRow[];
    const rows = allRows.slice(0, PAGE_SIZE);
    const photos = await getPublishedPhotos(rows.map((row) => row.id));

    if (photos.error) {
      return { ok: false, locations: [], kind: "error" };
    }

    return {
      ok: true,
      hasNext: allRows.length > PAGE_SIZE,
      locations: rows.map((row) =>
        mapLocationSummary(row, photos.photosByLocation),
      ),
    };
  },
);

export const getPublishedLocation = cache(
  async (slug: string): Promise<PublicLocationResult> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("locations")
      .select(LOCATION_DETAIL_FIELDS)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    if (error) {
      console.error("Error loading public location:", error);
      return { kind: "error" };
    }

    if (!data) {
      return { kind: "not-found" };
    }

    const row = data as LocationRow;
    const photos = await getPublishedPhotos([row.id]);

    if (photos.error) {
      return { kind: "error" };
    }

    return {
      kind: "found",
      location: mapLocation(row, photos.photosByLocation),
    };
  },
);
