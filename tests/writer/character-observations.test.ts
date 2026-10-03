import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import {
  analyzeWriterCharacterObservations,
  deriveWriterKnownCharacterIdentities,
  normalizeWriterCharacterIdentity,
  writerCharacterIdentityKey,
} from "../../lib/writer/character-observations.ts";
import {
  isClearlyNonCharacterLine,
  isWriterDateLine,
  isWriterTimeLine,
  parseWriterCharacterCue,
} from "../../lib/writer/character-cues.ts";
import {
  emptyWriterCharacterDecisionState,
  parseWriterCharacterDecisionState,
  writerCharacterDecisionStorageKey,
} from "../../lib/writer/character-observation-storage.ts";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import { LA_FRECUENCIA_CHARACTER_DOCUMENT } from "./fixtures/character-review.ts";

function documentWith(...actions: string[]): WriterDocument {
  return {
    type: "doc",
    content: [
      createBlock("sceneHeading", "INT. TALLER - DÍA"),
      ...actions.map((action) => createBlock("action", action)),
    ],
  };
}

test("detects conservative Spanish character candidates without changing block types", () => {
  const document = documentWith(
    "CAROLINA abre la puerta.",
    "Entra Carolina.",
    "Un robot observa a Carolina.",
    "Un guardia bloquea la salida.",
    "Un perro sigue a la niña.",
    "Carolina recuerda a Esperanza.",
    "Carolina habla de Mateo.",
    "Carolina no está en la sala.",
    "R-7 observa la pantalla.",
    "SOFÍA camina hacia Tomás.",
    "Aparece Lucía.",
  );
  const result = analyzeWriterCharacterObservations(document, []);
  const identities = result.observations.map((item) => item.identity);
  assert.ok(identities.includes("CAROLINA"));
  assert.ok(identities.includes("Carolina"));
  assert.ok(identities.includes("Un robot"));
  assert.ok(identities.includes("Un guardia"));
  assert.ok(identities.includes("Un perro"));
  assert.ok(identities.includes("la niña"));
  assert.ok(identities.includes("Esperanza"));
  assert.ok(identities.includes("Mateo"));
  assert.ok(identities.includes("R-7"));
  assert.ok(identities.includes("SOFÍA"));
  assert.ok(identities.includes("Lucía"));
  assert.equal(result.observations.find((item) => item.identity === "Esperanza")?.evidence, "mention");
  assert.equal(result.observations.find((item) => item.identity === "Mateo")?.evidence, "mention");
  assert.equal(result.observations.find((item) => item.excerpt.includes("no está") && item.identity === "Carolina")?.evidence, "mention");
  assert.ok(document.content.slice(1).every((block) => block.attrs.kind === "action"));
});

test("abstains from inanimate nouns and unresolved pronouns", () => {
  const document = documentWith(
    "La puerta se abre.",
    "El viento golpea la ventana.",
    "La esperanza desaparece.",
    "Él entra.",
  );
  const result = analyzeWriterCharacterObservations(document, []);
  assert.deepEqual(result.observations, []);
});

test("filters dates, times and structural labels before character review", () => {
  for (const value of [
    "17 DE NOVIEMBRE DE 2004",
    "12 DE MARZO",
    "3 ENERO 1999",
    "NOVEMBER 17, 2004",
  ]) {
    assert.equal(isWriterDateLine(value), true, value);
    assert.equal(isClearlyNonCharacterLine(value), true, value);
  }
  assert.equal(isWriterTimeLine("3:45 AM"), true);
  assert.equal(isClearlyNonCharacterLine("CORTE A:"), true);
  assert.equal(isClearlyNonCharacterLine("INT. RADIO - NOCHE"), true);
  assert.equal(isClearlyNonCharacterLine("MARA"), false);
});

test("known cue modalities collapse to one base identity without changing cue text", () => {
  const values = ["PADRE", "PADRE (GRABACIÓN)", "PADRE (VIDEO)", "RUBÉN", "RUBÉN (ALTAVOCES)"];
  const document: WriterDocument = { type: "doc", content: values.map((value) => createBlock("character", value)) };
  const identities = deriveWriterKnownCharacterIdentities(document);
  assert.deepEqual(identities.map((identity) => identity.name), ["PADRE", "RUBÉN"]);
  assert.deepEqual(identities.find((identity) => identity.key === "PADRE")?.variants, ["GRABACIÓN", "VIDEO"]);
  assert.deepEqual(identities.find((identity) => identity.key === "RUBÉN")?.variants, ["ALTAVOCES"]);
  assert.equal(writerCharacterIdentityKey("PADRE (TELÉFONO)"), "PADRE");
  assert.equal(parseWriterCharacterCue("RUBÉN (V.O.)").name, "RUBÉN");
  assert.deepEqual(document.content.map((block) => block.content?.[0]?.type === "text" ? block.content[0].text : ""), values);
});

