import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import {
  detectWriterBreakdownRules,
  sceneLocationLabel,
  validateWriterBreakdownCandidates,
  writerShotlistCsv,
  writerShotlistSummary,
  type WriterShotlist,
} from "../../lib/writer/production.ts";

test("Breakdown rules retain exact evidence and avoid metaphor/mention invention", () => {
  const heading = createBlock("sceneHeading", "INT. RADIO K-17 / CABINA - NOCHE", "11111111-1111-4111-8111-111111111111");
  const character = createBlock("character", "MARA", "22222222-2222-4222-8222-222222222222");
  const action = createBlock("action", "Mara sostiene una pistola mientras escucha. Su mirada era una pistola.", "33333333-3333-4333-8333-333333333333");
  const mention = createBlock("action", "Mara recuerda que su padre tenía una pistola.", "44444444-4444-4444-8444-444444444444");
  const document: WriterDocument = { type: "doc", content: [heading, character, action, mention] };
  const candidates = detectWriterBreakdownRules(document);
  assert.equal(candidates.filter((candidate) => candidate.category === "location").length, 1);
  assert.equal(candidates.filter((candidate) => candidate.category === "character").length, 1);
  const props = candidates.filter((candidate) => candidate.category === "prop");
  assert.equal(props.length, 1);
  assert.equal(props[0]?.name, "pistola");
  assert.equal(props[0]?.blockId, action.attrs.id);
  assert.equal(props[0]?.nature, "used");
  assert.equal(action.content?.[0]?.type === "text" ? action.content[0].text.slice(props[0]!.fromOffset, props[0]!.toOffset) : "", "pistola");
});

test("Breakdown reanalysis recognizes a newly found prop in normal prose without promoting metaphors", () => {
  const heading = createBlock("sceneHeading", "INT. CASA - NOCHE", "61111111-1111-4111-8111-111111111111");
  const before = createBlock("action", "Mara abre un cajón vacío.", "62222222-2222-4222-8222-222222222222");
  const after = createBlock("action", "Mara abre un cajón. Dentro encuentra una pistola. La noticia fue un disparo al corazón.", "62222222-2222-4222-8222-222222222222");
  const initial = detectWriterBreakdownRules({ type: "doc", content: [heading, before] });
  const revised = detectWriterBreakdownRules({ type: "doc", content: [heading, after] });
  assert.equal(initial.some((candidate) => candidate.name === "pistola"), false);
  const pistols = revised.filter((candidate) => candidate.name === "pistola");
  assert.equal(pistols.length, 1);
  assert.equal(pistols[0]?.excerpt, "Mara abre un cajón. Dentro encuentra una pistola. La noticia fue un disparo al corazón.");
  assert.equal(pistols[0]?.nature, "used");
  assert.equal(revised.some((candidate) => /disparo|corazón/iu.test(candidate.name)), false);
});

test("Breakdown recall-first fixture recovers physical inventories without turning metaphors into props", () => {
  const actions = [
    "Mara abre un cajón. Dentro hay una pistola, una libreta roja y unas llaves.",
    "Diego deja su casco sobre la mesa.",
    "Una bicicleta descansa contra la pared.",
    "Ana lleva un abrigo amarillo y gafas oscuras.",
    "Mara entra con una cámara, una mochila y un paraguas.",
    "Rubén conduce un coche antiguo. Deja una carpeta azul sobre el asiento.",
    "Inés viste una chaqueta verde y botas negras.",
    "Hay una radio, una lámpara y unos vasos.",
    "Tomás coloca una caja y un reloj sobre la repisa.",
    "La noticia fue un disparo al corazón. Su relación era una bomba de tiempo. El silencio pesaba toneladas.",
  ];
  const expected = ["cajón", "pistola", "libreta roja", "llaves", "casco", "mesa", "bicicleta", "pared", "abrigo amarillo", "gafas oscuras", "cámara", "mochila", "paraguas", "coche antiguo", "carpeta azul", "asiento", "chaqueta verde", "botas negras", "radio", "lámpara", "vasos", "caja", "reloj", "repisa"];
  const document: WriterDocument = { type: "doc", content: actions.flatMap((text, index) => [createBlock("sceneHeading", `INT. LUGAR ${index + 1} - DÍA`), createBlock("action", text)]) };
  const found = detectWriterBreakdownRules(document).filter((candidate) => candidate.category !== "location");
  const names = new Set(found.map((candidate) => candidate.name));
  const missed = expected.filter((name) => !names.has(name));
  const falsePositives = found.filter((candidate) => /disparo|corazón|bomba|toneladas/iu.test(candidate.name));
  assert.equal(missed.length, 0, `missed: ${missed.join(", ")}`);
  assert.equal(falsePositives.length, 0, `false positives: ${falsePositives.map((item) => item.name).join(", ")}`);
  assert.ok(found.some((candidate) => candidate.name === "coche antiguo" && candidate.category === "vehicle"));
  assert.ok(found.some((candidate) => candidate.name === "chaqueta verde" && candidate.category === "wardrobe"));
});

