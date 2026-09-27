import assert from "node:assert/strict";
import test from "node:test";
import {
  WRITER_IMPORT_MAX_FILE_BYTES,
  analyzePastedWriterText,
  analyzeWriterFdx,
  analyzeWriterTxt,
  changeWriterImportKind,
  validateWriterImportFile,
  writerImportPreservesSignificantText,
  writerImportSummary,
  writerImportToDocument,
} from "../../lib/writer/import.ts";
import { blockText, validateWriterDocument } from "../../lib/writer/document.ts";

const PLAIN_TEXT = `INT. CASA - DÍA

Carolina empuja la puerta cerrada.

CAROLINA
(en voz baja)
No podemos esperar más.

CORTE A:

MISTERIO`;

test("plain text classification is deterministic, contextual, and preserves source text", () => {
  const staging = analyzePastedWriterText(PLAIN_TEXT, "Prueba");
  assert.equal(staging.source.extractedText, PLAIN_TEXT);
  assert.deepEqual(staging.blocks.map((block) => block.proposedKind), [
    "sceneHeading",
    "action",
    "character",
    "parenthetical",
    "dialogue",
    "transition",
    null,
  ]);
  assert.equal(staging.blocks.at(-1)?.confidence, "review");
  assert.equal(writerImportPreservesSignificantText(staging), true);
  assert.equal(staging.blocks.map((block) => block.originalText).join("\n"), PLAIN_TEXT.split("\n").filter((line) => line.trim()).join("\n"));
});

test("ambiguous text requires an explicit decision before canonical conversion", () => {
  const staging = analyzeWriterTxt(PLAIN_TEXT, "borrador.txt");
  assert.throws(() => writerImportToDocument(staging.blocks), /1 elementos por revisar/u);
  let reviewed = staging.blocks;
  for (const block of staging.blocks.filter((candidate) => candidate.confidence !== "high" || !candidate.proposedKind)) {
    reviewed = changeWriterImportKind(reviewed, new Set([block.id]), block.proposedKind ?? "action");
  }
  const document = writerImportToDocument(reviewed);
  const validated = validateWriterDocument(document);
  assert.equal(validated.ok, true);
  assert.equal(document.content.length, staging.blocks.length);
  assert.equal(new Set(document.content.map((block) => block.attrs.id)).size, document.content.length);
  assert.equal(blockText(document.content.at(-1)!), "MISTERIO");
  assert.equal(writerImportSummary(reviewed).unresolved, 0);
  assert.equal(writerImportSummary(reviewed).needsReview, 0);
});

test("FDX uses explicit types, preserves Spanish text, and stages unsupported elements", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
  <Content>
    <Paragraph Type="Scene Heading"><Text>INT. CAFÉ - DÍA</Text></Paragraph>
    <Paragraph Type="Action"><Text>La niña dice: &quot;acción&quot;.</Text></Paragraph>
    <Paragraph Type="Character"><Text>ÁNGELA</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>¿Qué ocurrió?</Text></Paragraph>
    <Paragraph Type="General"><Text>Elemento sin equivalencia</Text></Paragraph>
  </Content>
</FinalDraft>`;
  const staging = analyzeWriterFdx(xml, "acentos.fdx");
  assert.deepEqual(staging.blocks.map((block) => block.proposedKind), ["sceneHeading", "action", "character", "dialogue", null]);
  assert.equal(staging.blocks[1].originalText, `La niña dice: "acción".`);
  assert.equal(staging.blocks[2].originalText, "ÁNGELA");
  assert.match(staging.blocks[4].signals[0], /General/u);
  assert.equal(writerImportPreservesSignificantText(staging), true);
});

test("file preflight rejects false extensions, excessive size, binary TXT, and unsafe FDX", () => {
  assert.throws(() => validateWriterImportFile({ name: "falso.txt", size: 12, type: "application/pdf" }), /tipo real/u);
  assert.throws(() => validateWriterImportFile({ name: "grande.txt", size: WRITER_IMPORT_MAX_FILE_BYTES + 1, type: "text/plain" }), /5 MB/u);
  assert.throws(() => validateWriterImportFile({ name: "borrador.pdf", size: 12, type: "application/pdf" }), /todavía no/u);
  assert.throws(() => analyzeWriterTxt("texto\u0000binario", "falso.txt"), /texto legible/u);
  assert.throws(() => analyzeWriterFdx("<!DOCTYPE x><FinalDraft></FinalDraft>", "inseguro.fdx"), /no permitidas/u);
  assert.throws(() => analyzeWriterFdx("<FinalDraft><Content>", "roto.fdx"), /dañado/u);
});
