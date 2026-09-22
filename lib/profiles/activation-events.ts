// Local integration hook only. No provider, transport, identifiers or sensitive payloads.
export type ActivationEvent =
  | "home_intent_clicked"
  | "profile_onboarding_started"
  | "profile_onboarding_step_completed"
  | "profile_onboarding_skipped"
  | "profile_onboarding_completed"
  | "profile_published_from_onboarding"
  | "profile_tour_started"
  | "profile_tour_completed"
  | "profile_tour_skipped"
  | "profile_completion_cta_clicked";
export function activationEvent(
  name: ActivationEvent,
  category?:
    | "talent"
    | "crew"
    | "explore"
    | "project"
    | "locations"
    | "learn"
    | number,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("filmatta:activation", {
      detail: { name, ...(category !== undefined ? { category } : {}) },
    }),
  );
}
