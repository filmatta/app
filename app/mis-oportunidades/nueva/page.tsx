import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { PROJECT_UUID_PATTERN } from "@/lib/projects/form";
import { createClient } from "@/lib/supabase/server";
import OpportunityForm from "../OpportunityForm";
export const metadata = { title: "Nueva oportunidad" };
export default async function NewOpportunity({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; project?: string }>;
}) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  const job = params.type === "job";
  if (!viewer) {
    const query = new URLSearchParams();
    if (job) query.set("type", "job");
    if (params.project) query.set("project", params.project);
    const next = `/mis-oportunidades/nueva${query.size ? `?${query}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const supabase = await createClient();
  const projectsResult = await supabase.from("projects")
    .select("id,title,city,starts_on,ends_on")
    .eq("owner_id", viewer.id).neq("lifecycle_status", "archived")
    .order("updated_at", { ascending: false }).limit(50);
  const projects = projectsResult.data ?? [];
  const selected = PROJECT_UUID_PATTERN.test(params.project ?? "")
    ? projects.find((project) => project.id === params.project)
    : undefined;
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
        <h1 className="mt-5 text-4xl font-semibold">
          {selected
            ? `Nueva Opportunity para ${selected.title}.`
            : job
            ? "Un encargo audiovisual bien definido."
            : "Una convocatoria con contexto."}
        </h1>
        <OpportunityForm
          job={job}
          projects={projects.map(({ id, title }) => ({ id, title }))}
          initialProjectId={selected?.id}
          prefill={{ city: selected?.city ?? "", starts_on: selected?.starts_on ?? "", ends_on: selected?.ends_on ?? "" }}
        />
      </main>
    </div>
  );
}
