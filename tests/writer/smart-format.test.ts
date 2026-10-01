import assert from "node:assert/strict";
import test from "node:test";
import { blockText, createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import {
  WRITER_SIGNIFICANT_PASTE_MIN_CHARACTERS,
  assessWriterPaste,
  canUseStructuredFeature,
  createWriterAutoFormatPlan,
  getWriterDocumentReadiness,
  resolveWriterAutoFormatChanges,
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
