import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { createLocation } from "../actions";
import LocationFeedback from "../LocationFeedback";
import LocationForm from "../LocationForm";
import { locationCameraRecordingEnabled } from "@/lib/locations/camera-pilot";

export const metadata: Metadata = {
  title: "Nueva locación",
  robots: { index: false, follow: false },
};

export default async function NewLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  if (!viewer) {
    redirect("/acceso?next=%2Fmis-locaciones%2Fnueva");
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader
        contextLink={{ href: "/mis-locaciones", label: "← Mis locaciones" }}
      />

      <section className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
        <Link
          href="/mis-locaciones"
          className="inline-flex rounded-full border border-white/10 px-4 py-2 text-sm text-white/50 transition hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
        >
          ← Mis locaciones
        </Link>
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          Nuevo espacio
        </p>
        <h1 className="mt-5 text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">
          Nueva locación
        </h1>
        <p className="mt-5 max-w-2xl leading-7 text-white/45">
          Guarda un borrador o publica directamente. Podrás cambiar el estado
          después.
        </p>

        <LocationFeedback error={params.error} />
        <LocationForm
          action={createLocation}
          mode="create"
          cameraRecordingEnabled={locationCameraRecordingEnabled()}
        />
      </section>
    </main>
  );
}
