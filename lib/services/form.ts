import { UUID_PATTERN } from "@/lib/opportunities/form";
export const SERVICE_CATEGORIES = [
  { value: "equipment", label: "Equipo" },
  { value: "postproduction", label: "Postproducción" },
  { value: "sound", label: "Sonido" },
  { value: "art", label: "Arte" },
  { value: "production", label: "Producción" },
  { value: "transport", label: "Transporte" },
  { value: "catering", label: "Catering" },
  { value: "other", label: "Otros servicios" },
] as const;
export const WORK_MODES = [
  { value: "on_site", label: "Presencial" },
  { value: "remote", label: "Remoto" },
  { value: "hybrid", label: "Híbrido" },
] as const;
export type PortfolioLink = { label: string; url: string };
export type ServiceValues = {
  title: string;
  category: string;
  description: string;
  city: string | null;
  work_mode: string;
  indicative_price: number | null;
  currency: string | null;
  portfolio_links: PortfolioLink[];
};
export type EditableService = ServiceValues & { id: string; status: string };
export function parseServiceForm(form: FormData) {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const id = text("id") || null,
    status = text("status") || "draft";
  const fail = (error: string) => ({ ok: false as const, error });
  if (id && !UUID_PATTERN.test(id))
    return fail("No encontramos este servicio.");
  if (
    !["draft", "published", "archived"].includes(status) ||
    (!id && status === "archived")
  )
    return fail("Elige un estado válido.");
  const values: ServiceValues = {
    title: text("title"),
    category: text("category"),
    description: text("description"),
    city: text("city") || null,
    work_mode: text("work_mode"),
    indicative_price: text("indicative_price")
      ? Number(text("indicative_price"))
      : null,
    currency: text("currency") || null,
    portfolio_links: [],
  };
  if (
    values.title.length < 3 ||
    values.title.length > 160 ||
    values.description.length > 12000 ||
    (values.city !== null &&
      (values.city.length < 2 || values.city.length > 120))
  )
    return fail(
      "Revisa título (3–160), ciudad (2–120) y descripción (hasta 12 000 caracteres).",
    );
  if (
    !SERVICE_CATEGORIES.some((c) => c.value === values.category) ||
    !WORK_MODES.some((c) => c.value === values.work_mode)
  )
    return fail("Elige categoría y modalidad válidas.");
  if (
    status === "published" &&
    (values.description.length < 40 ||
      (values.work_mode !== "remote" && !values.city))
  )
    return fail(
      "Para publicar, describe el servicio con al menos 40 caracteres e indica ciudad si no es remoto.",
    );
  if (
    values.indicative_price === null
      ? values.currency !== null
      : !/^\d+(\.\d{1,2})?$/.test(text("indicative_price")) ||
        !Number.isFinite(values.indicative_price) ||
        values.indicative_price > 9999999999.99 ||
        !["MXN", "USD", "EUR"].includes(values.currency ?? "")
  )
    return fail(
      "Indica un precio decimal válido y su moneda, o deja ambos vacíos.",
    );
  for (let i = 0; i < 6; i++) {
    const label = text(`link_label_${i}`),
      raw = text(`link_url_${i}`);
    if (!label && !raw) continue;
    if (label.length < 2 || label.length > 80 || raw.length > 2000)
      return fail(
        "Cada enlace necesita un nombre de 2 a 80 caracteres y una URL HTTPS.",
      );
    try {
      const url = new URL(raw);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !url.hostname.includes(".")
      )
        return fail("Usa enlaces HTTPS públicos sin credenciales.");
      values.portfolio_links.push({ label, url: url.href });
    } catch {
      return fail("Revisa la dirección de tus enlaces.");
    }
  }
  return { ok: true as const, id, status, values };
}
export function servicePrice(
  service: Pick<ServiceValues, "indicative_price" | "currency">,
) {
  return service.indicative_price !== null && service.currency
    ? `${new Intl.NumberFormat("es-MX", { style: "currency", currency: service.currency, currencyDisplay: "code", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(service.indicative_price)} · orientativo`
    : "Precio por consultar";
}
