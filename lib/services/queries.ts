import { createClient } from "@/lib/supabase/server";
import {
  catalogErrorKind,
  escapeLike,
  PAGE_SIZE,
  type CatalogFilters,
} from "@/lib/catalogs/filters";
import type { ServiceValues } from "./form";
export type PublicService = ServiceValues & {
  id: string;
  slug: string;
  published_at: string;
};
export const SERVICE_PUBLIC_FIELDS =
  "id,slug,title,category,description,city,work_mode,indicative_price,currency,portfolio_links,published_at";
export async function getServices(filters: CatalogFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("service_listings")
    .select(SERVICE_PUBLIC_FIELDS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("id", { ascending: true });
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.city)
    query = query.ilike("city", `%${escapeLike(filters.city)}%`);
  if (filters.q) query = query.ilike("title", `%${escapeLike(filters.q)}%`);
  if (filters.workMode) query = query.eq("work_mode", filters.workMode);
  const offset = (filters.page - 1) * PAGE_SIZE;
  const { data, error } = await query.range(offset, offset + PAGE_SIZE);
  if (error) return { ok: false as const, kind: catalogErrorKind(error) };
  return {
    ok: true as const,
    services: (data ?? []).slice(0, PAGE_SIZE) as PublicService[],
    hasNext: (data?.length ?? 0) > PAGE_SIZE,
  };
}
export async function getPublicService(slug: string) {
  const supabase = await createClient();
  const result = await supabase
    .from("service_listings")
    .select(SERVICE_PUBLIC_FIELDS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (result.error)
    return { ok: false as const, kind: catalogErrorKind(result.error) };
  return { ok: true as const, service: result.data as PublicService | null };
}
