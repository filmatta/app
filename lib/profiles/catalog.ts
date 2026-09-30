import { createClient } from "@/lib/supabase/server";
import {
  catalogErrorKind,
  PAGE_SIZE,
  type CatalogFilters,
} from "@/lib/catalogs/filters";
import type { AvailabilityStatus, PortfolioItem } from "./types";
import {
  EMPTY_PRESENTATION,
  parsePresentation,
  type ProfilePresentation,
} from "./presentation";

export type ProfileSummary = {
  slug: string;
  display_name: string;
  disciplines: string[];
  city: string | null;
  bio: string | null;
  availability: AvailabilityStatus;
  skills: string[];
  updated_at: string;
  portfolio_items: PortfolioItem[];
  presentation: ProfilePresentation;
  visual_media_id: string | null;
  visual_url: string | null;
};

export type ProfileSearchFacets = {
  cities: string[];
  skills: string[];
};

export async function getProfileCatalog(
  filters: CatalogFilters,
  talent = false,
) {
  const supabase = await createClient();
  const { data, error } = talent
    ? await supabase.rpc("list_public_professional_portfolios", {
        p_page: filters.page,
        p_discipline: filters.discipline,
        p_city: filters.city,
        p_availability: filters.availability,
        p_talent: true,
      })
    : await supabase.rpc("search_public_professional_profiles", {
        p_query: filters.q,
        p_page: filters.page,
        p_discipline: filters.discipline,
        p_city: filters.city,
        p_availability: filters.availability,
        p_skill: filters.skill,
      });
  if (error) {
    console.error("Profile catalog unavailable", error);
    return { ok: false as const, kind: catalogErrorKind(error) };
  }
  const rawRows = (data ?? []) as (ProfileSummary & {
    total_count?: number | string | null;
  })[];
  const rows = rawRows.map((row) => ({
    ...row,
    skills: Array.isArray(row.skills) ? row.skills : [],
    visual_media_id:
      typeof row.visual_media_id === "string" ? row.visual_media_id : null,
    visual_url: typeof row.visual_url === "string" ? row.visual_url : null,
    portfolio_items: Array.isArray(row.portfolio_items)
      ? row.portfolio_items
      : [],
    presentation: parsePresentation(row.presentation) ?? EMPTY_PRESENTATION,
  }));
  return {
    ok: true as const,
    profiles: rows.slice(0, PAGE_SIZE),
    hasNext: rows.length > PAGE_SIZE,
    total: Number(rawRows[0]?.total_count ?? rows.length),
  };
}

export async function getProfileSearchFacets(): Promise<ProfileSearchFacets> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_profile_search_facets");

  if (error) {
    console.error("Profile search facets unavailable", error);
    return { cities: [], skills: [] };
  }

  const value = data && typeof data === "object" ? data : {};
  const facets = value as { cities?: unknown; skills?: unknown };
  const strings = (items: unknown) =>
    Array.isArray(items)
      ? items.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
      : [];

  return { cities: strings(facets.cities), skills: strings(facets.skills) };
}
