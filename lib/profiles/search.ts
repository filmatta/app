import type { CatalogFilters } from "@/lib/catalogs/filters";

export const PROFILE_SEARCH_PARAM_KEYS = [
  "q",
  "discipline",
  "city",
  "availability",
  "skill",
] as const;

export type ProfileSearchParam = (typeof PROFILE_SEARCH_PARAM_KEYS)[number];

export function profileSearchHref(
  filters: CatalogFilters,
  changes: Partial<Pick<CatalogFilters, ProfileSearchParam | "page">> = {},
) {
  const next = { ...filters, ...changes };
  const query = new URLSearchParams();

  for (const key of PROFILE_SEARCH_PARAM_KEYS) {
    const value = next[key].trim();
    if (value) query.set(key, value);
  }

  const page = changes.page ?? (Object.keys(changes).length ? 1 : next.page);
  if (page > 1) query.set("page", String(page));

  return `/perfiles${query.size ? `?${query.toString()}` : ""}`;
}

export function safeProfileReturnPath(value: unknown) {
  if (typeof value !== "string" || value.length > 900) return null;

  try {
    const url = new URL(value, "https://filmatta.invalid");
    if (url.origin !== "https://filmatta.invalid" || url.pathname !== "/perfiles")
      return null;

    const query = new URLSearchParams();
    for (const key of PROFILE_SEARCH_PARAM_KEYS) {
      const item = url.searchParams.get(key)?.trim().slice(0, 80);
      if (item) query.set(key, item);
    }
    const page = url.searchParams.get("page");
    if (page && /^\d{1,4}$/.test(page) && Number(page) > 1)
      query.set("page", String(Math.min(1000, Number(page))));

    return `/perfiles${query.size ? `?${query.toString()}` : ""}`;
  } catch {
    return null;
  }
}
