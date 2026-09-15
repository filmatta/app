import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { PublicDataError } from "@/components/verticals/PublicDataState";
import {
  formatOpportunityCompensation,
  formatOpportunityDate,
  formatOpportunityDeadline,
  formatOpportunityMetadataDescription,
  getOpportunityCategoryLabel,
  getOpportunityWorkModeLabel,
} from "@/lib/opportunities/format";
import { getPublishedOpportunity } from "@/lib/opportunities/public";

type OpportunityPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: OpportunityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublishedOpportunity(slug);

  if (result.kind !== "found") {
    return {
      title:
        result.kind === "error"
          ? "Oportunidad no disponible"
          : "Oportunidad no encontrada",
      robots: { index: false, follow: false },
    };
  }

  const { opportunity } = result;
  const description = formatOpportunityMetadataDescription(opportunity);

  return {
    title: opportunity.title,
    description,
    openGraph: {
      title: opportunity.title,
      description,
      type: "article",
    },
  };
}

export default async function OpportunityPage({ params }: OpportunityPageProps) {
  const { slug } = await params;
  const result = await getPublishedOpportunity(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  if (result.kind === "error") {
    return (
      <PublicDataError
        backHref="/oportunidades"
        backLabel="← Todas las oportunidades"
        title="No pudimos cargar esta oportunidad."
      />
    );
  }

  const { opportunity } = result;
  const dateRange = formatDateRange(opportunity.startsOn, opportunity.endsOn);
  const details = [
    { label: "Proyecto", value: opportunity.projectTitle },
    {
      label: "Modalidad",
      value: getOpportunityWorkModeLabel(opportunity.workMode),
    },
    opportunity.city && { label: "Ciudad", value: opportunity.city },
    opportunity.discipline && {
      label: "Disciplina",
      value: opportunity.discipline,
    },
    { label: "Compensación", value: formatOpportunityCompensation(opportunity) },
    dateRange && { label: "Fechas", value: dateRange },
    opportunity.applicationDeadline && {
      label: "Cierre de convocatoria",
      value: formatOpportunityDeadline(opportunity.applicationDeadline),
    },
  ].filter((detail): detail is { label: string; value: string } =>
    Boolean(detail)
  );

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader
        contextLink={{
          href: "/oportunidades",
          label: "← Todas las oportunidades",
        }}
      />

      <article className="mx-auto max-w-7xl px-6 pb-24 pt-20 lg:px-8 lg:pb-32 lg:pt-24">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
              {getOpportunityCategoryLabel(opportunity.category)}
            </p>
            <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
              {opportunity.title}
            </h1>
            <p className="mt-6 text-sm font-medium text-white/40">
              Proyecto · {opportunity.projectTitle}
            </p>
            {opportunity.summary && (
              <p className="mt-8 max-w-3xl text-xl leading-8 text-white/60 sm:text-2xl sm:leading-9">
                {opportunity.summary}
              </p>
            )}
            {opportunity.description && (
              <section className="mt-14 border-t border-white/10 pt-10">
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/35">
                  Sobre la oportunidad
                </h2>
                <p className="mt-6 max-w-3xl whitespace-pre-line text-lg leading-8 text-white/60">
                  {opportunity.description}
                </p>
              </section>
            )}
          </div>

          <aside className="h-fit rounded-2xl border border-white/10 bg-white/[0.025] p-7 lg:sticky lg:top-8">
            <dl className="space-y-7">
              {details.map((detail) => (
                <div key={detail.label}>
                  <dt className="text-xs uppercase tracking-[0.2em] text-white/30">
                    {detail.label}
                  </dt>
                  <dd className="mt-2 text-base leading-6 text-white/75">
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 border-t border-white/10 pt-6 text-xs leading-5 text-white/30">
              Esta es una ficha informativa. Las postulaciones todavía no se
              gestionan dentro de FILMATTA.
            </p>
          </aside>
        </div>
      </article>
    </main>
  );
}

function formatDateRange(startsOn: string | null, endsOn: string | null) {
  if (startsOn && endsOn) {
    return `${formatOpportunityDate(startsOn)} – ${formatOpportunityDate(endsOn)}`;
  }

  if (startsOn) {
    return `Desde ${formatOpportunityDate(startsOn)}`;
  }

  if (endsOn) {
    return `Hasta ${formatOpportunityDate(endsOn)}`;
  }

  return null;
}
