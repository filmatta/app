export const RATE_CURRENCIES = ["MXN", "USD", "EUR", "CAD", "GBP", "COP", "ARS", "CLP", "PEN", "BRL"] as const;
export type ProfileRate = { amount: string; currency: typeof RATE_CURRENCIES[number]; unit: "hour" | "day" };
export function parseRate(value: unknown): ProfileRate | null | false {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as ProfileRate;
  if (typeof r.amount !== "string" || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(r.amount) ||
    Number(r.amount) <= 0 || Number(r.amount) > 10000000 || !RATE_CURRENCIES.includes(r.currency) ||
    !["hour", "day"].includes(r.unit) || (r.currency === "CLP" && !Number.isInteger(Number(r.amount)))) return false;
  return { amount: r.amount, currency: r.currency, unit: r.unit };
}
export function formatRate(rate: ProfileRate) {
  return `${new Intl.NumberFormat("es-MX", { style: "currency", currency: rate.currency, currencyDisplay: "code", maximumFractionDigits: rate.currency === "CLP" ? 0 : 2 }).format(Number(rate.amount))} / ${rate.unit === "day" ? "día" : "hora"}`;
}
