import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { OwnerLocationPhoto } from "@/components/locations/LocationPhotoManager";
import { getViewer } from "@/lib/auth/get-viewer";
import {
  locationActivationCompleted,
  locationActivationInProgress,
  locationActivationStep,
} from "@/lib/locations/activation";
import { normalizeLocationCharacteristics } from "@/lib/locations/characteristics";
import { normalizeLocationConditions } from "@/lib/locations/conditions";
import type { LocationEnvironment } from "@/lib/locations/form";
import { normalizeLocationRateMode, normalizeLocationRateTiers } from "@/lib/locations/pricing";
import { createClient } from "@/lib/supabase/server";
import type { EditableLocationContact } from "../LocationForm";
import NewLocationWizard, { type ActivationWizardLocation } from "./NewLocationWizard";

export const metadata: Metadata = {
  title: "Publicar una locación",
  robots: { index: false, follow: false },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LocationRow = {
  id: string;
  title: string;
  slug: string;
  city: string;
  area: string | null;
  space_type: string;
  environment: LocationEnvironment;
  characteristics: unknown;
  shooting_conditions: unknown;
  rate_mode: unknown;
  rate_tiers: unknown;
  minimum_hours: number | string | null;
  country_code: string | null;
  region_code: string | null;
  municipality_code: string | null;
  locality_code: string | null;
  creation_key: string | null;
  onboarding_step: number | null;
  onboarding_completed_at: string | null;
  status: string;
};

export default async function NewLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; location?: string; step?: string }>;
}) {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  if (!viewer) {
    const next = `/mis-locaciones/nueva${params.location ? `?location=${encodeURIComponent(params.location)}` : ""}`;
    redirect(`/acceso?next=${encodeURIComponent(next)}`);
  }

  if (!params.location) {
    const creationKey = UUID_PATTERN.test(params.key ?? "") ? params.key! : crypto.randomUUID();
    if (params.key !== creationKey) redirect(`/mis-locaciones/nueva?key=${creationKey}&step=1`);
    const requested = locationActivationStep(params.step);
    return <NewLocationWizard creationKey={creationKey} initialStep={requested === 2 ? 2 : 1} />;
  }

  if (!UUID_PATTERN.test(params.location)) notFound();
  const supabase = await createClient();
  const locationResult = await supabase.from("locations")
    .select("id,title,slug,city,area,space_type,environment,characteristics,shooting_conditions,rate_mode,rate_tiers,minimum_hours,country_code,region_code,municipality_code,locality_code,creation_key,onboarding_step,onboarding_completed_at,status")
    .eq("id", params.location)
    .eq("owner_id", viewer.id)
    .maybeSingle();
  if (locationResult.error) {
    console.error("Error cargando Location Activation:", { code: locationResult.error.code, message: locationResult.error.message });
    return <ActivationLoadError />;
  }
  if (!locationResult.data) notFound();
  const row = locationResult.data as LocationRow;
  const inProgress = locationActivationInProgress(row.onboarding_step, row.onboarding_completed_at);
  const completed = locationActivationCompleted(row.onboarding_step, row.onboarding_completed_at);
  if (!inProgress && !completed) redirect(`/mis-locaciones/${row.id}/editar`);

  const persistedStep = locationActivationStep(row.onboarding_step)!;
  const requestedStep = locationActivationStep(params.step);
  if (completed && requestedStep !== 8) redirect(`/mis-locaciones/${row.id}/editar`);
  const displayStep = completed
    ? 8
    : requestedStep && requestedStep <= persistedStep ? requestedStep : persistedStep;

  const [contactResult, photosResult] = await Promise.all([
    supabase.rpc("get_my_location_contact_channels", { p_location_id: row.id }),
    supabase.from("location_photos")
      .select("id,image_url,storage_path,alt_text,is_cover,lifecycle_status")
      .eq("location_id", row.id)
      .eq("owner_id", viewer.id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  if (contactResult.error || photosResult.error) {
    console.error("Error cargando contenido de Location Activation:", {
      contact: contactResult.error?.code,
      photos: photosResult.error?.code,
    });
    return <ActivationLoadError />;
  }

  const location: ActivationWizardLocation = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    city: row.city,
    area: row.area,
    spaceType: row.space_type,
    environment: row.environment,
    characteristics: normalizeLocationCharacteristics(row.characteristics),
    conditions: normalizeLocationConditions(row.shooting_conditions),
    rateMode: normalizeLocationRateMode(row.rate_mode),
    rateTiers: normalizeLocationRateTiers(row.rate_tiers),
    minimumHours: row.minimum_hours === null ? null : Number(row.minimum_hours),
    countryCode: row.country_code,
    regionCode: row.region_code,
    municipalityCode: row.municipality_code,
    localityCode: row.locality_code,
    onboardingCompleted: completed,
    status: row.status,
  };
  const photos = ((photosResult.data ?? []) as {
    id: string;
    image_url: string | null;
    storage_path: string | null;
    alt_text: string | null;
    is_cover: boolean;
    lifecycle_status: OwnerLocationPhoto["lifecycle"];
  }[]).map((photo) => ({
    id: photo.id,
    src: photo.storage_path ? `/api/locations/photos/${photo.id}/image` : photo.image_url,
    altText: photo.alt_text,
    isCover: photo.is_cover,
    lifecycle: photo.lifecycle_status,
  }));

  return <NewLocationWizard
    creationKey={row.creation_key ?? crypto.randomUUID()}
    initialStep={displayStep}
    location={location}
    contact={(contactResult.data as EditableLocationContact | null) ?? null}
    photos={photos}
  />;
}

function ActivationLoadError() {
  return <main className="min-h-screen bg-[#080808] px-6 py-24 text-white">
    <div role="alert" className="mx-auto max-w-xl rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-7 text-red-200">
      No pudimos cargar la configuración de esta locación. Inténtalo de nuevo.
    </div>
  </main>;
}
