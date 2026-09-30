import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createBlock, type WriterSnapshot } from "../../lib/writer/document.ts";
import {
  WRITER_PDF_LINE_HEIGHT,
  captureWriterPdfSnapshot,
  defaultWriterPdfOptions,
  layoutWriterPdf,
  splitWriterPdfTextByFont,
  validateWriterPdfInput,
} from "../../lib/writer/pdf.ts";

function snapshotWith(...blocks: ReturnType<typeof createBlock>[]): WriterSnapshot {
  return {
    title: "Prueba ñáéíóúü ¿Qué? ¡Sí!",
    schemaVersion: 1,
    document: { type: "doc", content: blocks },
  };
}

test("captures an independent export snapshot without mutating ids or source text", () => {
  const source = snapshotWith(createBlock("action", "Original"));
  const captured = captureWriterPdfSnapshot(source, "Título de exportación");
  const capturedText = captured.document.content[0].content![0];
  const sourceText = source.document.content[0].content![0];
  assert.equal(capturedText.type, "text");
  assert.equal(sourceText.type, "text");
  if (capturedText.type === "text") capturedText.text = "Copia";
  if (sourceText.type === "text") assert.equal(sourceText.text, "Original");
  assert.equal(captured.document.content[0].attrs.id, source.document.content[0].attrs.id);
  assert.equal(captured.title, "Título de exportación");
});

test("rejects empty and notes-only PDFs while leaving notes available to JSON", () => {
  const empty = snapshotWith(createBlock("action"));
  assert.throws(() => validateWriterPdfInput(empty, defaultWriterPdfOptions(empty.title)), /no contiene texto exportable/i);
  const notesOnly = snapshotWith(createBlock("authorNote", "Privado"));
  assert.throws(() => validateWriterPdfInput(notesOnly, defaultWriterPdfOptions(notesOnly.title)), /sólo contiene notas/i);
});

test("accepts the agreed screenplay glyph battery and assigns only U+22EE to fallback", () => {
  const text = "⋮ → … • — – “ ” ‘ ’ á é í ó ú ü ñ Ñ ¿ ¡ © ® °";
  const source = snapshotWith(createBlock("action", text));
  assert.doesNotThrow(() => validateWriterPdfInput(source, defaultWriterPdfOptions(source.title)));
  assert.deepEqual(splitWriterPdfTextByFont("Antes ⋮ después"), [
    { text: "Antes ", font: "primary" },
    { text: "⋮", font: "fallback" },
    { text: " después", font: "primary" },
  ]);
  assert.equal(source.document.content[0].content?.[0]?.type, "text");
  if (source.document.content[0].content?.[0]?.type === "text") {
    assert.equal(source.document.content[0].content[0].text, text);
  }
});

test("rejects characters that the screenplay font still cannot represent", () => {
  const source = snapshotWith(createBlock("action", "No permitidos 🎬 😀"));
  assert.throws(() => validateWriterPdfInput(source, defaultWriterPdfOptions(source.title)), /U\+1F3AC/);
  assert.throws(() => validateWriterPdfInput(source, defaultWriterPdfOptions(source.title)), /U\+1F600/);
  assert.throws(() => validateWriterPdfInput(source, defaultWriterPdfOptions(source.title)), /bloque [0-9a-f-]+/i);
  assert.throws(() => validateWriterPdfInput(source, defaultWriterPdfOptions(source.title)), /no pueden representarse de forma segura/i);
});

test("keeps combining accents with the primary run and fallback inside bold italic source", () => {
  const block = createBlock("action");
  block.content = [{ type: "text", text: "a\u0301 ⋮", marks: [{ type: "bold" }, { type: "italic" }] }];
  const source = snapshotWith(block);
  const layout = layoutWriterPdf(source, { ...defaultWriterPdfOptions(source.title), includeCover: false });
  assert.deepEqual(layout.pages[0].items[0].runs, [
    { text: "a\u0301 ", font: "primary", bold: true, italic: true, underline: false },
    { text: "⋮", font: "fallback", bold: true, italic: true, underline: false },
  ]);
});

test("keeps source order, excludes notes and marks only generated dialogue continuations", () => {
  const longDialogue = Array.from({ length: 420 }, (_, index) => `palabra${index}`).join(" ");
  const scene = createBlock("sceneHeading", "INT. CAFÉ & BAR — DÍA");
  const character = createBlock("character", "ANA");
  const parenthetical = createBlock("parenthetical", "(con calma)");
  const dialogue = createBlock("dialogue", longDialogue);
  const note = createBlock("authorNote", "Nota privada <no exportar>");
  const action = createBlock("action", "FIN");
  const source = snapshotWith(scene, character, parenthetical, dialogue, note, action);
  const layout = layoutWriterPdf(source, { ...defaultWriterPdfOptions(source.title), includeCover: false });
  assert.ok(layout.pages.length >= 2);
  assert.deepEqual(layout.sourceBlockIds, [scene.attrs.id, character.attrs.id, parenthetical.attrs.id, dialogue.attrs.id, action.attrs.id]);
  assert.equal(layout.excludedAuthorNotes, 1);
  assert.ok(layout.generatedMarkers >= 2);
  assert.equal(layout.pages[0].number, 1);
  assert.equal(layout.pages[1].number, 2);
  assert.ok(layout.pages.every((page) => page.items.every((item) => item.y >= layout.paper.marginTop && item.y + WRITER_PDF_LINE_HEIGHT <= layout.paper.height - layout.paper.marginBottom + 0.01)));
});

