import Link from "next/link";
import {
  formatOpportunityCompensation,
  formatOpportunityDeadline,
  getOpportunityCategoryLabel,
  getOpportunityWorkModeLabel,
} from "@/lib/opportunities/format";
import type { PublicOpportunitySummary } from "@/lib/opportunities/public";
import "@/app/oportunidades/opportunities.css";

export function OpportunityRow({
  opportunity,
  returnTo,
}: {
  opportunity: PublicOpportunitySummary;
  returnTo?: string;
}) {
  const place = [
    opportunity.city,
    getOpportunityWorkModeLabel(opportunity.workMode),
  ]
    .filter(Boolean)
    .join(" · ");
  const description = opportunity.summary || opportunity.description;
  const href = returnTo
    ? `/oportunidades/${opportunity.slug}?from=${encodeURIComponent(returnTo)}`
    : `/oportunidades/${opportunity.slug}`;

  return (
    <Link href={href} className="opportunity-card">
      <div className="min-w-0">
        <div className="opportunity-card-kicker">
          <span>
            {opportunity.opportunityType === "job"
              ? "Encargo pagado"
              : getOpportunityCategoryLabel(opportunity.category)}
          </span>
          {opportunity.discipline && (
            <>
              <span aria-hidden="true">•</span>
              <span>{opportunity.discipline}</span>
            </>
          )}
        </div>
        <h3>{opportunity.title}</h3>
        {opportunity.projectTitle && (
          <p className="opportunity-card-context">
            Proyecto: {opportunity.projectTitle}
          </p>
        )}
        {description && (
          <p className="opportunity-card-description">{description}</p>
        )}
      </div>
      <div className="opportunity-card-aside">
        <div className="opportunity-card-meta">
          <div>
            <p className="opportunity-card-place">{place}</p>
            {opportunity.applicationDeadline && (
              <p className="opportunity-card-deadline">
                Cierra el {formatOpportunityDeadline(opportunity.applicationDeadline)}
              </p>
            )}
          </div>
          <span className="opportunity-compensation-badge">
            {formatOpportunityCompensation(opportunity)}
          </span>
        </div>
        <span className="opportunity-card-cta">Abrir oportunidad →</span>
      </div>
    </Link>
  );
}
