import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ServiceForm from "@/components/services/ServiceForm";
import { getViewer } from "@/lib/auth/get-viewer";
export const metadata = { title: "Publicar servicio" };
export default async function NewService() {
  if (!(await getViewer())) redirect("/login?next=%2Fmis-servicios%2Fnuevo");
  return (
    <div className="editorial-page">
      <SiteHeader
        contextLink={{ href: "/mis-servicios", label: "← Mis servicios" }}
      />
      <main className="editorial-container py-16">
        <p className="eyebrow">Marketplace / Publicar</p>
        <h1 className="mt-5 text-4xl font-semibold">
          Presenta lo que ofreces.
        </h1>
        <ServiceForm />
      </main>
    </div>
  );
}