test("LA FRECUENCIA recognizes the five real identities and excludes the date", () => {
  const identities = deriveWriterKnownCharacterIdentities(LA_FRECUENCIA_CHARACTER_DOCUMENT);
  assert.deepEqual(identities.map((identity) => identity.name), ["MARA", "TOMÁS", "IRIS", "RUBÉN", "PADRE"]);
  assert.deepEqual(identities.find((identity) => identity.name === "RUBÉN")?.variants, ["ALTAVOCES"]);
  assert.deepEqual(identities.find((identity) => identity.name === "PADRE")?.variants, ["GRABACIÓN", "VIDEO"]);
  assert.equal(identities.some((identity) => identity.name.includes("NOVIEMBRE")), false);
  assert.equal(LA_FRECUENCIA_CHARACTER_DOCUMENT.content[1]?.attrs.kind, "action");
});

test("unknown parentheticals remain part of the identity and are not over-merged", () => {
  assert.equal(writerCharacterIdentityKey("ALEX (MAYOR)"), "ALEX (MAYOR)");
  assert.notEqual(writerCharacterIdentityKey("ALEX"), writerCharacterIdentityKey("ALEX (MAYOR)"));
});

test("NADIE remains an ambiguous human-review candidate and ignored decisions stay authoritative", () => {
  const document = documentWith("Nadie habla.");
  const observation = analyzeWriterCharacterObservations(document, []).observations.find((item) => item.identity === "Nadie");
  assert.ok(observation);
  assert.equal(observation.known, false);
  assert.equal(observation.confidence, "medium");
  const ignored = parseWriterCharacterDecisionState({
    version: 1,
    identities: [],
    decisions: [{
      fingerprint: observation.fingerprint,
      blockId: observation.blockId,
      state: "ignored",
      decidedAt: 1,
    }],
  });
  assert.equal(ignored.decisions[0]?.state, "ignored");
  assert.equal(ignored.decisions[0]?.fingerprint, observation.fingerprint);
});

test("distinguishes known references, mentions, roles by scene, and incremental cache reuse", () => {
  const firstScene = createBlock("sceneHeading", "INT. CASA - DÍA");
  const character = createBlock("character", "CAROLINA");
  const firstReference = createBlock("action", "Carolina abre la ventana.");
  const mention = createBlock("action", "Carolina habla de Mateo.");
  const firstGuard = createBlock("action", "Tres guardias observan la puerta.");
  const secondScene = createBlock("sceneHeading", "EXT. PATIO - NOCHE");
  const secondGuard = createBlock("action", "Tres guardias avanzan.");
  const document: WriterDocument = { type: "doc", content: [firstScene, character, firstReference, mention, firstGuard, secondScene, secondGuard] };
  const known = deriveWriterKnownCharacterIdentities(document);
  const first = analyzeWriterCharacterObservations(document, known);
  const second = analyzeWriterCharacterObservations(document, known, first.cache);
  assert.equal(first.observations.find((item) => item.identity === "Carolina")?.known, true);
  assert.equal(first.observations.find((item) => item.identity === "Carolina" && item.excerpt.includes("habla"))?.evidence, "actionReference");
  const guards = first.observations.filter((item) => normalizeWriterCharacterIdentity(item.identity) === "TRES GUARDIAS");
  assert.equal(guards.length, 2);
  assert.notEqual(guards[0].identityKey, guards[1].identityKey);
  assert.equal(second.analyzedBlocks, 0);
  assert.equal(second.reusedBlocks, 4);
});

test("keeps local decisions minimal, versioned, and isolated by origin, user, and document", () => {
  const empty = emptyWriterCharacterDecisionState();
  assert.deepEqual(parseWriterCharacterDecisionState({ ...empty, scriptText: "no se conserva" }), empty);
  assert.notEqual(
    writerCharacterDecisionStorageKey("https://preview.example", "user-a", "doc-a"),
    writerCharacterDecisionStorageKey("https://preview.example", "user-b", "doc-a"),
  );
  assert.notEqual(
    writerCharacterDecisionStorageKey("https://preview.example", "user-a", "doc-a"),
    writerCharacterDecisionStorageKey("https://preview.example", "user-a", "doc-b"),
  );
});

test("batches a long synthetic script and reuses unchanged Action blocks", () => {
  const document = documentWith(...Array.from({ length: 1_000 }, (_, index) => (
    index % 20 === 0 ? `Una médica observa a R-${index}.` : `La puerta número ${index} permanece cerrada.`
  )));
  const firstStarted = performance.now();
  const first = analyzeWriterCharacterObservations(document, []);
  const firstMs = performance.now() - firstStarted;
  const secondStarted = performance.now();
  const second = analyzeWriterCharacterObservations(document, [], first.cache);
  const secondMs = performance.now() - secondStarted;
  assert.equal(first.analyzedBlocks, 1_000);
  assert.equal(second.analyzedBlocks, 0);
  assert.equal(second.reusedBlocks, 1_000);
  assert.ok(first.observations.length >= 50);
  console.log(`QA_OBSERVATIONS blocks=1000 firstRuns=${first.analyzedBlocks} reused=${second.reusedBlocks} firstMs=${firstMs.toFixed(2)} cachedMs=${secondMs.toFixed(2)} requests=0`);
});