test("Breakdown physicality gate keeps expanded concrete recall and atomic names", () => {
  const actions = [
    "Mara abre el cajón y encuentra una pistola.",
    "Sobre la mesa hay una libreta roja, unas llaves y una grabadora.",
    "Diego deja el casco junto a la puerta.",
    "Una bicicleta descansa contra la pared.",
    "Ana lleva un abrigo amarillo, botas negras y gafas oscuras.",
    "Tomás saca una cámara de la mochila.",
    "Mara sostiene un paraguas roto.",
    "En la esquina hay tres cajas de cartón.",
    "El camarero coloca dos vasos y una botella sobre la mesa.",
    "Diego encuentra un dispositivo extraño.",
  ];
  const expected = ["cajón", "pistola", "mesa", "libreta roja", "llaves", "grabadora", "casco", "puerta", "bicicleta", "pared", "abrigo amarillo", "botas negras", "gafas oscuras", "cámara", "mochila", "paraguas roto", "cajas de cartón", "vasos", "botella", "dispositivo extraño"];
  const document: WriterDocument = { type: "doc", content: actions.flatMap((text, index) => [createBlock("sceneHeading", `INT. LUGAR ${index + 1} - DÍA`), createBlock("action", text)]) };
  const physical = detectWriterBreakdownRules(document).filter((candidate) => !["location", "character"].includes(candidate.category));
  const names = new Set(physical.map((candidate) => candidate.name));
  assert.deepEqual(expected.filter((name) => !names.has(name)), []);
  assert.deepEqual(physical.filter((candidate) => /\b(?:abre|encuentra|deja|saca|coloca|lleva|sostiene)\b/iu.test(candidate.name)).map((candidate) => candidate.name), []);
  for (const candidate of physical) {
    const block = document.content?.find((item) => item.attrs?.id === candidate.blockId);
    if (candidate.fromOffset != null && candidate.toOffset != null && block?.content?.[0]?.type === "text") {
      assert.equal(block.content[0].text.slice(candidate.fromOffset, candidate.toOffset), candidate.name);
    }
  }
});

test("Breakdown physicality gate rejects clauses, states and metaphors without a noun blacklist", () => {
  const actions = [
    "Ambos se asustan.", "No pasa nada.", "Mara está nerviosa.", "Diego se arrepiente.",
    "La tensión aumenta.", "Todo parece perdido.", "Nadie responde.",
    "La conversación se complica.", "Algo ha cambiado entre ellos.", "El silencio se vuelve insoportable.",
    "La noticia fue un disparo al corazón. Su relación era una bomba de tiempo. El silencio pesaba toneladas.",
    "Mara encuentra una pistola y no sabe si es real, se la da a su hermano, él apunta a un ave y jala el gatillo, no pasa nada. Ambos se asustan.",
    "Mara coloca una bomba sobre la mesa.",
    "Mara abre una puerta y ríe. Diego sostiene un casco y Ana grita.",
  ];
  const document: WriterDocument = { type: "doc", content: actions.flatMap((text, index) => [createBlock("sceneHeading", `INT. LUGAR ${index + 1} - DÍA`), createBlock("action", text)]) };
  const physical = detectWriterBreakdownRules(document).filter((candidate) => !["location", "character"].includes(candidate.category));
  const invalid = /ambos se asustan|no pasa nada|no sabe si es real|se la da|apunta a un ave|jala el gatillo|disparo al corazón|bomba de tiempo|pesaba toneladas|ríe|Ana grita/iu;
  assert.deepEqual(physical.filter((candidate) => invalid.test(candidate.name)).map((candidate) => candidate.name), []);
  assert.equal(physical.filter((candidate) => candidate.name === "bomba").length, 1);
  assert.equal(physical.filter((candidate) => candidate.name === "pistola").length, 1);
  const abstractOnly = new Set(actions.slice(0, 11).flatMap((_, index) => [document.content![index * 2]!.attrs!.id, document.content![index * 2 + 1]!.attrs!.id]));
  assert.equal(physical.filter((candidate) => abstractOnly.has(candidate.sceneId) || abstractOnly.has(candidate.blockId)).length, 0);
});

test("Breakdown decision keys are scoped to evidence, never a global noun blacklist", () => {
  const document: WriterDocument = { type: "doc", content: [
    createBlock("sceneHeading", "INT. CASA - DÍA"),
    createBlock("action", "Mara coloca una bomba sobre la mesa."),
    createBlock("sceneHeading", "EXT. CALLE - NOCHE"),
    createBlock("action", "Diego coloca una bomba sobre la mesa."),
  ] };
  const bombs = detectWriterBreakdownRules(document).filter((candidate) => candidate.name === "bomba");
  assert.equal(bombs.length, 2);
  assert.notEqual(bombs[0]?.fingerprint, bombs[1]?.fingerprint);
});

test("repeated physical occurrences inside one block keep separate review keys", () => {
  const document: WriterDocument = { type: "doc", content: [
    createBlock("sceneHeading", "INT. TALLER - DÍA"),
    createBlock("action", "Mara toma una caja. Diego toma una caja."),
  ] };
  const boxes = detectWriterBreakdownRules(document).filter((candidate) => candidate.name === "caja");
  assert.equal(boxes.length, 2);
  assert.notEqual(boxes[0]?.fingerprint, boxes[1]?.fingerprint);
});

