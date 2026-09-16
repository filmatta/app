import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  catalogErrorKind,
  escapeLike,
  PAGE_SIZE,
  parseCatalogFilters,
  type CatalogFilters,
} from "@/lib/catalogs/filters";

export type OpportunityCategory =
  "casting" | "crew" | "paid_work" | "collaboration" | "internship";

export type PublicOpportunity = {
  id: string;
  opportunityType: "opportunity" | "job";
  deliverables: string | null;
  projectId: string;
  projectTitle: string;
  projectSlug: string;
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
  "description" | "startsOn" | "endsOn" | "applicationDeadline"
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
  project_id: string;
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

type OpportunitySummaryRow = Omit<
  OpportunityRow,
  "description" | "starts_on" | "ends_on" | "application_deadline"
>;

type ProjectRow = {
  id: string;
  title: string;
  slug: string;
};

const OPPORTUNITY_SUMMARY_FIELDS =
  "opportunity_type, deliverables, id, project_id, title, slug, summary, category, discipline, city, work_mode, compensation_type, compensation_min, compensation_max, compensation_currency, published_at";

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
  row: OpportunitySummaryRow,
  project: ProjectRow,
): PublicOpportunitySummary {
  return {
    id: row.id,
    opportunityType: row.opportunity_type,
    deliverables: row.deliverables,
    projectId: row.project_id,
    projectTitle: project.title,
    projectSlug: project.slug,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    category: row.category,
    discipline: row.discipline,
    city: row.city,
    workMode: row.work_mode,
    compensationType: row.compensation_type,
    compensationMin: row.compensation_min,
    compensationMax: row.compensation_max,
    compensationCurrency: row.compensation_currency,
    publishedAt: row.published_at,
  };
}

function mapOpportunity(
  row: OpportunityRow,
  project: ProjectRow,
): PublicOpportunity {
  return {
    ...mapOpportunitySummary(row, project),
    description: row.description,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    applicationDeadline: row.application_deadline,
  };
}

export const getPublishedOpportunities = cache(
  async (
    filters: CatalogFilters = parseCatalogFilters({}),
    jobsOnly = false,
  ): Promise<PublicOpportunitiesResult> => {
    const supabase = await createClient();
    let query = supabase
      .from("opportunities")
      .select(`${OPPORTUNITY_SUMMARY_FIELDS}, projects!inner(id,title,slug)`)
      .eq("status", "published")
      .eq("projects.status", "published")
      .order("published_at", { ascending: false })
      .order("id", { ascending: true });
    if (jobsOnly) {
      query = query
        .eq("opportunity_type", "job")
        .eq("compensation_type", "paid");
      if (filters.currency)
        query = query.eq("compensation_currency", filters.currency);
      if (filters.budgetMin && filters.currency)
        query = query.gte("compensation_min", Number(filters.budgetMin));
      if (filters.deadlineFrom)
        query = query.gte(
          "application_deadline",
          filters.deadlineFrom + "T00:00:00Z",
        );
    }
    if (filters.discipline)
      query = query.ilike(
        "discipline",
        "%" + escapeLike(filters.discipline) + "%",
      );
    if (filters.category) query = query.eq("category", filters.category);
    if (filters.city)
      query = query.ilike("city", `%${escapeLike(filters.city)}%`);
    if (filters.q) query = query.ilike("title", `%${escapeLike(filters.q)}%`);
    if (filters.workMode) query = query.eq("work_mode", filters.workMode);
    const offset = (filters.page - 1) * PAGE_SIZE;
    const { data, error } = await query.range(offset, offset + PAGE_SIZE);

    if (error) {
      console.error("Error loading public opportunities:", error);
      return { ok: false, opportunities: [], kind: catalogErrorKind(error) };
    }

    const rows = (data ?? []) as unknown as (OpportunitySummaryRow & {
      projects: ProjectRow;
    })[];

    return {
      ok: true,
      hasNext: rows.length > PAGE_SIZE,
      opportunities: rows
        .slice(0, PAGE_SIZE)
        .map((row) => mapOpportunitySummary(row, row.projects)),
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
    const projects = await getPublishedProjects([row.project_id]);
    const project = projects.projectsById.get(row.project_id);

    if (projects.error) {
      return { kind: "error" };
    }

    if (!project) {
      return { kind: "not-found" };
    }

    return { kind: "found", opportunity: mapOpportunity(row, project) };
  },
);
