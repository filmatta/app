import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import load from "../load.mjs";

const geography = load("lib/locations/geography.ts");
const completeness = load("lib/locations/completeness.ts");
const migration = readFileSync("supabase/migrations/20260928090000_location_geography_creation.sql", "utf8");
const wizard = readFileSync("app/mis-locaciones/nueva/NewLocationWizard.tsx", "utf8");
const editor = readFileSync("app/mis-locaciones/LocationOwnerEditor.tsx", "utf8");
const actions = readFileSync("app/mis-locaciones/actions.ts", "utf8");

test("Mexico geography preserves official entity, municipality and locality levels", () => {
  assert.equal(geography.MEXICO_REGIONS.length, 32);
  assert.equal(new Set(geography.MEXICO_REGIONS.map((item) => item.code)).size, 32);
  assert.equal(geography.MEXICO_GEOGRAPHY_SOURCE, "inegi-catalogo-unico-v2");
  assert.match(migration, /municipality_code text/);
  assert.match(migration, /locality_code text/);
  assert.match(actions, /resolveMexicoGeography/);
  assert.match(actions, /city: geography\.localityName/);
});

test("short creation flow always creates an idempotent draft before media", () => {
  assert.match(wizard, /Paso 1 de 3/);
  assert.match(wizard, /Paso 2 de 3/);
  assert.match(wizard, /Paso 3 de 3/);
  assert.match(wizard, /Crear mi locación/);
  assert.match(actions, /creation_key: creationKey/);
  assert.match(migration, /locations_owner_creation_key_unique/);
  assert.match(actions, /status: "draft"/);
  assert.doesNotMatch(wizard, /LocationPhotoManager|LocationTourRecorder/);
});

test("owner editor uses section-scoped actions instead of one fallback form", () => {
  for (const section of ["identity", "location", "pricing", "description", "characteristics", "conditions", "notes", "contact"]) {
    assert.match(actions, new RegExp(`section === "${section}"`));
  }
  assert.match(editor, /actions\.identity/);
  assert.match(editor, /actions\.location/);
  assert.match(editor, /actions\.pricing/);
  assert.match(editor, /LocationPhotoManager/);
  assert.match(editor, /LocationTourRecorder/);
});

test("completeness is derived from persisted content and keeps tour optional", () => {
  const result = completeness.getLocationCompleteness({
    title: "Casa", spaceType: "Casa", city: "Coyoacán", capacity: 20,
    rateMode: "inquire", rateTiers: [], summary: null, description: null,
    readyPhotoCount: 0, hasReadyCover: false, characteristics: { declared_capacity: 20 },
    conditions: {}, contact: null, hasReadyTour: false,
  });
  assert.equal(result.total, 10);
  assert.equal(result.complete, 4);
  assert.equal(result.items.find((item) => item.key === "tour").complete, false);
  assert.match(editor, /El recorrido es opcional/);
});
