import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import {
  WRITER_IMPORT_MAX_FILE_BYTES,
  analyzePastedWriterText,
  analyzeWriterFdx,
  analyzeWriterDocxParagraphs,
  analyzeWriterRawFdx,
  analyzeWriterRawText,
  analyzeWriterTxt,
  changeWriterImportKind,
  validateWriterImportFile,
  writerImportPreservesSignificantText,
  writerImportReviewGroups,
  writerImportSummary,
  writerImportToDocument,
} from "../../lib/writer/import.ts";
import type { WriterDocxParagraph } from "../../lib/writer/docx-import.ts";
import { blockText, validateWriterDocument } from "../../lib/writer/document.ts";
import { buildAssistedImportBatches } from "../../lib/writer/assisted-import.ts";

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
  const summary = writerImportSummary(staging.blocks);
  assert.equal(summary.byKind.character, 1);
  assert.equal(summary.distinctCharacterNames, 1);
  assert.equal(summary.possibleActionCharacters, 0);
});

test("explicit standalone author notes are protected without stealing quoted dialogue", () => {
  const source = `INT. SET - DÍA

[[NOTA DEL AUTOR: conservar → y ⋮.]]

ANA
[[NOTA DEL AUTOR: esto se dice en diálogo]]

[Una indicación cualquiera]`;
  const staging = analyzePastedWriterText(source, "Notas");
  assert.deepEqual(staging.blocks.map((block) => block.proposedKind), [
    "sceneHeading",
    "authorNote",
    "character",
    "dialogue",
    "action",
  ]);
  assert.equal(staging.blocks[1].confidence, "high");
  assert.equal(staging.blocks[1].originalText, "[[NOTA DEL AUTOR: conservar → y ⋮.]]");
  assert.equal(writerImportPreservesSignificantText(staging), true);
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

test("COPIA ÚNICA keeps Word screenplay styles, order, and text without a 510-item review queue", async () => {
  const fixture = path.join(process.cwd(), "tests", "fixtures", "writer", "COPIA_UNICA_guion_demo_FILMATTA.docx");
  const zip = await JSZip.loadAsync(fs.readFileSync(fixture));
  const xml = await zip.file("word/document.xml")!.async("string");
  const paragraphs = fixtureParagraphs(xml);
  const staging = analyzeWriterDocxParagraphs(paragraphs, "COPIA_UNICA_guion_demo_FILMATTA.docx");
  const summary = writerImportSummary(staging.blocks);

  assert.equal(staging.blocks.length, 688);
  assert.equal(summary.byKind.sceneHeading, 13);
  assert.equal(summary.byKind.character, 186);
  assert.equal(summary.distinctCharacterNames, 4);
  assert.equal(summary.byKind.dialogue, 186);
  assert.equal(summary.byKind.transition, 2);
  assert.equal(summary.byKind.action, 301);
  assert.equal(writerImportReviewGroups(staging.blocks).length, 0);
  assert.equal(writerImportPreservesSignificantText(staging), true);
  assert.deepEqual(
    [...new Set(staging.blocks.filter((block) => block.proposedKind === "character").map((block) => block.originalText))].sort(),
    ["LUCÍA", "MARTÍN", "SOFÍA", "VOZ DE HOMBRE (TEL.)"],
  );
  assert.equal(staging.blocks[0].originalText, "COPIA ÚNICA");
  assert.equal(staging.blocks.at(-1)?.originalText, "FIN");
});

test("similar ambiguities become one decision and raw mode imports without a review queue", () => {
  const source = Array.from({ length: 510 }, (_, index) => `Fragmento ${index + 1}.`).join("\n");
  const analyzed = analyzeWriterTxt(source, "fragmentos.txt");
  assert.equal(writerImportSummary(analyzed.blocks).needsReview, 510);
  assert.equal(writerImportReviewGroups(analyzed.blocks).length, 1);

  const raw = analyzeWriterRawText(source, { format: "txt", name: "fragmentos.txt", suggestedTitle: "Fragmentos" });
  assert.equal(writerImportReviewGroups(raw.blocks).length, 0);
  assert.equal(writerImportPreservesSignificantText(raw), true);
  assert.equal(writerImportToDocument(raw.blocks).content.length, 510);
});

test("raw FDX imports visible paragraphs as editable action without IA or decisions", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
  <Content>
    <Paragraph Type="Scene Heading"><Text>INT. TALLER - NOCHE</Text></Paragraph>
    <Paragraph Type="Character"><Text>CAMILA</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>No queda tiempo.</Text></Paragraph>
  </Content>
</FinalDraft>`;
  const raw = analyzeWriterRawFdx(xml, "manual.fdx");
  assert.deepEqual(raw.blocks.map((block) => block.originalText), ["INT. TALLER - NOCHE", "CAMILA", "No queda tiempo."]);
  assert.equal(raw.blocks.every((block) => block.proposedKind === "action" && block.confidence === "high"), true);
  assert.equal(writerImportReviewGroups(raw.blocks).length, 0);
  assert.equal(writerImportPreservesSignificantText(raw), true);
});

test("real fallback fixtures enter IA only when deterministic structure is incomplete", async () => {
  const fixtureDirectory = path.join(process.cwd(), "tests", "fixtures", "writer");
  const poorDocx = path.join(fixtureDirectory, "fallback-poor-structure.docx");
  const poorZip = await JSZip.loadAsync(fs.readFileSync(poorDocx));
  const poorXml = await poorZip.file("word/document.xml")!.async("string");
  const poor = analyzeWriterDocxParagraphs(fixtureParagraphs(poorXml), "fallback-poor-structure.docx");
  assert.equal(writerImportPreservesSignificantText(poor), true);
  assert.ok(writerImportReviewGroups(poor.blocks).length > 0);
  assert.ok(buildAssistedImportBatches(poor).length > 0);

  const plainSource = fs.readFileSync(path.join(fixtureDirectory, "fallback-plain.txt"), "utf8");
  const plain = analyzeWriterTxt(plainSource, "fallback-plain.txt");
  assert.equal(writerImportPreservesSignificantText(plain), true);
  assert.ok(writerImportReviewGroups(plain.blocks).length > 0);
  assert.ok(buildAssistedImportBatches(plain).length > 0);

  const fdxSource = fs.readFileSync(path.join(fixtureDirectory, "valid-structured.fdx"), "utf8");
  const fdx = analyzeWriterFdx(fdxSource, "valid-structured.fdx");
  assert.equal(writerImportPreservesSignificantText(fdx), true);
  assert.equal(writerImportReviewGroups(fdx.blocks).length, 0);
  assert.equal(buildAssistedImportBatches(fdx).length, 0);
  assert.deepEqual(writerImportSummary(fdx.blocks), {
    byKind: { sceneHeading: 2, action: 2, character: 2, dialogue: 2, parenthetical: 0, transition: 0, authorNote: 0 },
    distinctCharacterNames: 2,
    possibleActionCharacters: 0,
    unresolved: 0,
    needsReview: 0,
    total: 8,
  });
});

function fixtureParagraphs(xml: string): WriterDocxParagraph[] {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)].flatMap(([paragraph]) => {
    const style = paragraph.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/u)?.[1] ?? null;
    const text = [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu)]
      .map((match) => decodeFixtureXml(match[1]))
      .join("")
      .trimEnd();
    return text.trim() ? [{ text, style }] : [];
  });
}

function decodeFixtureXml(value: string) {
  return value.replace(/&(?:amp|lt|gt|quot|apos);/gu, (entity) => ({
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'",
  })[entity] ?? entity);
}
