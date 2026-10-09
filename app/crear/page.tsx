import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import CrearSessionsHome from "@/components/crear/CrearSessionsHome";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Crear",
  description: "Desarrolla y organiza una idea audiovisual con FILMATTA.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CrearPage() {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) redirect("/login?next=/crear");

  return (
    <div className="crear-index">
      <SiteHeader />
      <CrearSessionsHome />
    </div>
  );
}
