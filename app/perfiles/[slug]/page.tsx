import { professionalName } from "@/lib/profiles/presentation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ProfilePortfolio from "@/components/profiles/ProfilePortfolio";
import PortfolioMedia from "@/components/profiles/PortfolioMedia";
import ProfileFollow from "@/components/profiles/ProfileFollow";
import ProfileSocialProof from "@/components/profiles/ProfileSocialProof";
import { parseProjectPreferences } from "@/lib/profiles/project-preferences";
import type { ContactAccess, ProfileFollower } from "@/lib/profiles/social";
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
  const owned = viewer
    ? await db.from("professional_profiles").select("user_id")
        .eq("user_id", viewer.id).eq("slug", slug).maybeSingle()
    : null;
  const [preferences, followers, following, access] = await Promise.all([
    db.rpc("get_public_project_preferences", { p_slug: slug }),
    db.rpc("get_profile_followers", { p_slug: slug }),
    viewer ? db.rpc("am_i_following_profile", { p_slug: slug }) : null,
    viewer ? db.rpc("get_my_profile_contact_access", { p_slug: slug }) : null,
  ]);
  if (preferences.error || followers.error || following?.error) throw new Error("No pudimos cargar el perfil completo.");
  return (
    <div className="editorial-page profiles-page">
      <SiteHeader />
      <main className="editorial-container">
        <ProfilePortfolio
          profile={profile}
          signedIn={Boolean(viewer)}
          owner={Boolean(owned?.data)}
          follow={!owned?.data && <ProfileFollow key={`${slug}:${Boolean(following?.data)}`} slug={slug} signedIn={Boolean(viewer)} initial={Boolean(following?.data)} />}
          socialProof={<ProfileSocialProof followers={(followers.data ?? []) as ProfileFollower[]} />}
          preferences={parseProjectPreferences(preferences.data)}
          contactAccess={access?.error ? null : (access?.data?.[0] as ContactAccess | undefined)}
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
