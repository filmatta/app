"use server";
import { createClient } from "@/lib/supabase/server";
import { getOwnedProfessionalProfile } from "@/lib/profiles/data";
import { validateOnboardingStep } from "@/lib/profiles/activation";
import { analyzeBio, BIO_CONTACT_MESSAGE } from "@/lib/profiles/bio-policy";
import { revalidatePath } from "next/cache";
export async function saveOnboarding(
  step: number,
  patch: Record<string, unknown>,
) {
  const invalid = validateOnboardingStep(step, patch);
  if (invalid) return { error: invalid };
  if (
    step === 5 &&
    typeof patch.bio === "string" &&
    analyzeBio(patch.bio).blocked
  )
    return { error: BIO_CONTACT_MESSAGE };
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return {
      error:
        "Tu sesión terminó. Inicia sesión de nuevo; conservamos los pasos guardados.",
    };
  const result = await db.rpc("save_my_profile_activation_step", {
    p_step: step,
    p_patch: patch,
  });
  if (result.error)
    return {
      error:
        "No pudimos guardar este paso. Revisa los datos e inténtalo de nuevo.",
    };
  const profile = await getOwnedProfessionalProfile(user.id);
  revalidatePath("/");
  revalidatePath("/mi-perfil");
  revalidatePath("/onboarding/perfil");
  if (profile) revalidatePath(`/perfiles/${profile.slug}`);
  return { profile };
}
export async function finishProfileTour() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { error: "Inicia sesión para guardar el recorrido." };
  const { error } = await db.rpc("finish_my_profile_tour");
  if (error)
    return { error: "No pudimos guardar el recorrido. Inténtalo de nuevo." };
  revalidatePath("/mi-perfil");
  return { ok: true };
}
