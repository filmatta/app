import { professionalName } from "@/lib/profiles/presentation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ProfilePortfolio from "@/components/profiles/ProfilePortfolio";
import PortfolioMedia from "@/components/profiles/PortfolioMedia";
import { isTalent } from "@/lib/profiles/presentation";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/profiles/media";
import { getViewer } from "@/lib/auth/get-viewer";
import { getPublicProfessionalProfile } from "@/lib/profiles/data";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getPublicProfessionalProfile((await params).slug);
  if (!profile)
    return { title: "Perfil no disponible", robots: { index: false } };
  return {
    title: professionalName(profile),
    description:
      profile.bio?.slice(0, 155) ||
      `${professionalName(profile)} — ${profile.disciplines.join(" · ")} en FILMATTA.`,
  };
}
export default async function PublicProfilePage({ params }: Props) {
  const { slug } = await params;
  const [profile, viewer] = await Promise.all([
    getPublicProfessionalProfile(slug),
    getViewer(),
  ]);
  if (!profile) notFound();
  const db = await createClient();
  const { data: media, error } = await db.rpc("get_profile_media", {
    p_slug: slug,
  });
  if (error) throw new Error("No pudimos cargar el portfolio.");
  return (
    <div className="editorial-page profiles-page">
      <SiteHeader />
      <main className="editorial-container">
        <ProfilePortfolio
          profile={profile}
          signedIn={Boolean(viewer)}
          media={
            media === null ? undefined : (
              <PortfolioMedia
                items={media as MediaItem[]}
                talent={isTalent(profile.disciplines)}
              />
            )
          }
        />
      </main>
    </div>
  );
}
