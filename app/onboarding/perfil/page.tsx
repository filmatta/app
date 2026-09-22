import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { getOwnedProfessionalProfile } from "@/lib/profiles/data";
import {
  onboardingPath,
  profileIntent,
  resumeStep,
} from "@/lib/profiles/activation";
import Onboarding from "./Onboarding";
export const metadata = {
  title: "Crea tu perfil",
  robots: { index: false, follow: false },
};
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const intent = profileIntent((await searchParams).intent);
  const viewer = await getViewer();
  if (!viewer)
    redirect(`/registro?next=${encodeURIComponent(onboardingPath(intent))}`);
  const db = await createClient();
  const [profile, settings] = await Promise.all([
    getOwnedProfessionalProfile(viewer.id),
    db
      .from("profile_private_settings")
      .select(
        "onboarding_step,onboarding_identity,onboarding_completed_at,project_preferences",
      )
      .eq("owner_id", viewer.id)
      .maybeSingle(),
  ]);
  if (settings.error)
    throw Error("No pudimos cargar el progreso. Inténtalo de nuevo.");
  return (
    <Onboarding
      profile={profile}
      intent={intent}
      initialStep={resumeStep(settings.data?.onboarding_step)}
      identity={settings.data?.onboarding_identity ?? {}}
      preferences={settings.data?.project_preferences ?? null}
    />
  );
}
