import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/profiles/media";
import { redirect } from "next/navigation";
import { minimumProfile, shouldStartTour } from "@/lib/profiles/activation";
import ProfileEditor from "./ProfileEditor";
import PrivateTools from "@/components/networking/PrivateTools";
import { parseProjectPreferences } from "@/lib/profiles/project-preferences";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { getPublicDisplayName } from "@/lib/profiles/display-name";
import { getOwnedProfessionalProfile } from "@/lib/profiles/data";
export const metadata = {
  title: "Editar perfil profesional",
  description: "Crea y publica tu perfil profesional en FILMATTA.",
  robots: { index: false, follow: false },
};
export default async function EditProfessionalProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=%2Fmi-perfil");
  const [profile, feedback] = await Promise.all([
    getOwnedProfessionalProfile(viewer.id),
    searchParams,
  ]);
  if (!minimumProfile(profile)) redirect("/onboarding/perfil");
  const displayName = getPublicDisplayName(viewer.fullName);
  const db = await createClient();
  const media = profile
    ? await db.rpc("get_profile_media", { p_slug: profile.slug })
    : { data: null, error: null };
  if (media.error) throw new Error("No pudimos cargar tus trabajos.");
  const preferences = await db
    .from("profile_private_settings")
    .select(
      "project_preferences,onboarding_completed_at,profile_tour_completed_at",
    )
    .eq("owner_id", viewer.id)
    .maybeSingle();
  if (preferences.error) throw new Error("No pudimos cargar tus preferencias.");
  return (
    <div className="editorial-page profiles-page">
      <SiteHeader />
      <main className="editorial-container portfolio-editor-shell">
        {feedback.saved && (
          <p
            role="status"
            className="mt-6 border border-[#B9DCEB]/30 bg-[#B9DCEB]/5 p-4 text-sm text-[#B9DCEB]"
          >
            {feedback.saved === "published"
              ? "Perfil guardado y publicado."
              : "Perfil guardado como borrador."}
          </p>
        )}
        {feedback.error && (
          <p
            role="alert"
            className="mt-6 border border-red-300/30 p-4 text-sm text-red-200"
          >
            {feedback.error}.
          </p>
        )}
        <ProfileEditor
          initialEdit={feedback.edit === "1"}
          profile={profile}
          displayName={displayName}
          initialItems={media.data as MediaItem[] | null}
          completionPreferences={parseProjectPreferences(
            preferences.data?.project_preferences,
          )}
          startTour={shouldStartTour(
            preferences.data?.onboarding_completed_at,
            preferences.data?.profile_tour_completed_at,
          )}
          initialPreferences={parseProjectPreferences(
            preferences.data?.project_preferences,
          )}
        />
        <PrivateTools />
      </main>
    </div>
  );
}
