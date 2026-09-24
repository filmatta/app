import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import type {
  LocationEnvironment,
  LocationPriceUnit,
  LocationStatus,
} from "@/lib/locations/form";
import { createClient } from "@/lib/supabase/server";
import { normalizeLocationCharacteristics } from "@/lib/locations/characteristics";
import { normalizeLocationConditions } from "@/lib/locations/conditions";
import { archiveLocation, updateLocation } from "../../actions";
import ArchiveLocationButton from "../../ArchiveLocationButton";
import LocationFeedback from "../../LocationFeedback";
import LocationForm, { type EditableLocation, type EditableLocationContact, type EditableLocationPhoto } from "../../LocationForm";

export const metadata: Metadata = {
  title: "Editar locación",
  robots: { index: false, follow: false },
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LocationRow = EditableLocation & {
  id: string;
  environment: LocationEnvironment;
  price_unit: LocationPriceUnit | null;
  status: LocationStatus;
};

export default async function EditLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ id }, feedback, viewer] = await Promise.all([
    params,
    searchParams,
    getViewer(),
  ]);

  if (!viewer) {
    redirect(
      `/acceso?next=${encodeURIComponent(`/mis-locaciones/${id}/editar`)}`
    );
  }

  if (!UUID_PATTERN.test(id)) {
    notFound();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select(
      "id, title, slug, summary, description, city, area, space_type, environment, price_amount, price_currency, price_unit, restrictions, characteristics, shooting_conditions, tour_video_url, operational_notes, status"
    )
    .eq("id", id)
    .eq("owner_id", viewer.id)
    .maybeSingle();

  if (error) {
    console.error("Error cargando una locación propia:", {
      code: error.code,
      message: error.message,
    });

    return (
      <PrivateLocationLoadError message="No pudimos cargar esta locación. Inténtalo de nuevo." />
    );
  }

  if (!data) {
    notFound();
  }

  const [contactResult, photosResult] = await Promise.all([
    supabase.from("location_public_contacts").select("email, phone, whatsapp, website, is_public").eq("location_id", id).eq("owner_id", viewer.id).maybeSingle(),
    supabase.from("location_photos").select("id, image_url, alt_text").eq("location_id", id).eq("owner_id", viewer.id).neq("status", "archived").order("sort_order", { ascending: true }).order("id", { ascending: true }),
  ]);
  if (contactResult.error || photosResult.error) {
    console.error("Error cargando contenido de una locación propia:", { contact: contactResult.error?.code, photos: photosResult.error?.code });
    return <PrivateLocationLoadError message="No pudimos cargar el contenido de esta locación. Inténtalo de nuevo." />;
  }

  const raw = data as LocationRow & { characteristics: unknown; shooting_conditions: unknown };
  const location = { ...raw, characteristics: normalizeLocationCharacteristics(raw.characteristics), shooting_conditions: normalizeLocationConditions(raw.shooting_conditions) };
  const contact = (contactResult.data as EditableLocationContact | null) ?? null;
  const photos = (photosResult.data ?? []) as EditableLocationPhoto[];
  const updateAction = updateLocation.bind(null, location.id);
  const archiveAction = archiveLocation.bind(null, location.id);

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader
        contextLink={{ href: "/mis-locaciones", label: "← Mis locaciones" }}
      />

      <section className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/mis-locaciones"
            className="inline-flex rounded-full border border-white/10 px-4 py-2 text-sm text-white/50 transition hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
          >
            ← Mis locaciones
          </Link>
          {location.status === "published" && (
            <Link
              href={`/locaciones/${location.slug}`}
              className="rounded-full px-4 py-2 text-sm text-white/50 transition hover:bg-white/[0.04] hover:text-white"
            >
              Ver página pública →
            </Link>
          )}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
            Editar locación
          </p>
          <span className="rounded-full bg-white/[0.07] px-3 py-1 text-xs text-white/50">
            {location.status === "published"
              ? "Publicada"
              : location.status === "archived"
                ? "Archivada"
                : "Borrador"}
          </span>
        </div>
        <h1 className="mt-5 [overflow-wrap:anywhere] text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">
          {location.title}
        </h1>

        <LocationFeedback error={feedback.error} success={feedback.success} />
        <LocationForm action={updateAction} mode="edit" location={location} contact={contact} photos={photos} />

        {location.status !== "archived" && (
          <section className="mt-16 border-t border-white/10 pt-9">
            <h2 className="text-lg font-semibold">Archivar locación</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/40">
              La locación dejará de ser pública, pero conservarás sus datos y
              podrás reactivarla más adelante.
            </p>
            <form action={archiveAction} className="mt-6">
              <ArchiveLocationButton />
            </form>
          </section>
        )}
      </section>
    </main>
  );
}

function PrivateLocationLoadError({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader
        contextLink={{ href: "/mis-locaciones", label: "← Mis locaciones" }}
      />
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div
          role="alert"
          className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-7 text-red-200"
        >
          {message}
        </div>
      </section>
    </main>
  );
}
