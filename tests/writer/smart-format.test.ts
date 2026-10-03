import assert from "node:assert/strict";
import test from "node:test";
import { blockText, createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import { analyzePastedWriterText } from "../../lib/writer/import.ts";
import {
  WRITER_SIGNIFICANT_PASTE_MIN_CHARACTERS,
  assessWriterPaste,
  canUseStructuredFeature,
  createWriterAutoFormatPlan,
  getWriterDocumentReadiness,
  mergeWriterAutoFormatClassifications,
  resolveWriterAutoFormatChanges,
  validateWriterAutoFormatClassifications,
  writerAutoFormatCandidates,
} from "../../lib/writer/smart-format.ts";
import {
  SMART_FORMAT_FIXTURES,
  SMART_FORMAT_MIXED_DOCUMENT,
  SMART_FORMAT_PARTIAL_DOCUMENT,
} from "./fixtures/smart-format.ts";

const UNFORMATTED = `INT. CASA - DÍA

Una caja descansa sobre la mesa.

ALMA
No deberíamos abrirla.

CORTE A:

EXT. PATIO - NOCHE

Alma sale con la caja.`;

function documentFromLines(text: string): WriterDocument {
  return { type: "doc", content: text.split("\n").map((line) => createBlock("action", line)) };
}

test("significant paste uses a central screenplay-like threshold", () => {
  const assessment = assessWriterPaste(UNFORMATTED);
  assert.equal(assessment.qualifies, true);
  assert.ok(assessment.characters >= WRITER_SIGNIFICANT_PASTE_MIN_CHARACTERS);
  assert.ok(assessment.signals.includes("sceneHeading"));
  assert.equal(assessWriterPaste("Una frase breve.").qualifies, false);
  assert.equal(assessWriterPaste("https://filmatta.com").qualifies, false);
});

test("format fixtures cover prose, one-line paste, parentheticals, transitions, and uppercase action", () => {
  assert.equal(assessWriterPaste(SMART_FORMAT_FIXTURES.narrative).qualifies, false);
  assert.equal(assessWriterPaste(SMART_FORMAT_FIXTURES.singleLine).qualifies, false);
  assert.ok(assessWriterPaste(SMART_FORMAT_FIXTURES.parentheticals).signals.includes("parenthetical"));
  assert.ok(assessWriterPaste(SMART_FORMAT_FIXTURES.transitions).signals.includes("transition"));
  const uppercase = createWriterAutoFormatPlan(documentFromLines(SMART_FORMAT_FIXTURES.uppercaseAction), { scope: "document" });
  assert.equal(uppercase.changes.some((change) => change.proposedKind === "character"), false);
});

test("dates and times are deterministically Action and never reach character review or AI", () => {
  const source = `17 DE NOVIEMBRE DE 2004\n\n3:45 AM\n\nMARA\n\nNo mires.`;
  const document = documentFromLines(source);
  const plan = createWriterAutoFormatPlan(document, { scope: "document" });
  const byText = new Map(plan.changes.map((change) => [change.text, change]));
  const stagingByText = new Map(analyzePastedWriterText(source, "Fechas").blocks.map((block) => [block.originalText, block]));
  assert.equal(stagingByText.get("17 DE NOVIEMBRE DE 2004")?.proposedKind, "action");
  assert.equal(stagingByText.get("17 DE NOVIEMBRE DE 2004")?.confidence, "high");
  assert.equal(stagingByText.get("3:45 AM")?.proposedKind, "action");
  assert.equal(byText.has("17 DE NOVIEMBRE DE 2004"), false);
  assert.equal(byText.has("3:45 AM"), false);
  assert.equal(writerAutoFormatCandidates(document, plan).some((candidate) => /NOVIEMBRE|3:45/u.test(candidate.text)), false);
  assert.equal(byText.get("MARA")?.proposedKind, "character");
});

test("readiness distinguishes EMPTY, UNFORMATTED, PARTIAL, and READY", () => {
  assert.equal(getWriterDocumentReadiness({ type: "doc", content: [createBlock("action")] }).state, "EMPTY");
  assert.equal(getWriterDocumentReadiness(documentFromLines(UNFORMATTED)).state, "UNFORMATTED");
  const partial: WriterDocument = { type: "doc", content: [
    createBlock("sceneHeading", "INT. CASA - DÍA"),
    createBlock("action", "Una caja espera."),
    createBlock("action", "EXT. PATIO - NOCHE"),
  ] };
  assert.equal(getWriterDocumentReadiness(partial).state, "PARTIALLY_FORMATTED");
  const ready: WriterDocument = { type: "doc", content: [
    createBlock("sceneHeading", "INT. CASA - DÍA"),
    createBlock("action", "Una caja espera."),
  ] };
  assert.equal(getWriterDocumentReadiness(ready).state, "READY");
});

test("feature readiness depends on the real structural requirement", () => {
  const scenesOnly = getWriterDocumentReadiness({ type: "doc", content: [
    createBlock("sceneHeading", "INT. CASA - DÍA"),
    createBlock("action", "Una caja espera."),
    createBlock("sceneHeading", "EXT. PATIO - NOCHE"),
    createBlock("action", "La puerta se abre."),
    createBlock("sceneHeading", "INT. SÓTANO - NOCHE"),
    createBlock("action", "Alma escucha un golpe."),
    createBlock("sceneHeading", "EXT. CALLE - AMANECER"),
    createBlock("action", "La caja queda atrás."),
  ] });
  assert.equal(canUseStructuredFeature(scenesOnly, "timeline").available, true);
  assert.equal(canUseStructuredFeature(scenesOnly, "pulse").available, true);
  assert.equal(canUseStructuredFeature(scenesOnly, "ooc").available, false);
});

test("auto-format reuses import detection, preserves text, and applies only one explicit plan", () => {
  const document = documentFromLines(UNFORMATTED);
  const before = document.content.map(blockText);
  const ids = document.content.map((block) => block.attrs.id);
  const plan = createWriterAutoFormatPlan(document, { scope: "paste", blockIds: ids });
  assert.equal(plan.summary.byKind.sceneHeading, 2);
  assert.ok(plan.changes.some((change) => change.proposedKind === "sceneHeading"));
  const changes = resolveWriterAutoFormatChanges(plan, {}, false);
  const kinds = new Map(changes.map((change) => [change.blockId, change.kind]));
  const after: WriterDocument = { type: "doc", content: document.content.map((block) => ({
    ...block,
    attrs: { ...block.attrs, kind: kinds.get(block.attrs.id) ?? block.attrs.kind },
  })) };
  assert.deepEqual(after.content.map(blockText), before);
  assert.deepEqual(after.content.map((block) => block.attrs.id), ids);
  assert.equal(getWriterDocumentReadiness(after).sceneCount, 2);
});

test("LA CAJA detects scenes, characters and blank-separated dialogue without rewriting", () => {
  const source = SMART_FORMAT_FIXTURES.laCaja;
  const document = documentFromLines(source);
  const before = document.content.map(blockText);
  const plan = createWriterAutoFormatPlan(document, { scope: "document" });
  const resolved = resolveWriterAutoFormatChanges(plan, {}, false);
  const kinds = new Map(resolved.map((change) => [change.blockId, change.kind]));
  const after: WriterDocument = { type: "doc", content: document.content.map((block) => ({
    ...block,
    attrs: { ...block.attrs, kind: kinds.get(block.attrs.id) ?? block.attrs.kind },
  })) };
  const readiness = getWriterDocumentReadiness(after);
  const characters = after.content
    .filter((block) => block.attrs.kind === "character")
    .map((block) => blockText(block));

  assert.equal(readiness.sceneCount, 12);
  assert.ok(readiness.characterCount > 0);
  assert.ok(readiness.dialogueCount > 0);
  assert.ok(after.content.some((block) => block.attrs.kind === "action" && blockText(block) === "Silencio."));
  assert.ok(characters.includes("LUCÍA"));
  assert.ok(characters.includes("PADRE (TELÉFONO)"));
  assert.ok(characters.includes("HOMBRE"));
  assert.deepEqual(after.content.map(blockText), before);
  assert.equal(canUseStructuredFeature(readiness, "ooc").available, true);
});

test("hybrid formatting exposes only ambiguous blocks and accepts closed structured classifications", () => {
  const document = documentFromLines(`INT. CASA - NOCHE

Una lámpara tiembla.

Silencio.`);
  const plan = createWriterAutoFormatPlan(document, { scope: "document" });
  const candidates = writerAutoFormatCandidates(document, plan);
  assert.equal(candidates.length, 2);
  const silence = candidates.find((candidate) => candidate.text === "Silencio.");
  assert.equal(silence?.sceneHeading, "INT. CASA - NOCHE");
  const classifications = validateWriterAutoFormatClassifications(candidates, {
    classifications: candidates.map((candidate) => ({ blockId: candidate.blockId, kind: "action", characterName: null })),
  });
  const merged = mergeWriterAutoFormatClassifications(plan, classifications);
  assert.equal(merged.changes.find((change) => change.text === "Silencio.")?.confidence, "high");
  assert.equal(merged.changes.find((change) => change.text === "Silencio.")?.proposedKind, "action");
  assert.throws(() => validateWriterAutoFormatClassifications(candidates, {
    classifications: [{ blockId: "unknown", kind: "dialogue", characterName: "LUCÍA", rewrittenText: "Hola" }],
  }), /inválido/u);
});

test("ready documents are idempotent and mixed documents preserve existing IDs", () => {
  const existingScene = createBlock("sceneHeading", "INT. CASA - DÍA");
  const existingAction = createBlock("action", "Una caja espera.");
  const ready: WriterDocument = { type: "doc", content: [existingScene, existingAction] };
  assert.equal(createWriterAutoFormatPlan(ready, { scope: "document" }).alreadyFormatted, true);

  const newHeading = createBlock("action", "EXT. PATIO - NOCHE");
  const mixed: WriterDocument = { type: "doc", content: [existingScene, existingAction, newHeading] };
  const plan = createWriterAutoFormatPlan(mixed, { scope: "partial", blockIds: [newHeading.attrs.id] });
  assert.deepEqual(plan.blockIds, [newHeading.attrs.id]);
  assert.equal(existingScene.attrs.id, ready.content[0].attrs.id);
  assert.equal(plan.changes[0]?.proposedKind, "sceneHeading");

  const mixedExistingIds = SMART_FORMAT_MIXED_DOCUMENT.content.slice(0, 2).map((block) => block.attrs.id);
  const mixedPlan = createWriterAutoFormatPlan(SMART_FORMAT_MIXED_DOCUMENT, {
    scope: "partial",
    blockIds: SMART_FORMAT_MIXED_DOCUMENT.content.slice(2).map((block) => block.attrs.id),
  });
  assert.deepEqual(SMART_FORMAT_MIXED_DOCUMENT.content.slice(0, 2).map((block) => block.attrs.id), mixedExistingIds);
  assert.equal(mixedPlan.changes[0]?.proposedKind, "sceneHeading");
  assert.equal(getWriterDocumentReadiness(SMART_FORMAT_PARTIAL_DOCUMENT).state, "PARTIALLY_FORMATTED");
});