test("moves a scene heading away from the final two lines of a page", () => {
  const action = createBlock("action", Array.from({ length: 315 }, () => "texto").join(" "));
  const heading = createBlock("sceneHeading", "EXT. CALLE — NOCHE");
  const following = createBlock("action", "La calle permanece vacía.");
  const source = snapshotWith(action, heading, following);
  const layout = layoutWriterPdf(source, { ...defaultWriterPdfOptions(source.title), includeCover: false });
  const headingItem = layout.pages.flatMap((page) => page.items.map((item) => ({ page: page.number, item })))
    .find(({ item }) => item.sourceBlockId === heading.attrs.id);
  const followingItem = layout.pages.flatMap((page) => page.items.map((item) => ({ page: page.number, item })))
    .find(({ item }) => item.sourceBlockId === following.attrs.id);
  assert.ok(headingItem && followingItem);
  assert.equal(headingItem.page, followingItem.page);
});

test("screenplay spacing groups dialogue without adding source blocks or changing content", () => {
  const blocks = [
    createBlock("sceneHeading", "INT. SALA — DÍA"),
    createBlock("action", "ANA entra."),
    createBlock("character", "ANA"),
    createBlock("dialogue", "Hola."),
    createBlock("character", "BRUNO"),
    createBlock("parenthetical", "(bajo)"),
    createBlock("dialogue", "Te esperaba."),
    createBlock("action", "Ambos se miran."),
    createBlock("transition", "CORTE A:"),
  ];
  const source = snapshotWith(...blocks);
  const before = JSON.stringify(source.document);
  const layout = layoutWriterPdf(source, { ...defaultWriterPdfOptions(source.title), includeCover: false });
  const items = layout.pages.flatMap((page) => page.items);
  const firstById = new Map(items.filter((item) => item.sourceBlockId).map((item) => [item.sourceBlockId!, item]));

  assert.equal(JSON.stringify(source.document), before);
  assert.deepEqual(layout.sourceBlockIds, blocks.map((block) => block.attrs.id));
  assert.equal(layout.pages.length, 1);
  assert.ok(firstById.get(blocks[2].attrs.id)!.y - firstById.get(blocks[1].attrs.id)!.y >= WRITER_PDF_LINE_HEIGHT * 2);
  assert.ok(Math.abs(firstById.get(blocks[3].attrs.id)!.y - firstById.get(blocks[2].attrs.id)!.y - WRITER_PDF_LINE_HEIGHT) < 0.001);
  assert.ok(firstById.get(blocks[4].attrs.id)!.y - firstById.get(blocks[3].attrs.id)!.y >= WRITER_PDF_LINE_HEIGHT * 2);
  assert.ok(Math.abs(firstById.get(blocks[6].attrs.id)!.y - firstById.get(blocks[5].attrs.id)!.y - WRITER_PDF_LINE_HEIGHT) < 0.001);
});

test("keeps a character cue with dialogue when the previous action nearly fills a page", () => {
  const action = createBlock("action", Array.from({ length: 300 }, (_, index) => `acción${index}`).join(" "));
  const character = createBlock("character", "ANA");
  const dialogue = createBlock("dialogue", "Una respuesta breve que debe acompañar al personaje.");
  const source = snapshotWith(action, character, dialogue);
  const layout = layoutWriterPdf(source, { ...defaultWriterPdfOptions(source.title), includeCover: false });
  const located = layout.pages.flatMap((page) => page.items.map((item) => ({ page: page.number, item })));
  const characterItem = located.find(({ item }) => item.sourceBlockId === character.attrs.id);
  const dialogueItem = located.find(({ item }) => item.sourceBlockId === dialogue.attrs.id);
  assert.ok(characterItem && dialogueItem);
  assert.equal(characterItem.page, dialogueItem.page);
});

test("renders every calculated PDF line in its own minimum-height flow box", async () => {
  const source = await readFile("lib/writer/pdf-renderer.ts", "utf8");
  assert.match(source, /lineBox:\s*\{[\s\S]*?minHeight:\s*WRITER_PDF_LINE_HEIGHT/u);
  assert.match(source, /React\.createElement\(\s*View,[\s\S]*?styles\.lineBox/u);
});
