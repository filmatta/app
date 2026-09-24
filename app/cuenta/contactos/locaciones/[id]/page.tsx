import { notFound, redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import LocationRequestCard from "@/components/locations/LocationRequestCard";
import { getViewer } from "@/lib/auth/get-viewer";
import { validUuid } from "@/lib/contacts/validation";
import { createClient } from "@/lib/supabase/server";
import type { LocationContactRequest } from "@/lib/locations/requests";
import "@/components/networking/networking.css";

export const metadata = { title: "Solicitud de Locación", robots: { index: false, follow: false } };

export default async function LocationRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getViewer())) redirect("/login?next=%2Fcuenta%2Fcontactos%2Flocaciones");
  const { id } = await params;
  if (!validUuid(id)) notFound();
  const db = await createClient();
  const result = await db.rpc("get_my_location_contact_request", { p_id: id });
  if (result.error || !result.data) notFound();
  return <div className="editorial-page"><SiteHeader contextLink={{ href: "/cuenta/contactos/locaciones", label: "← Solicitudes de Locaciones" }} /><main className="network-shell"><header className="network-heading"><p className="eyebrow">LOCACIONES</p><h1>Solicitud de contacto</h1></header><LocationRequestCard item={result.data as LocationContactRequest} detail /></main></div>;
}