test("hybrid evidence validation accepts exact wardrobe and prop references without fixture dictionaries", () => {
  const heading = createBlock("sceneHeading", "EXT. BOSQUE - NOCHE", "51111111-1111-4111-8111-111111111111");
  const action = createBlock("action", "Mara entra con un abrigo rojo. Rubén saca una pistola y apunta a Mara.", "52222222-2222-4222-8222-222222222222");
  const variant = createBlock("action", "Inés deja su impermeable amarillo y levanta una linterna vieja.", "53333333-3333-4333-8333-333333333333");
  const document: WriterDocument = { type: "doc", content: [heading, action, variant] };
  const candidates = validateWriterBreakdownCandidates([
    { name: "abrigo rojo", category: "wardrobe", sceneId: heading.attrs.id, blockId: action.attrs.id, excerpt: "Mara entra con un abrigo rojo.", nature: "present" },
    { name: "pistola", category: "prop", sceneId: heading.attrs.id, blockId: action.attrs.id, excerpt: "Rubén saca una pistola y apunta a Mara.", nature: "used" },
    { name: "impermeable amarillo", category: "wardrobe", sceneId: heading.attrs.id, blockId: variant.attrs.id, excerpt: "Inés deja su impermeable amarillo", nature: "present" },
    { name: "linterna vieja", category: "prop", sceneId: heading.attrs.id, blockId: variant.attrs.id, excerpt: "levanta una linterna vieja.", nature: "used" },
    { name: "objeto inventado", category: "prop", sceneId: heading.attrs.id, blockId: variant.attrs.id, excerpt: "texto que no existe", nature: "inferred" },
  ], document);
  assert.deepEqual(candidates.map((candidate) => [candidate.name, candidate.category]), [
    ["abrigo rojo", "wardrobe"], ["pistola", "prop"], ["impermeable amarillo", "wardrobe"], ["linterna vieja", "prop"],
  ]);
});

test("scene locations preserve hierarchy", () => {
  assert.equal(sceneLocationLabel("INT. RADIO K-17 / CABINA - NOCHE"), "RADIO K-17 / CABINA");
  assert.notEqual(sceneLocationLabel("INT. RADIO K-17 / ARCHIVO - NOCHE"), sceneLocationLabel("INT. RADIO K-17 / CABINA - NOCHE"));
});

test("CSV preserves Spanish and neutralizes spreadsheet formulas", () => {
  const shotlist = fixtureShotlist();
  shotlist.groups[0]!.shots[0]!.subject = "=HYPERLINK(\"https://invalid\")";
  shotlist.groups[0]!.shots[0]!.description = "Mara escucha la canción número veintidós.";
  const csv = writerShotlistCsv(shotlist);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /canción número veintidós/u);
  assert.ok(csv.endsWith("\r\n"));
});

test("summary reports partial duration honestly", () => {
  const shotlist = fixtureShotlist();
  const summary = writerShotlistSummary(shotlist.groups);
  assert.deepEqual(summary, { totalShots: 2, plannedGroups: 1, totalGroups: 1, durationSeconds: 6, missingDurations: 1 });
});

test("150 scenes and 3,000 shots derive summary and CSV within a bounded local budget", () => {
  const template = fixtureShotlist().groups[0]!.shots[0]!;
  const groups = Array.from({ length: 150 }, (_, groupIndex) => ({
    ...fixtureShotlist().groups[0]!, id: crypto.randomUUID(), position: groupIndex, title: `ESCENA ${groupIndex + 1}`,
    shots: Array.from({ length: 20 }, (_, shotIndex) => ({ ...template, id: crypto.randomUUID(), groupId: `g-${groupIndex}`, position: shotIndex, subject: `Acción ${groupIndex + 1}.${shotIndex + 1}` })),
  }));
  const started = performance.now();
  const summary = writerShotlistSummary(groups);
  const csv = writerShotlistCsv({ ...fixtureShotlist(), groups });
  const elapsed = performance.now() - started;
  assert.equal(summary.totalShots, 3_000);
  assert.ok(csv.length > 300_000);
  assert.ok(elapsed < 1_500, `derivation took ${elapsed.toFixed(1)} ms`);
});

function fixtureShotlist(): WriterShotlist {
  return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", projectId: null, scriptId: null, title: "LA FRECUENCIA", sourceRevision: null, revision: 1, groups: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", shotlistId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceSceneId: null, sourceSceneTitle: null, title: "INT. RADIO K-17 — NOCHE", position: 0, sourceStatus: "manual", revision: 1, shots: [0, 1].map((position) => ({ id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${position}`, shotlistId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", groupId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sourceBlockId: null, origin: "manual", shotType: "Plano medio", composition: null, subject: "Mara escucha", angle: "A nivel", movement: "Fijo", support: null, lens: "50 mm", setup: "A", durationSeconds: position === 0 ? 6 : null, status: position === 0 ? "ready" : "pending", description: null, intention: null, notes: null, assetId: null, position, sourceRevision: null, revision: 1 })) }] };
}
