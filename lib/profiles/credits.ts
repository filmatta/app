export type ProfileCredit = { title: string; role: string; year: string; company?: string; production_type?: string; start?: string; end?: string; ongoing?: boolean; description?: string; url?: string };
export const PRODUCTION_TYPES = ["", "Cortometraje", "Largometraje", "Serie", "Documental", "Publicidad", "Videoclip", "Fotografía", "Digital", "Otro"];
export function partialDate(value: string) { return /^(|(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2]))?)$/.test(value); }
export function parseCredit(value: unknown): ProfileCredit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || !v.title.trim() || v.title.length > 100 || typeof v.role !== "string" || !v.role.trim() || v.role.length > 80 || typeof v.year !== "string" || !/^(|19\d{2}|20\d{2})$/.test(v.year)) return null;
  const result: ProfileCredit = { title: v.title.trim(), role: v.role.trim(), year: v.year };
  for (const [key, max] of [["company", 100], ["production_type", 40], ["start", 7], ["end", 7], ["description", 400], ["url", 500]] as const) {
    if (v[key] !== undefined) {
      if (typeof v[key] !== "string" || v[key].length > max) return null;
      result[key] = v[key].trim();
    }
  }
  if (v.ongoing !== undefined) { if (typeof v.ongoing !== "boolean") return null; result.ongoing = v.ongoing; }
  if (!partialDate(result.start ?? "") || !partialDate(result.end ?? "") || (result.ongoing && result.end) || (result.start && result.end && result.end < result.start) || !PRODUCTION_TYPES.includes(result.production_type ?? "")) return null;
  if (result.url) { try { const u = new URL(result.url); if (u.protocol !== "https:" || u.username || u.password) return null; } catch { return null; } }
  return result;
}
export function sortedCredits(credits: ProfileCredit[]) {
  return credits.map((credit, index) => ({ credit, index })).sort((a,b) =>
    Number(Boolean(b.credit.ongoing)) - Number(Boolean(a.credit.ongoing)) ||
    (b.credit.end || b.credit.start || b.credit.year).localeCompare(a.credit.end || a.credit.start || a.credit.year) || a.index - b.index).map(v => v.credit);
}
export function creditPeriod(credit: ProfileCredit) {
  const start = credit.start || credit.year;
  return [start, credit.ongoing ? "En curso" : credit.end].filter(Boolean).join(" — ");
}
