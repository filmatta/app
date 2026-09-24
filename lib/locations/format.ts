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
    "priceAmount" | "priceCurrency" | "priceUnit"
  >
) {
  if (
    location.priceAmount === null ||
    !location.priceCurrency ||
    !location.priceUnit
  ) {
    return "Consultar tarifa";
  }

  const amount = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: location.priceCurrency,
    maximumFractionDigits: 0,
  }).format(location.priceAmount);

  return `${amount} / ${PRICE_UNIT_LABELS[location.priceUnit]}`;
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
