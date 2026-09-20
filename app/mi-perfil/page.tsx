import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/profiles/media";
import { redirect } from "next/navigation";
import ProfileEditor from "./ProfileEditor";
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
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=%2Fmi-perfil");
  const [profile, feedback] = await Promise.all([
    getOwnedProfessionalProfile(viewer.id),
    searchParams,
  ]);
  const displayName = getPublicDisplayName(viewer.fullName);
  const db = await createClient();
  const media = profile
    ? await db.rpc("get_profile_media", { p_slug: profile.slug })
    : { data: null, error: null };
  if (media.error) throw new Error("No pudimos cargar tus trabajos.");
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
          profile={profile}
          displayName={displayName}
          initialItems={media.data as MediaItem[] | null}
        />
      </main>
    </div>
  );
}
