import assert from "node:assert/strict";
import test from "node:test";
import { createBlock, type WriterSnapshot } from "../../lib/writer/document.ts";
import {
  WRITER_PDF_LINE_HEIGHT,
  captureWriterPdfSnapshot,
  defaultWriterPdfOptions,
  layoutWriterPdf,
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

test("rejects unsupported screenplay-font characters before rendering", () => {
  const source = snapshotWith(createBlock("action", "Emoji no permitido 🎬"));
  assert.throws(() => validateWriterPdfInput(source, defaultWriterPdfOptions(source.title)), /U\+1F3AC/);
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
