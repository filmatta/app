import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import OpportunityForm from "../OpportunityForm";
export const metadata = { title: "Nueva oportunidad" };
export default async function NewOpportunity({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const job = (await searchParams).type === "job";
  if (!(await getViewer()))
    redirect(
      `/login?next=${encodeURIComponent(`/mis-oportunidades/nueva${job ? "?type=job" : ""}`)}`,
    );
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
          {job
            ? "Un encargo audiovisual bien definido."
            : "Una convocatoria con contexto."}
        </h1>
        <OpportunityForm job={job} />
      </main>
    </div>
  );
}
