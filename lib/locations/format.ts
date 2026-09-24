import type { PublicLocation } from "@/lib/locations/public";

const ENVIRONMENT_LABELS: Record<PublicLocation["environment"], string> = {
  interior: "Interior",
  exterior: "Exterior",
  both: "Interior y exterior",
};

const PRICE_UNIT_LABELS: Record<
  NonNullable<PublicLocation["priceUnit"]>,
  string
> = {
  hour: "hora",
  half_day: "media jornada",
  day: "jornada",
  project: "proyecto",
};

export function getLocationEnvironmentLabel(
  environment: PublicLocation["environment"]
) {
  return ENVIRONMENT_LABELS[environment];
}

export function formatLocationPrice(
  location: Pick<
    PublicLocation,
    "priceAmount" | "priceCurrency" | "priceUnit" | "rateMode" | "rateTiers"
  >
) {
  if (location.rateMode === "tiers") {
    const first = location.rateTiers[0];
    if (!first || location.rateTiers.length > 3) return "Consultar tarifa";
    const amount = formatMoney(first.price, first.currency);
    return location.rateTiers.length === 1 ? `${amount} / hora` : `Desde ${amount} / hora`;
  }

  if (location.rateMode === "inquire") return "Consultar tarifa";

  return formatLegacyLocationPrice(location);
}

export function formatLegacyLocationPrice(
  location: Pick<PublicLocation, "priceAmount" | "priceCurrency" | "priceUnit">
) {
  if (
    location.priceAmount === null ||
    !location.priceCurrency ||
    !location.priceUnit
  ) {
    return "Consultar tarifa";
  }

  const amount = formatMoney(location.priceAmount, location.priceCurrency);

  return `${amount} / ${PRICE_UNIT_LABELS[location.priceUnit]}`;
}

export function formatLocationRateAmount(amount: number, currency: string) {
  return `${formatMoney(amount, currency)} por hora`;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatLocationMetadataDescription(location: PublicLocation) {
  return truncateMetadataDescription(
    location.summary ||
      location.description ||
      `Descubre ${location.title} en FILMATTA.`
  );
}

export function formatLocationUpdatedAt(dateTime: string) {
  const parsedDate = new Date(dateTime);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsedDate);
}

function truncateMetadataDescription(description: string) {
  if (description.length <= 160) {
    return description;
  }

  return `${description.slice(0, 159).trimEnd()}…`;
}
