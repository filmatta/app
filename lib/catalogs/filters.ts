export type SearchParams = Record<string, string | string[] | undefined>;
export const PAGE_SIZE = 24;
export type CatalogFilters = {
  page: number;
  q: string;
  city: string;
  category: string;
  discipline: string;
  availability: string;
  environment: string;
  workMode: string;
  level: string;
};
export function parseCatalogFilters(params: SearchParams): CatalogFilters {
  const text = (key: string, max = 80) =>
    typeof params[key] === "string"
      ? params[key]
          .trim()
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .slice(0, max)
      : "";
  const page = text("page", 10);
  const choice = (key: string, options: string[]) => {
    const value = text(key);
    return options.includes(value) ? value : "";
  };
  return {
    page: /^\d+$/.test(page) ? Math.max(1, Math.min(1000, Number(page))) : 1,
    q: text("q"),
    city: text("city"),
    category: text("category"),
    discipline: text("discipline"),
    availability: choice("availability", [
      "available",
      "limited",
      "unavailable",
      "not_specified",
    ]),
    environment: choice("environment", ["interior", "exterior", "both"]),
    workMode: choice("workMode", ["on_site", "remote", "hybrid"]),
    level: text("level"),
  };
}
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
export function catalogPageHref(
  path: string,
  filters: CatalogFilters,
  page: number,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (key !== "page" && value) query.set(key, String(value));
  if (page > 1) query.set("page", String(page));
  return `${path}${query.size ? `?${query}` : ""}`;
}
export function catalogErrorKind(
  error: { code?: string } | null,
): "unconfigured" | "error" {
  return [
    "42P01",
    "42883",
    "42703",
    "PGRST202",
    "PGRST205",
    "PGRST204",
  ].includes(error?.code ?? "")
    ? "unconfigured"
    : "error";
}
