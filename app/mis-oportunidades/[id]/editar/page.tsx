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
export const metadata = { title: "Editar oportunidad" };
export default async function EditOpportunity({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
      "id,title,summary,description,category,discipline,city,work_mode,compensation_type,compensation_min,compensation_max,compensation_currency,starts_on,ends_on,application_deadline,status,opportunity_type,deliverables",
    )
    .eq("id", id)
    .eq("owner_id", viewer.id)
    .maybeSingle();
  if (!data && !error) notFound();
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
        {error ? (
          <CatalogFailure kind={catalogErrorKind(error)} />
        ) : (
          <OpportunityForm opportunity={data as EditableOpportunity} />
        )}
      </main>
    </div>
  );
}
