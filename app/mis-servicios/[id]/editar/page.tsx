import { notFound, redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ServiceForm from "@/components/services/ServiceForm";
import { CatalogFailure } from "@/components/catalogs/CatalogControls";
import { catalogErrorKind } from "@/lib/catalogs/filters";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { UUID_PATTERN } from "@/lib/opportunities/form";
import type { EditableService } from "@/lib/services/form";
export const metadata = { title: "Editar servicio" };
export default async function EditService({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  const viewer = await getViewer();
  if (!viewer)
    redirect(
      `/login?next=${encodeURIComponent(`/mis-servicios/${id}/editar`)}`,
    );
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_listings")
    .select(
      "id,title,category,description,city,work_mode,indicative_price,currency,portfolio_links,status",
    )
    .eq("id", id)
    .eq("owner_user_id", viewer.id)
    .maybeSingle();
  if (!error && !data) notFound();
  return (
    <div className="editorial-page">
      <SiteHeader
        contextLink={{ href: "/mis-servicios", label: "← Mis servicios" }}
      />
      <main className="editorial-container py-16">
        <h1 className="text-4xl font-semibold">Editar servicio</h1>
        {error ? (
          <CatalogFailure kind={catalogErrorKind(error)} />
        ) : (
          <ServiceForm service={data as EditableService} />
        )}
      </main>
    </div>
  );
}
