import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import load from "../load.mjs";

const geography = load("lib/locations/geography.ts");
const completeness = load("lib/locations/completeness.ts");
const migration = readFileSync("supabase/migrations/20260928090000_location_geography_creation.sql", "utf8");
const wizard = readFileSync("app/mis-locaciones/nueva/NewLocationWizard.tsx", "utf8");
const activationActions = readFileSync("app/mis-locaciones/nueva/activation-actions.ts", "utf8");
const editor = readFileSync("app/mis-locaciones/LocationOwnerEditor.tsx", "utf8");
const actions = readFileSync("app/mis-locaciones/actions.ts", "utf8");
const editorShell = readFileSync("app/mis-locaciones/LocationOwnerEditorShell.tsx", "utf8");
const publicPage = readFileSync("app/locaciones/[slug]/page.tsx", "utf8");

test("Mexico geography preserves official entity, municipality and locality levels", () => {
  assert.equal(geography.MEXICO_REGIONS.length, 32);
  assert.equal(new Set(geography.MEXICO_REGIONS.map((item) => item.code)).size, 32);
  assert.equal(geography.MEXICO_GEOGRAPHY_SOURCE, "inegi-catalogo-unico-v2");
  assert.match(migration, /municipality_code text/);
  assert.match(migration, /locality_code text/);
  assert.match(actions, /resolveMexicoGeography/);
  assert.match(actions, /city: geography\.localityName/);
});

test("activation creates an idempotent draft only after identity and geography", () => {
  assert.match(wizard, /Paso \{step\} de \{LOCATION_ACTIVATION_STEPS\}/);
  assert.match(wizard, /data-step-panel="1"/);
  assert.match(wizard, /data-step-panel="8"/);
  assert.match(activationActions, /createLocationActivationDraft/);
  assert.match(activationActions, /creation_key: creationKey/);
  assert.match(migration, /locations_owner_creation_key_unique/);
  assert.match(activationActions, /status: "draft"/);
  assert.match(activationActions, /onboarding_step: 3/);
  assert.match(wizard, /LocationPhotoManager/);
  assert.doesNotMatch(wizard, /LocationTourRecorder/);
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
  assert.match(editor, /LocationSectionForm/);
  assert.match(actions, /Promise<LocationEditorActionResult>/);
});

test("tour is the first functional owner block and photos follow without duplication", () => {
  const tour = editor.indexOf('title="Recorrido"');
  const photos = editor.indexOf('title="Fotos del lugar"');
  const identity = editor.indexOf('section="identity"');
  assert.ok(tour > -1 && tour < photos && photos < identity);
  assert.equal((editor.match(/<LocationTourRecorder/g) ?? []).length, 1);
  assert.match(editor, /LocationTourRecorder/);
});

test("owner editor exposes one visual panel and one focused window per editable group", () => {
  for (const panel of ["photos", "basic", "location", "pricing", "characteristics", "conditions", "contact"]) {
    assert.match(editor, new RegExp(`panel="${panel}"`));
  }
  assert.match(editorShell, /role="dialog"/);
  assert.match(editorShell, /aria-modal="true"/);
  assert.match(editorShell, /document\.addEventListener\("keydown"/);
  assert.match(editorShell, /returnFocus\.current\?\.focus/);
  assert.match(editorShell, /Hay cambios sin guardar/);
  assert.match(editorShell, /Seguir editando/);
  assert.match(editorShell, /Descartar cambios/);
  assert.match(editorShell, /inert=\{activePanel \? true : undefined\}/);
});

test("focused windows keep the existing section actions and media flows", () => {
  assert.match(editor, /section="identity" action=\{actions\.identity\}/);
  assert.match(editor, /section="description" action=\{actions\.description\}/);
  assert.match(editor, /section="conditions" action=\{actions\.conditions\}/);
  assert.match(editor, /section="notes" action=\{actions\.notes\}/);
  assert.equal((editor.match(/<LocationPhotoManager/g) ?? []).length, 1);
  assert.equal((editor.match(/<LocationTourRecorder/g) ?? []).length, 1);
  assert.doesNotMatch(editor, /<form[\s>]/);
});

test("public ready tour precedes photos and visitors get no tour empty state", () => {
  const tour = publicPage.indexOf("location.cameraTour ?");
  const photos = publicPage.indexOf('title="Fotos del lugar"');
  const description = publicPage.indexOf('title="Descripción"');
  assert.ok(tour > -1 && tour < photos && photos < description);
  assert.match(publicPage, /location\.cameraTour \? <Section title="Recorrido"/);
  assert.match(publicPage, /: location\.tourVideoUrl && <Section title="Recorrido"/);
  assert.doesNotMatch(publicPage, /Grabar recorrido|Añade un recorrido|Recorrido pendiente/);
});

test("owner-only bottom bar reuses section actions and preserves dirty state semantics", () => {
  assert.match(editor, /LocationOwnerEditorShell/);
  assert.doesNotMatch(wizard, /LocationOwnerEditorShell/);
  assert.match(editorShell, /Cambios sin guardar/);
  assert.match(editorShell, /Guardando…/);
  assert.match(editorShell, /Guardado/);
  assert.match(editorShell, /status === "published" \? "draft" : "published"/);
  assert.match(editorShell, /status === "published" \? "Despublicar" : "Publicar"/);
  assert.match(editorShell, /Guarda los cambios pendientes antes de cambiar la publicación/);
  assert.match(editorShell, /¿Despublicar esta locación\?/);
  assert.match(editorShell, /env\(safe-area-inset-bottom\)/);
  assert.match(editorShell, /pb-36 sm:pb-32/);
  assert.doesNotMatch(actions, /getLocationPublicationRequirements|getLocationCompleteness/);
  assert.match(actions, /status: updated\.data\.status/);
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
