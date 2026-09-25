import assert from "node:assert/strict";
import test from "node:test";
import { deriveWriterTimeline, parseSceneHeading, refreshedSceneKey } from "../../lib/writer/timeline.ts";
import type { ScreenplayKind } from "../../lib/writer/document.ts";

let idSequence = 0;

function block(kind: ScreenplayKind, text = "", id: string | null = nextId()) {
  return {
    type: "screenplayBlock",
    attrs: { ...(id ? { id } : {}), kind },
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

function nextId() {
  idSequence += 1;
  return `00000000-0000-4000-8000-${idSequence.toString().padStart(12, "0")}`;
}

function derive(content: ReturnType<typeof block>[], overrides: Partial<Parameters<typeof deriveWriterTimeline>[0]> = {}) {
  return deriveWriterTimeline({
    scriptId: "10000000-0000-4000-8000-000000000001",
    title: "Prueba",
    document: { type: "doc", content },
    schemaVersion: 1,
    revision: 7,
    updatedAt: "2026-09-25T12:00:00.000Z",
    ...overrides,
  });
}

function timeline(content: ReturnType<typeof block>[]) {
  const result = derive(content);
  if (!result.ok) throw new Error(result.message);
  return result.timeline;
}

test("empty documents and documents without headings produce a useful empty-scene model", () => {
  assert.equal(timeline([]).scenes.length, 0);
  const withoutHeading = timeline([
    block("action", "Texto de apertura sin escena"),
    block("authorNote", "ANA en CASA, no debe derivarse"),
    block("character", "ANA"),
  ]);
  assert.equal(withoutHeading.scenes.length, 0);
  assert.equal(withoutHeading.characters.length, 0);
  assert.equal(withoutHeading.locations.length, 0);
  assert.equal(withoutHeading.preamble?.wordCount, 5);
  assert.doesNotMatch(withoutHeading.preamble?.excerpt ?? "", /CASA|ANA/);
});

test("keeps preamble and consecutive empty scenes without inventing content", () => {
  const result = timeline([
    block("action", "Antes de empezar"),
    block("sceneHeading", "INT. CASA - DÍA"),
    block("sceneHeading", "EXT. CALLE - NOCHE"),
    block("action", "La lluvia cae"),
  ]);
  assert.equal(result.preamble?.wordCount, 3);
  assert.equal(result.scenes.length, 2);
  assert.equal(result.scenes[0].wordCount, 0);
  assert.equal(result.scenes[1].wordCount, 3);
  assert.match(result.issues[0], /antes del primer encabezado/i);
});

test("same or edited headings remain distinct through their source ids", () => {
  const firstId = nextId();
  const secondId = nextId();
  const result = timeline([
    block("sceneHeading", "INT. CASA - DÍA", firstId),
    block("sceneHeading", "INT. CASA - DÍA", secondId),
  ]);
  assert.deepEqual(result.scenes.map((scene) => scene.sourceId), [firstId, secondId]);
  assert.notEqual(result.scenes[0].key, result.scenes[1].key);
  const edited = timeline([block("sceneHeading", "INT. CASA - NOCHE", firstId)]);
  assert.equal(edited.scenes[0].sourceId, firstId);
});

test("author notes never create associations, words, or excerpts", () => {
  const result = timeline([
    block("sceneHeading", "INT. SET - DÍA"),
    block("authorNote", "ANA aparece en LOCACIÓN SECRETA"),
    block("action", "Una puerta abre"),
  ]);
  assert.equal(result.characters.length, 0);
  assert.equal(result.scenes[0].wordCount, 3);
  assert.equal(result.scenes[0].excerpt, "Una puerta abre");
  assert.doesNotMatch(result.scenes[0].excerpt ?? "", /SECRETA/);
});

test("character detection is per scene, conservative, and keeps recognized suffix variants", () => {
  const result = timeline([
    block("sceneHeading", "INT. CASA - DÍA"),
    block("character", "  Ana  "),
    block("dialogue", "Hola"),
    block("character", "ANA (V.O.)"),
    block("character", "ANA (CONT'D)"),
    block("character", "ANA JOVEN"),
    block("character", "JUAN"),
    block("character", "JUANITO"),
    block("action", "MARTA cruza el cuarto"),
    block("sceneHeading", "EXT. CALLE - NOCHE"),
    block("character", "ANA (O.S.)"),
  ]);
  const ana = result.characters.find((character) => character.key === "ANA");
  assert.ok(ana);
  assert.equal(ana.sceneKeys.length, 2);
  assert.deepEqual(ana.variants, ["Ana", "ANA (V.O.)", "ANA (CONT'D)", "ANA (O.S.)"]);
  assert.ok(result.characters.some((character) => character.key === "ANA JOVEN"));
  assert.ok(result.characters.some((character) => character.key === "JUAN"));
  assert.ok(result.characters.some((character) => character.key === "JUANITO"));
  assert.equal(result.characters.some((character) => character.key === "MARTA"), false);
});

test("heading parser recognizes explicit bilingual forms and preserves compound locations", () => {
  assert.deepEqual(parseSceneHeading("INT. CASA - COCINA - NOCHE"), {
    environment: "interior",
    location: "CASA - COCINA",
    locationKey: "CASA - COCINA",
    moment: "NOCHE",
    momentCategory: "night",
  });
  assert.equal(parseSceneHeading("EXT. CALLE - DAY").momentCategory, "day");
  assert.equal(parseSceneHeading("INT./EXT. COCHE - NIGHT").environment, "mixed");
  assert.equal(parseSceneHeading("INT. PASILLO - CONTINUO").moment, "CONTINUO");
  assert.equal(parseSceneHeading("INT. PATIO - MÁS TARDE").momentCategory, "other");
  assert.equal(parseSceneHeading("EXT. AZOTEA - DIA").momentCategory, "day");
  assert.deepEqual(parseSceneHeading("UN RECUERDO BORROSO"), {
    environment: "unknown",
    location: null,
    locationKey: null,
    moment: null,
    momentCategory: "unspecified",
  });
});

test("location grouping uses conservative normalized equality", () => {
  const result = timeline([
    block("sceneHeading", "INT. Casa - DÍA"),
    block("sceneHeading", "INT. CASA - NOCHE"),
    block("sceneHeading", "INT. CASA DE ANA - DÍA"),
    block("sceneHeading", "INT. CASA DE ANA - COCINA - NOCHE"),
  ]);
  assert.equal(result.locations.length, 3);
  assert.equal(result.locations.find((location) => location.key === "CASA")?.sceneKeys.length, 2);
  assert.ok(result.locations.some((location) => location.key === "CASA DE ANA"));
  assert.ok(result.locations.some((location) => location.key === "CASA DE ANA - COCINA"));
});

test("word counts include action and dialogue only and support unicode inline nodes", () => {
  const heading = block("sceneHeading", "INT. CAFÉ - DÍA");
  const action = block("action") as Record<string, unknown>;
  action.content = [
    { type: "text", text: "Árbol y" },
    { type: "hardBreak" },
    { type: "text", text: "niñez feliz" },
  ];
  const result = timeline([
    heading,
    action as ReturnType<typeof block>,
    block("character", "ANA"),
    block("parenthetical", "(susurra muy bajo)"),
    block("dialogue", "Sí, aquí."),
    block("transition", "CORTE A:"),
  ]);
  assert.equal(result.scenes[0].wordCount, 6);
  assert.match(result.scenes[0].excerpt ?? "", /Árbol y niñez feliz Sí, aquí\./);
});

test("missing heading ids get revision-scoped ephemeral keys without mutating the input", () => {
  const document = { type: "doc", content: [block("sceneHeading", "EXT. MAR - NOCHE", null)] };
  const before = structuredClone(document);
  const result = deriveWriterTimeline({
    scriptId: "id",
    title: "Prueba",
    document,
    schemaVersion: 1,
    revision: 9,
    updatedAt: "2026-09-25T12:00:00.000Z",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.timeline.scenes[0].key, "ephemeral:9:0");
  assert.equal(result.timeline.scenes[0].canDeepLink, false);
  assert.deepEqual(document, before);
});

test("same snapshot is deterministic and incompatible schemas fail closed", () => {
  const content = [block("sceneHeading", "INT. CASA - DÍA"), block("action", "Uno dos")];
  assert.deepEqual(derive(content), derive(content));
  assert.deepEqual(derive(content, { schemaVersion: 99 }), {
    ok: false,
    message: "La versión guardada de este guion no es compatible con Timeline.",
  });
  const incompatible = deriveWriterTimeline({
    scriptId: "id",
    title: "Prueba",
    document: { type: "doc", content: [{ type: "paragraph" }] },
    schemaVersion: 1,
    revision: 1,
    updatedAt: "now",
  });
  assert.equal(incompatible.ok, false);
});

test("refresh keeps selection only when the stable scene id still exists", () => {
  const stableId = nextId();
  const previous = timeline([block("sceneHeading", "INT. CASA - DÍA", stableId)]).scenes[0];
  const renamed = timeline([block("sceneHeading", "INT. CASA - NOCHE", stableId)]).scenes;
  assert.equal(refreshedSceneKey(previous, renamed), stableId);
  assert.equal(refreshedSceneKey(previous, timeline([block("sceneHeading", "EXT. MAR - DÍA")]).scenes), null);
  const ephemeral = timeline([block("sceneHeading", "EXT. MAR - NOCHE", null)]).scenes[0];
  assert.equal(refreshedSceneKey(ephemeral, [ephemeral]), null);
});

test("a synthetic long document derives about 20,000 body words without truncation", () => {
  const content: ReturnType<typeof block>[] = [];
  const words = Array.from({ length: 200 }, (_, index) => `palabra${index}`).join(" ");
  for (let scene = 0; scene < 100; scene += 1) {
    content.push(block("sceneHeading", `${scene % 2 ? "EXT." : "INT."} ESPACIO ${scene % 12} - ${scene % 3 ? "DÍA" : "NOCHE"}`));
    content.push(block("action", words));
    content.push(block("character", `PERSONAJE ${scene % 16}`));
    content.push(block("dialogue", ""));
  }
  const result = timeline(content);
  assert.equal(result.scenes.length, 100);
  assert.equal(result.totalBodyWords, 20_000);
  assert.equal(result.characters.length, 16);
  assert.equal(result.locations.length, 12);
  assert.equal(result.scenes.at(-1)?.order, 100);
});
