import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import { detectWriterBreakdownV3 } from "../../lib/writer/breakdown-detector-v3.ts";
import { breakdownLexiconStats, matchBreakdownLexicon, normalizeBreakdownLookup } from "../../lib/writer/breakdown-lexicon.ts";
import { normalizeManualTagSelection } from "../../lib/writer/breakdown-tagging.ts";
import { currentBreakdownEvidenceKey, staleAutomaticAppearanceIds } from "../../lib/writer/breakdown-reconcile.ts";

const known = [
  "pistola", "cajón", "llave", "teléfono", "computadora", "radio", "grabadora", "cámara", "linterna", "lámpara",
  "reloj", "carpeta", "recibo", "factura", "carta", "maletín", "botella", "cuchillo", "martillo", "jeringa",
  "guitarra", "sombrero", "chaqueta", "automóvil", "bicicleta",
];
const unknown = [
  "prisma de obsidiana", "sensor cuántico", "mapa holográfico", "relicario ovalado", "medallón cerámico",
  "cubo magnético", "amuleto tallado", "cilindro verde", "filtro espectral", "brújula lunar",
  "dispositivo extraño", "tubo translúcido", "máscara fracturada", "placa triangular", "cápsula azul",
  "panel biométrico", "esfera rugosa", "caja hexagonal", "lente opaco", "módulo portátil",
];
const negatives = [
  "Ambos se asustan.", "No pasa nada.", "No sabe si es real.", "La tensión aumenta.", "Nadie responde.",
  "Su relación era una bomba de tiempo.", "La noticia fue un disparo al corazón.",
];

function script(actions: string[]): WriterDocument {
  return { type: "doc", content: actions.flatMap((text, index) => [
    createBlock("sceneHeading", `INT. CONTROL ${index + 1} - DÍA`), createBlock("action", text),
  ]) };
}

test("lexicon has versioned Spanish entries, aliases, boundaries, plurals and longest match", () => {
  const stats = breakdownLexiconStats();
  assert.equal(stats.locale, "es");
  assert.ok(stats.canonicals >= 50);
  assert.equal(stats.conflicts, 0);
  assert.ok(stats.aliases >= 100);
  assert.equal(normalizeBreakdownLookup("  REVÓLVER.  "), "revolver");
  assert.equal(matchBreakdownLexicon("alarma").length, 0);
  assert.equal(matchBreakdownLexicon("gafas de sol")[0]?.canonical, "gafas de sol");
  assert.equal(matchBreakdownLexicon("dos pistolas")[0]?.canonical, "pistola");
  assert.equal(matchBreakdownLexicon("un coche")[0]?.canonical, "automóvil");
  assert.equal(matchBreakdownLexicon("dos tarjetas de acceso")[0]?.canonical, "tarjeta de acceso");
});

test("V3 recalls known and unknown physical noun phrases without a whitelist", () => {
  const actions = [...known, ...unknown].map((name) => `Mara encuentra un ${name}.`);
  const detected = detectWriterBreakdownV3(script(actions));
  const names = new Set(detected.filter((item) => item.category !== "location").map((item) => item.name));
  assert.deepEqual(known.filter((name) => !names.has(name)), []);
  assert.deepEqual(unknown.filter((name) => !names.has(name)), []);
  assert.equal(detected.filter((item) => item.category !== "location").length, actions.length);
});

test("V3 rejects clauses and metaphors but retains physical bombs and atomic props", () => {
  const actions = [...negatives, "Mara abre el cajón y encuentra una pistola.", "Mara coloca una bomba debajo del auto."];
  const doc = script(actions);
  const candidates = detectWriterBreakdownV3(doc).filter((item) => item.category !== "location");
  const negativeIds = new Set(doc.content.slice(0, negatives.length * 2).map((item) => item.attrs.id));
  assert.deepEqual(candidates.filter((item) => negativeIds.has(item.blockId)).map((item) => item.name), []);
  assert.ok(candidates.some((item) => item.name === "cajón"));
  assert.ok(candidates.some((item) => item.name === "pistola"));
  assert.ok(candidates.some((item) => item.name === "bomba"));
  assert.ok(candidates.every((item) => !/\b(?:abre|encuentra|coloca|debajo|asustan|pasa)\b/iu.test(item.name)));
});

test("V3 keeps physical modifiers in atomic names and lexicon category hints", () => {
  const detected = detectWriterBreakdownV3(script([
    "Mara encuentra una grabadora roja.",
    "Mara toma un abrigo amarillo.",
    "Mara abre el cajón y encuentra una pistola.",
  ])).filter((item) => item.category !== "location");
  assert.ok(detected.some((item) => item.name === "grabadora roja" && item.category === "prop"));
  assert.ok(detected.some((item) => item.name === "abrigo amarillo" && item.category === "wardrobe"));
  assert.ok(detected.every((item) => !item.name.includes("encuentra")));
});

test("manual tag selection trims only outer whitespace and preserves the screenplay", () => {
  const text = "Sobre la repisa descansa un prisma de obsidiana.";
  const from = text.indexOf(" prisma");
  const to = text.indexOf(".");
  assert.deepEqual(normalizeManualTagSelection(text, from, to), {
    name: "prisma de obsidiana", fromOffset: from + 1, toOffset: to,
  });
  assert.equal(normalizeManualTagSelection(text, 0, text.length), null);
  assert.equal(text, "Sobre la repisa descansa un prisma de obsidiana.");
});

test("same-revision reconciliation retires obsolete automatic evidence but preserves manual and scoped evidence", () => {
  const fingerprint = "prop:obsolete:scene:block:used";
  const old = (id: string, sourceHash: string, sceneId = "scene-a") => ({ id, element_id: "element", scene_id: sceneId, block_id: "block", from_offset: 5, nature: "used", source_hash: sourceHash });
  const rows = [old("obsolete", "a".repeat(64)), old("manual", "0".repeat(64)), old("outside", "b".repeat(64), "scene-b")];
  const ids = staleAutomaticAppearanceIds(rows, new Map([["element", fingerprint]]), new Set(), new Set(["scene-a"]));
  assert.deepEqual(ids, ["obsolete"]);
  assert.deepEqual(staleAutomaticAppearanceIds([old("current", "a".repeat(64))], new Map([["element", fingerprint]]), new Set([currentBreakdownEvidenceKey(fingerprint, "block", 5, "used")])), []);
});
