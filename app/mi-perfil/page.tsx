import Link from "next/link";
import { redirect } from "next/navigation";
import ProfileEditor from "@/app/mi-perfil/ProfileEditor";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { getPublicDisplayName } from "@/lib/profiles/display-name";
import { getOwnedProfessionalProfile } from "@/lib/profiles/data";

export const metadata = {
  title: "Editar perfil profesional",
  description: "Crea y publica tu perfil profesional en FILMATTA.",
};

export default async function EditProfessionalProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const viewer = await getViewer();

  if (!viewer) {
    redirect("/login?next=%2Fmi-perfil");
  }

  const [profile, feedback] = await Promise.all([
    getOwnedProfessionalProfile(viewer.id),
    searchParams,
  ]);
  const publicDisplayName = getPublicDisplayName(viewer.fullName);

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/cuenta", label: "Mi cuenta" }} />

      <section className="mx-auto max-w-5xl px-6 py-14 lg:px-8 lg:py-20">
        <div className="flex flex-col justify-between gap-8 border-b border-white/10 pb-10 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
              FILMATTA Profiles
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
              Tu perfil profesional
            </h1>
            <p className="mt-5 max-w-2xl leading-7 text-white/45">
              Una página pública, clara y compartible para presentar tu trabajo
              audiovisual.
            </p>
          </div>

          {profile?.is_public && (
            <Link
              href={`/perfiles/${profile.slug}`}
              className="w-fit shrink-0 rounded-full border border-white/15 px-5 py-3 text-sm font-medium transition hover:bg-white/[0.06]"
            >
              Ver perfil público →
            </Link>
          )}
        </div>

        {feedback.saved && (
          <p
            role="status"
            className="mt-8 rounded-xl border border-green-400/20 bg-green-400/[0.06] px-5 py-4 text-sm text-green-100"
          >
            {feedback.saved === "published"
              ? "Perfil guardado y publicado."
              : "Perfil guardado como borrador."}
          </p>
        )}

        {feedback.error && (
          <p
            role="alert"
            className="mt-8 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-5 py-4 text-sm text-red-200"
          >
            {feedback.error}.
          </p>
        )}

        <aside className="mt-8 grid gap-5 rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-[#8f1736] text-xl font-semibold">
            {Array.from(publicDisplayName)[0]}
          </div>
          <div>
            <p className="text-sm text-white/35">Así se mostrará tu nombre</p>
            <p className="mt-1 text-xl font-semibold">{publicDisplayName}</p>
          </div>
          <Link
            href="/cuenta#perfil"
            className="text-sm text-white/50 transition hover:text-white"
          >
            Editar nombre privado
          </Link>
        </aside>

        <ProfileEditor profile={profile} />
      </section>
    </main>
  );
}
