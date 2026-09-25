import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import load from "../load.mjs";

const activation = load("lib/locations/activation.ts");
const migration = readFileSync("supabase/migrations/20260929010000_locations_activation_v1.sql", "utf8");
const constraintFix = readFileSync("supabase/migrations/20260929011000_locations_activation_constraint_null_fix.sql", "utf8");
const postalMigration = readFileSync("supabase/migrations/20260929020000_locations_postal_code.sql", "utf8");
const actions = readFileSync("app/mis-locaciones/nueva/activation-actions.ts", "utf8");
const page = readFileSync("app/mis-locaciones/nueva/page.tsx", "utf8");
const wizard = readFileSync("app/mis-locaciones/nueva/NewLocationWizard.tsx", "utf8");
const geographyFields = readFileSync("components/locations/LocationGeographyFields.tsx", "utf8");
const ownerEditor = readFileSync("app/mis-locaciones/LocationOwnerEditor.tsx", "utf8");
const ownerActions = readFileSync("app/mis-locaciones/actions.ts", "utf8");
const listing = readFileSync("app/mis-locaciones/page.tsx", "utf8");

test("schema models exactly historical, active and completed activation states", () => {
  assert.match(migration, /add column onboarding_step smallint/);
  assert.match(migration, /add column onboarding_completed_at timestamptz/);
  assert.match(migration, /onboarding_step is null and onboarding_completed_at is null/);
  assert.match(migration, /onboarding_step between 1 and 7 and onboarding_completed_at is null/);
  assert.match(migration, /onboarding_step = 8 and onboarding_completed_at is not null/);
  assert.doesNotMatch(migration, /update public\.locations|onboarding_version|jsonb|policy|enable row level security/i);
  assert.match(constraintFix, /onboarding_step is not null/);
  assert.match(constraintFix, /drop constraint locations_onboarding_state_check/);
  assert.doesNotMatch(constraintFix, /add column|update public\.locations|policy|enable row level security/i);
});

test("activation location step stores a separate structured Mexico postal code", () => {
  assert.match(postalMigration, /add column postal_code text/);
  assert.doesNotMatch(postalMigration, /update public\.locations|default|policy|row level security/i);
  assert.match(wizard, /data-step-panel="2"[\s\S]*?<StepTwoGeography/);
  assert.doesNotMatch(wizard, /Buscar ciudad o localidad|Ciudad o localidad/);
  assert.match(wizard, />Código postal<\/span>/);
  assert.match(wizard, /name="postal_code"/);
  assert.match(wizard, /placeholder="Ej\. 44160"/);
  assert.match(wizard, /pattern="\[0-9\]\{5\}"/);
  assert.match(wizard, />Zona aproximada \(opcional\)<\/span>/);
  assert.match(actions, /\^\\d\{5\}\$/);
  assert.match(actions, /postal_code: geography\.value\.postalCode/);
  assert.match(actions, /resolveMexicoMunicipality/);
  assert.equal((actions.match(/locality_code: null/g) ?? []).length, 1, "only a brand-new draft initializes locality as null");
  assert.match(geographyFields, /label="Código postal"/);
  assert.match(ownerEditor, /postalCode: location\.postal_code/);
  assert.match(ownerActions, /postal_code: postalCode/);
});

test("historical locations never enter the walkthrough and active ones resume from persisted step", () => {
  assert.equal(activation.locationActivationInProgress(null, null), false);
  assert.equal(activation.locationActivationInProgress(4, null), true);
  assert.equal(activation.locationActivationCompleted(8, "2026-09-24T00:00:00.000Z"), true);
  assert.equal(activation.locationActivationHref("location-id", 4), "/mis-locaciones/nueva?location=location-id&step=4");
  assert.match(page, /locationActivationInProgress/);
  assert.match(page, /locationActivationCompleted/);
  assert.match(listing, /Continuar configuración/);
});

test("step only advances after validated content is saved by an authenticated owner", () => {
  assert.match(actions, /auth\.data\.user/);
  assert.match(actions, /\.eq\("owner_id", userId\)/);
  assert.match(actions, /if \(!pricing\.ok\)[\s\S]*?return failure/);
  assert.match(actions, /const updated = await supabase\.from\("locations"\)\.update\(\{/);
  assert.match(actions, /onboarding_step: nextStep/);
  assert.match(actions, /onboarding_completed_at: completing \? new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(actions, /status:\s*"published"/);
});

test("eight-step client preserves mounted inputs and only reports confirmed saves", () => {
  for (let step = 1; step <= 8; step += 1) {
    assert.match(wizard, new RegExp(`data-step-panel="${step}"`));
  }
  assert.match(wizard, /setSaved\("Guardado"\)/);
  assert.match(wizard, /if \(!result\.ok\)/);
  assert.match(wizard, /Guardar y salir/);
  assert.match(wizard, /prefers-reduced-motion/);
  assert.match(wizard, /result\.locationId/);
});
