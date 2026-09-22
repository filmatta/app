import { PROFILE_DISCIPLINES } from "./constants";
import { professionalName } from "./presentation";
import type { ProfessionalProfile } from "./types";
export type ProfileIntent = "talent" | "crew" | null;
export function profileIntent(value: unknown): ProfileIntent {
  return value === "talent" || value === "crew" ? value : null;
}
export function onboardingPath(intent: ProfileIntent = null) {
  return "/onboarding/perfil" + (intent ? `?intent=${intent}` : "");
}
export function orderedDisciplines(intent: ProfileIntent) {
  return [...PROFILE_DISCIPLINES].sort((a, b) => {
    const talent = (v: string) =>
      ["Actuación", "Modelaje"].includes(v) ? 1 : 0;
    return intent === "talent"
      ? talent(b) - talent(a)
      : intent === "crew"
        ? talent(a) - talent(b)
        : 0;
  });
}
export function minimumProfile(profile: ProfessionalProfile | null) {
  return Boolean(
    profile &&
      professionalName(profile).trim() &&
      profile.disciplines.length &&
      profile.city?.trim() &&
      profile.availability !== "not_specified",
  );
}
export function homeProfileAction(
  signedIn: boolean,
  profile: ProfessionalProfile | null,
  percent: number,
) {
  if (!signedIn)
    return {
      label: "Crear mi perfil",
      href: `/registro?next=${encodeURIComponent(onboardingPath())}`,
    };
  if (!profile) return { label: "Crear mi perfil", href: onboardingPath() };
  if (!minimumProfile(profile) || percent < 75)
    return {
      label: "Completar mi perfil",
      href: minimumProfile(profile) ? "/mi-perfil" : onboardingPath(),
    };
  return {
    label: "Ver mi perfil",
    href: profile.is_public ? `/perfiles/${profile.slug}` : "/mi-perfil",
  };
}
export function resumeStep(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 9
    ? value
    : 1;
}
export function shouldStartTour(completed: string | null, tour: string | null) {
  return Boolean(completed && !tour);
}
export function validateOnboardingStep(
  step: number,
  patch: Record<string, unknown>,
): string | null {
  if (
    step === 1 &&
    (typeof patch.name !== "string" ||
      !patch.name.trim() ||
      patch.name.length > 80)
  )
    return "Escribe el nombre con el que quieres aparecer (hasta 80 caracteres).";
  if (
    step === 2 &&
    (!Array.isArray(patch.disciplines) ||
      patch.disciplines.length < 1 ||
      patch.disciplines.length > 5)
  )
    return "Selecciona entre una y cinco disciplinas.";
  if (
    step === 4 &&
    (typeof patch.city !== "string" ||
      !patch.city.trim() ||
      patch.city.length > 80)
  )
    return "Escribe la ciudad donde trabajas.";
  if (
    step === 5 &&
    patch.bio != null &&
    (typeof patch.bio !== "string" || patch.bio.length > 1200)
  )
    return "Tu bio puede tener hasta 1200 caracteres.";
  if (
    step === 6 &&
    !["available", "limited", "unavailable"].includes(
      String(patch.availability),
    )
  )
    return "Selecciona tu disponibilidad.";
  return null;
}

// Unchecked is unknown, never a rejection. Advanced values are only edited in the full editor.
export function quickPreference(checked: boolean) {
  return checked ? "accept" : "unspecified";
}
