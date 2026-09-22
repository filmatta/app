import test from "node:test";
import assert from "node:assert/strict";
import load from "../load.mjs";
const a = load("lib/profiles/activation.ts");
const c = load("lib/profiles/activation-completion.ts");
const p = load("lib/profiles/presentation.ts");
const profile = {
  display_name: "Persona P.",
  slug: "persona",
  disciplines: ["Actuación"],
  city: "Guadalajara",
  availability: "available",
  bio: "",
  equipment: [],
  skills: [],
  portfolio_items: [],
  presentation: { ...p.EMPTY_PRESENTATION, stage_name: "Persona QA" },
  is_public: false,
};
test("onboarding requires identity, disciplines, city and availability; optional fields can be skipped", () => {
  for (const [step, patch] of [
    [1, {}],
    [2, { disciplines: [] }],
    [2, { disciplines: Array(6).fill("Actuación") }],
    [4, { city: " " }],
    [6, { availability: "not_specified" }],
  ])
    assert.ok(a.validateOnboardingStep(step, patch));
  assert.equal(a.validateOnboardingStep(5, {}), null);
  assert.equal(a.validateOnboardingStep(7, {}), null);
  assert.ok(a.minimumProfile(profile));
  assert.equal(a.minimumProfile({ ...profile, city: "" }), false);
});
test("intent changes order, never hides disciplines or creates a selection", () => {
  assert.equal(a.orderedDisciplines("talent")[0], "Actuación");
  assert.equal(a.orderedDisciplines("crew")[0], "Dirección");
  assert.equal(a.orderedDisciplines(null).length, 16);
  assert.equal(a.orderedDisciplines("talent").length, 16);
  assert.equal(a.profileIntent("https://evil.test"), null);
});
test("resume and tour state are private and durable; existing users are not forced", () => {
  assert.equal(a.resumeStep(4), 4);
  assert.equal(a.resumeStep(99), 1);
  assert.equal(a.shouldStartTour(null, null), false);
  assert.equal(a.shouldStartTour("today", null), true);
  assert.equal(a.shouldStartTour("today", "today"), false);
});
test("home CTA routes preserve intent through existing auth next", () => {
  assert.equal(a.onboardingPath("talent"), "/onboarding/perfil?intent=talent");
  assert.match(
    a.homeProfileAction(false, null, 0).href,
    /^\/registro\?next=%2Fonboarding%2Fperfil$/,
  );
  assert.equal(a.homeProfileAction(true, null, 0).label, "Crear mi perfil");
  assert.equal(a.homeProfileAction(true, profile, 40).href, "/mi-perfil");
  assert.equal(
    a.homeProfileAction(true, { ...profile, is_public: true }, 90).href,
    "/perfiles/persona",
  );
});
test("completion uses real media, excludes pending/archive and identity/reel covers from Book", () => {
  const base = c.activationCompletion(profile, []).percent;
  assert.ok(Number.isFinite(base));
  assert.equal(c.activationCompletion(null).percent, 0);
  for (const patch of [
    { bio: "Actriz" },
    { presentation: { ...profile.presentation, portrait_media_id: "id" } },
    {
      presentation: {
        ...profile.presentation,
        credits: [{ title: "Proyecto", role: "Actor", year: "2026" }],
      },
    },
  ])
    assert.ok(
      c.activationCompletion({ ...profile, ...patch }, []).percent > base,
    );
  for (const category of ["reel", "book"])
    assert.ok(
      c.activationCompletion(profile, [
        {
          category,
          purpose: "portfolio",
          status: "ready",
          visibility: "visible",
        },
      ]).percent > base,
    );
  for (const item of [
    {
      category: "book",
      purpose: "reel_cover",
      status: "ready",
      visibility: "visible",
    },
    {
      category: "reel",
      purpose: "portfolio",
      status: "processing",
      visibility: "visible",
    },
    {
      category: "book",
      purpose: "portfolio",
      status: "ready",
      visibility: "archived",
    },
  ])
    assert.equal(c.activationCompletion(profile, [item]).percent, base);
  assert.ok(c.activationCompletion(profile, []).percent <= 100);
});
test("producer completion does not require Reel/Book and accepts equipment", () => {
  const producer = { ...profile, disciplines: ["Producción"] };
  const result = c.activationCompletion(producer, []);
  assert.equal(
    result.checks.some((x) => x.key === "reel"),
    false,
  );
  assert.equal(
    result.checks.some((x) => x.key === "book"),
    false,
  );
  assert.ok(
    c.activationCompletion({ ...producer, equipment: ["Radio"] }, []).percent >
      result.percent,
  );
});
