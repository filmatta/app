import Link from "next/link";
import {
  formatOpportunityCompensation,
  getOpportunityCategoryLabel,
  getOpportunityWorkModeLabel,
} from "@/lib/opportunities/format";
import type { PublicOpportunitySummary } from "@/lib/opportunities/public";
export function OpportunityRow({
  opportunity,
}: {
  opportunity: PublicOpportunitySummary;
}) {
  const place = [
    opportunity.city,
    getOpportunityWorkModeLabel(opportunity.workMode),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/oportunidades/${opportunity.slug}`}
      className="group grid gap-8 py-9 transition hover:bg-white/[0.02] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white md:grid-cols-[minmax(0,1fr)_14rem] md:px-5"
    >
      <div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/65">
          <span>
            {opportunity.opportunityType === "job"
              ? "Job / Encargo pagado"
              : getOpportunityCategoryLabel(opportunity.category)}
          </span>
          {opportunity.discipline && (
            <>
              <span aria-hidden="true">•</span>
              <span>{opportunity.discipline}</span>
            </>
          )}
        </div>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.025em] transition group-hover:text-white/80 sm:text-4xl">
          {opportunity.title}
        </h2>
        <p className="mt-3 text-sm text-white/65">{opportunity.projectTitle}</p>
        {opportunity.summary && (
          <p className="mt-5 max-w-3xl text-base leading-7 text-white/65">
            {opportunity.summary}
          </p>
        )}
      </div>
      <div className="flex flex-col justify-between gap-6 md:text-right">
        <div>
          <p className="text-sm text-white/55">{place}</p>
          <p className="mt-2 text-sm text-white/65">
            {formatOpportunityCompensation(opportunity)}
          </p>
        </div>
        <span className="text-sm font-semibold text-white/65 transition group-hover:text-white">
          {opportunity.opportunityType === "job"
            ? "Ver encargo →"
            : "Ver convocatoria →"}
        </span>
      </div>
    </Link>
  );
}
