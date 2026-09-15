import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type OpportunityCategory =
  | "casting"
  | "crew"
  | "paid_work"
  | "collaboration"
  | "internship";

export type PublicOpportunity = {
  id: string;
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
  | { ok: true; opportunities: PublicOpportunitySummary[] }
  | { ok: false; opportunities: [] };

export type PublicOpportunityResult =
  | { kind: "found"; opportunity: PublicOpportunity }
  | { kind: "not-found" }
  | { kind: "error" };

type OpportunityRow = {
  id: string;
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
  "id, project_id, title, slug, summary, category, discipline, city, work_mode, compensation_type, compensation_min, compensation_max, compensation_currency, published_at";

const OPPORTUNITY_DETAIL_FIELDS =
  "id, project_id, title, slug, summary, description, category, discipline, city, work_mode, compensation_type, compensation_min, compensation_max, compensation_currency, starts_on, ends_on, application_deadline, published_at";

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
  project: ProjectRow
): PublicOpportunitySummary {
  return {
    id: row.id,
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
  project: ProjectRow
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
  async (): Promise<PublicOpportunitiesResult> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("opportunities")
      .select(OPPORTUNITY_SUMMARY_FIELDS)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .order("id", { ascending: true });

    if (error) {
      console.error("Error loading public opportunities:", error);
      return { ok: false, opportunities: [] };
    }

    const rows = (data ?? []) as OpportunitySummaryRow[];
    const projects = await getPublishedProjects(
      [...new Set(rows.map((row) => row.project_id))]
    );

    if (projects.error) {
      return { ok: false, opportunities: [] };
    }

    return {
      ok: true,
      opportunities: rows.flatMap((row) => {
        const project = projects.projectsById.get(row.project_id);
        return project ? [mapOpportunitySummary(row, project)] : [];
      }),
    };
  }
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
  }
);
