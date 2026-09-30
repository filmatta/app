import { notFound, redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { UUID_PATTERN } from "@/lib/opportunities/form";
import { catalogErrorKind } from "@/lib/catalogs/filters";
import { CatalogFailure } from "@/components/catalogs/CatalogControls";
import OpportunityForm, {
  type EditableOpportunity,
} from "../../OpportunityForm";
import Link from "next/link";
import { convertOpportunityToProject } from "@/app/mis-proyectos/actions";
import "@/components/projects/projects.css";
export const metadata = { title: "Editar oportunidad" };
export default async function EditOpportunity({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ conversion_error?: string }>;
}) {
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(id)) notFound();
  const viewer = await getViewer();
  if (!viewer)
    redirect(
      `/login?next=${encodeURIComponent(`/mis-oportunidades/${id}/editar`)}`,
    );
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select(
      "id,project_id,title,summary,description,category,discipline,city,work_mode,compensation_type,compensation_min,compensation_max,compensation_currency,starts_on,ends_on,application_deadline,status,opportunity_type,deliverables",
    )
    .eq("id", id)
    .eq("owner_id", viewer.id)
    .maybeSingle();
  if (!data && !error) notFound();
  const projectsResult = await supabase.from("projects")
    .select("id,title,slug,lifecycle_status")
    .eq("owner_id", viewer.id)
    .order("updated_at", { ascending: false }).limit(50);
  const projects = projectsResult.data ?? [];
  const linkedProject = data?.project_id ? projects.find((project) => project.id === data.project_id) : undefined;
  const convertAction = convertOpportunityToProject.bind(null, id);
  return (
    <div className="editorial-page">
      <SiteHeader
        contextLink={{
          href: "/mis-oportunidades",
          label: "← Mis oportunidades",
        }}
      />
      <main className="editorial-container py-14">
        <p className="eyebrow">Publicar / Oportunidades</p>
        <h1 className="mt-5 text-4xl font-semibold">Editar oportunidad</h1>
        {linkedProject && <p className="project-link-notice">Vinculada a: <Link href={`/mis-proyectos/${linkedProject.id}/editar`}>{linkedProject.title} →</Link></p>}
        {feedback.conversion_error === "1" && <p className="project-feedback project-feedback--error" role="alert">No pudimos convertir esta Opportunity. Revisa tus permisos e inténtalo de nuevo.</p>}
        {error ? (
          <CatalogFailure kind={catalogErrorKind(error)} />
        ) : (
          <OpportunityForm opportunity={data as EditableOpportunity} projects={projects.filter((project) => project.lifecycle_status !== "archived" || project.id === data?.project_id).map(({ id: projectId, title }) => ({ id: projectId, title }))} />
        )}
        {data && !data.project_id && <section className="project-convert"><h2>Convertir en Project</h2><p>Crea un Project en borrador con los datos disponibles y conserva esta Opportunity publicada o en su estado actual. La operación es segura ante doble clic.</p><form action={convertAction}><button className="project-button" type="submit">Convertir en proyecto</button></form></section>}
      </main>
    </div>
  );
}
