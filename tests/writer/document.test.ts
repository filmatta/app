import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlock,
  createEmptyWriterDocument,
  deriveCharacters,
  deriveScenes,
  rekeyWriterDocument,
  validateWriterDocument,
  type WriterDocument,
} from "../../lib/writer/document.ts";
import { createBasicFdx, createWriterBackup } from "../../lib/writer/export.ts";

test("validates the canonical empty document and rejects duplicate block ids", () => {
  const document = createEmptyWriterDocument();
  assert.equal(validateWriterDocument(document).ok, true);
  document.content[1].attrs.id = document.content[0].attrs.id;
  const invalid = validateWriterDocument(document);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.match(invalid.reason, /identificadores/i);
});

test("derives scenes and conservative character names from current content", () => {
  const document: WriterDocument = {
    type: "doc",
    content: [
      createBlock("action", "Texto antes de la escena"),
      createBlock("sceneHeading", "INT. CASA — DÍA"),
      createBlock("character", "Ana"),
      createBlock("dialogue", "Hola"),
      createBlock("character", "ANA"),
      createBlock("character", "ANA (V.O.)"),
      createBlock("sceneHeading", "EXT. CALLE — NOCHE"),
    ],
  };
  assert.deepEqual(deriveScenes(document).map(({ order, title }) => ({ order, title })), [
    { order: 1, title: "INT. CASA — DÍA" },
    { order: 2, title: "EXT. CALLE — NOCHE" },
  ]);
  assert.deepEqual(deriveCharacters(document).map(({ name, occurrences }) => ({ name, occurrences })), [
    { name: "Ana", occurrences: 2 },
    { name: "ANA (V.O.)", occurrences: 1 },
  ]);
});

test("rekeys every block when a full script is duplicated", () => {
  const original = createEmptyWriterDocument();
  const copy = rekeyWriterDocument(original);
  assert.deepEqual(copy.content.map((block) => block.attrs.kind), original.content.map((block) => block.attrs.kind));
  assert.notDeepEqual(copy.content.map((block) => block.attrs.id), original.content.map((block) => block.attrs.id));
});

test("JSON round-trip keeps ids and FDX escapes text while excluding author notes", () => {
  const scene = createBlock("sceneHeading", "INT. CAFÉ & BAR — DÍA");
  const note = createBlock("authorNote", "Nota privada <no exportar>");
  const snapshot = {
    title: "Guion ágil",
    schemaVersion: 1,
    document: { type: "doc" as const, content: [scene, note] },
  };
  const backup = JSON.parse(createWriterBackup(snapshot));
  assert.equal(backup.document.content[0].attrs.id, scene.attrs.id);
  assert.equal(backup.document.content[1].content[0].text, "Nota privada <no exportar>");
  const fdx = createBasicFdx(snapshot);
  assert.match(fdx, /<FinalDraft/);
  assert.match(fdx, /CAFÉ &amp; BAR/);
  assert.doesNotMatch(fdx, /Nota privada/);
});
