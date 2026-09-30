import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  catalogErrorKind,
  PAGE_SIZE,
  parseCatalogFilters,
  type CatalogFilters,
} from "@/lib/catalogs/filters";

export type OpportunityCategory =
  | "casting"
  | "crew"
  | "paid_work"
  | "collaboration"
  | "internship";

export type PublicOpportunity = {
  id: string;
  opportunityType: "opportunity" | "job";
  deliverables: string | null;
  projectId: string | null;
  projectTitle: string | null;
  projectSlug: string | null;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  category: OpportunityCategory;
  discipline: string | null;
  city: string | null;
  workMode: "on_site" | "remote" | "hybrid";
  compensationType: "paid" | "expenses" | "unpaid" | "unspecified";
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  startsOn: string | null;
  endsOn: string | null;
  applicationDeadline: string | null;
  publishedAt: string;
};

export type PublicOpportunitySummary = Omit<
  PublicOpportunity,
  "deliverables" | "projectId" | "startsOn" | "endsOn"
>;

export type PublicOpportunitiesResult =
  | { ok: true; opportunities: PublicOpportunitySummary[]; hasNext: boolean }
  | { ok: false; opportunities: []; kind: "unconfigured" | "error" };

export type PublicOpportunityResult =
  | { kind: "found"; opportunity: PublicOpportunity }
  | { kind: "not-found" }
  | { kind: "error" };

type OpportunityRow = {
  id: string;
  opportunity_type: "opportunity" | "job";
  deliverables: string | null;
  project_id: string | null;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  category: OpportunityCategory;
  discipline: string | null;
  city: string | null;
  work_mode: PublicOpportunity["workMode"];
  compensation_type: PublicOpportunity["compensationType"];
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_currency: string | null;
  starts_on: string | null;
  ends_on: string | null;
  application_deadline: string | null;
  published_at: string;
};

type OpportunitySearchRow = {
  id: string;
  opportunity_type: "opportunity" | "job";
  project_title: string | null;
  project_slug: string | null;
  title: string;
  slug: string;
  summary: string | null;
  description_excerpt: string | null;
  category: OpportunityCategory;
  discipline: string | null;
  city: string | null;
  work_mode: PublicOpportunity["workMode"];
  compensation_type: PublicOpportunity["compensationType"];
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_currency: string | null;
  application_deadline: string | null;
  published_at: string;
};

type ProjectRow = {
  id: string;
  title: string;
  slug: string;
};

const OPPORTUNITY_DETAIL_FIELDS =
  "opportunity_type, deliverables, id, project_id, title, slug, summary, description, category, discipline, city, work_mode, compensation_type, compensation_min, compensation_max, compensation_currency, starts_on, ends_on, application_deadline, published_at";

const getPublishedProjects = async (projectIds: string[]) => {
  const projectsById = new Map<string, ProjectRow>();

  if (projectIds.length === 0) {
    return { projectsById, error: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, slug")
    .in("id", projectIds)
    .eq("status", "published");

  if (error) {
    console.error("Error loading projects for public opportunities:", error);
    return { projectsById, error: true };
  }

  for (const project of (data ?? []) as ProjectRow[]) {
    projectsById.set(project.id, project);
  }

  return { projectsById, error: false };
};

function mapOpportunitySummary(
  row: OpportunitySearchRow,
): PublicOpportunitySummary {
  return {
    id: row.id,
    opportunityType: row.opportunity_type,
    projectTitle: row.project_title,
    projectSlug: row.project_slug,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    description: row.description_excerpt,
    category: row.category,
    discipline: row.discipline,
    city: row.city,
    workMode: row.work_mode,
    compensationType: row.compensation_type,
    compensationMin: row.compensation_min,
    compensationMax: row.compensation_max,
    compensationCurrency: row.compensation_currency,
    applicationDeadline: row.application_deadline,
    publishedAt: row.published_at,
  };
}

function mapOpportunity(
  row: OpportunityRow,
  project?: ProjectRow,
): PublicOpportunity {
  return {
    id: row.id,
    opportunityType: row.opportunity_type,
    deliverables: row.deliverables,
    projectId: row.project_id,
    projectTitle: project?.title ?? null,
    projectSlug: project?.slug ?? null,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    description: row.description,
    category: row.category,
    discipline: row.discipline,
    city: row.city,
    workMode: row.work_mode,
    compensationType: row.compensation_type,
    compensationMin: row.compensation_min,
    compensationMax: row.compensation_max,
    compensationCurrency: row.compensation_currency,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    applicationDeadline: row.application_deadline,
    publishedAt: row.published_at,
  };
}

export const getPublishedOpportunities = cache(
  async (
    filters: CatalogFilters = parseCatalogFilters({}),
    jobsOnly = false,
  ): Promise<PublicOpportunitiesResult> => {
    const supabase = await createClient();
    const offset = (filters.page - 1) * PAGE_SIZE;
    const { data, error } = await supabase.rpc("list_public_opportunities", {
      p_q: filters.q || null,
      p_category: filters.category || null,
      p_city: filters.city || null,
      p_compensation: jobsOnly ? null : filters.compensation || null,
      p_work_mode: filters.workMode || null,
      p_offset: offset,
      p_limit: PAGE_SIZE + 1,
      p_jobs_only: jobsOnly,
      p_currency: jobsOnly && filters.currency ? filters.currency : null,
      p_budget_min:
        jobsOnly && filters.currency && filters.budgetMin
          ? Number(filters.budgetMin)
          : null,
      p_deadline_from:
        jobsOnly && filters.deadlineFrom ? filters.deadlineFrom : null,
    });

    if (error) {
      console.error("Error loading public opportunities:", error);
      return { ok: false, opportunities: [], kind: catalogErrorKind(error) };
    }

    const rows = (data ?? []) as OpportunitySearchRow[];

    return {
      ok: true,
      hasNext: rows.length > PAGE_SIZE,
      opportunities: rows.slice(0, PAGE_SIZE).map(mapOpportunitySummary),
    };
  },
);

export const getPublishedOpportunity = cache(
  async (slug: string): Promise<PublicOpportunityResult> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("opportunities")
      .select(OPPORTUNITY_DETAIL_FIELDS)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    if (error) {
      console.error("Error loading public opportunity:", error);
      return { kind: "error" };
    }

    if (!data) {
      return { kind: "not-found" };
    }

    const row = data as OpportunityRow;
    if (
      row.application_deadline &&
      new Date(row.application_deadline).getTime() <= Date.now()
    ) {
      return { kind: "not-found" };
    }

    const projects = await getPublishedProjects(row.project_id ? [row.project_id] : []);
    const project = row.project_id ? projects.projectsById.get(row.project_id) : undefined;

    if (projects.error) {
      return { kind: "error" };
    }

    return { kind: "found", opportunity: mapOpportunity(row, project) };
  },
);
