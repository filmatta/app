import Link from "next/link";
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
  return (
    <div className="editorial-page profiles-page">
      <SiteHeader />
      <main className="editorial-container profile-editor-shell">
        <header className="profile-editor-header">
          <p className="eyebrow">FILMATTA / Mi perfil</p>
          <h1>Tu perfil profesional.</h1>
          <p>
            Reel, trabajo y experiencia. Una página para presentar lo que haces.
          </p>
        </header>
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
        <div className="profile-editor-name">
          <p>
            Tu identidad pública
            <strong>{profile?.display_name || displayName}</strong>
          </p>
          <Link href="/cuenta#perfil" className="profile-text-link">
            Editar nombre privado
          </Link>
          {profile?.is_public && (
            <Link
              href={`/perfiles/${profile.slug}`}
              className="profile-text-link"
            >
              Ver perfil público ↗
            </Link>
          )}
        </div>
        <ProfileEditor
          key={profile?.updated_at ?? "new"}
          profile={profile}
          displayName={displayName}
        />
      </main>
    </div>
  );
}
