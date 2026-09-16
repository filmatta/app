import type {
  OpportunityCategory,
  PublicOpportunity,
} from "@/lib/opportunities/public";

const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  casting: "Casting / Talento",
  crew: "Crew",
  paid_work: "Trabajo pagado / Freelance",
  collaboration: "Colaboración",
  internship: "Prácticas / Asistencia",
};

const WORK_MODE_LABELS: Record<PublicOpportunity["workMode"], string> = {
  on_site: "Presencial",
  remote: "Remoto",
  hybrid: "Híbrido",
};

export function getOpportunityCategoryLabel(category: OpportunityCategory) {
  return CATEGORY_LABELS[category];
}

export function getOpportunityWorkModeLabel(
  workMode: PublicOpportunity["workMode"],
) {
  return WORK_MODE_LABELS[workMode];
}

export function formatOpportunityCompensation(
  opportunity: Pick<
    PublicOpportunity,
    | "compensationType"
    | "compensationMin"
    | "compensationMax"
    | "compensationCurrency"
  >,
) {
  if (
    opportunity.compensationType === "paid" &&
    opportunity.compensationMin !== null &&
    opportunity.compensationCurrency
  ) {
    const formatter = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: opportunity.compensationCurrency,
      currencyDisplay: "code",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    const minimum = formatter.format(opportunity.compensationMin);

    if (opportunity.compensationMax !== null) {
      return `${minimum}–${formatter.format(opportunity.compensationMax)}`;
    }

    return `Desde ${minimum}`;
  }

  return {
    paid: "Trabajo remunerado",
    expenses: "Gastos cubiertos",
    unpaid: "No remunerado",
    unspecified: "Compensación por definir",
  }[opportunity.compensationType];
}

export function formatOpportunityDate(date: string) {
  const parsedDate = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Fecha por confirmar";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsedDate);
}

export function formatOpportunityDeadline(dateTime: string) {
  const parsedDate = new Date(dateTime);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Fecha por confirmar";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsedDate);
}

export function formatOpportunityMetadataDescription(
  opportunity: PublicOpportunity,
) {
  return truncateMetadataDescription(
    opportunity.summary ||
      opportunity.description ||
      `Descubre ${opportunity.title} en FILMATTA.`,
  );
}

function truncateMetadataDescription(description: string) {
  if (description.length <= 160) {
    return description;
  }

  return `${description.slice(0, 159).trimEnd()}…`;
}
