import { createClient } from "@/lib/supabase/server";
import {
  catalogErrorKind,
  PAGE_SIZE,
  type CatalogFilters,
} from "@/lib/catalogs/filters";
import type { AvailabilityStatus } from "./types";

export type ProfileSummary = {
  slug: string;
  display_name: string;
  disciplines: string[];
  city: string | null;
  bio: string | null;
  availability: AvailabilityStatus;
  updated_at: string;
};
export async function getProfileCatalog(
  filters: CatalogFilters,
  talent = false,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_public_professional_profiles",
    {
      p_page: filters.page,
      p_discipline: filters.discipline,
      p_city: filters.city,
      p_availability: filters.availability,
      p_talent: talent,
    },
  );
  if (error) {
    console.error("Profile catalog unavailable", error);
    return { ok: false as const, kind: catalogErrorKind(error) };
  }
  const rows = (data ?? []) as ProfileSummary[];
  return {
    ok: true as const,
    profiles: rows.slice(0, PAGE_SIZE),
    hasNext: rows.length > PAGE_SIZE,
  };
}
