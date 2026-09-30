import assert from "node:assert/strict";
import test from "node:test";
import type { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { history, redo, undo } from "@tiptap/pm/history";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { canonicalWriterDocument, type WriterDocument } from "../../lib/writer/document.ts";
import {
  duplicateWriterScene,
  moveWriterScene,
  renameWriterCharacter,
  renameWriterSceneNickname,
  writerSceneIds,
} from "../../lib/writer/editor-actions.ts";
import {
  parseWriterStructuralMetadata,
  WRITER_STRUCTURAL_METADATA_VERSION,
} from "../../lib/writer/structural-metadata-storage.ts";

function createStructuralEditor(blocks: Array<{ id: string; kind: string; text: string }>) {
  const schema = new Schema({
    nodes: {
      doc: { content: "screenplayBlock+" },
      text: { group: "inline" },
      screenplayBlock: {
        group: "block",
        content: "inline*",
        attrs: {
          id: { default: null },
          kind: { default: "action" },
          sceneNickname: { default: null },
        },
      },
    },
  });
  let state = EditorState.create({
    schema,
    doc: schema.node("doc", null, blocks.map((block) => schema.node(
      "screenplayBlock",
      { id: block.id, kind: block.kind, sceneNickname: null },
      block.text ? schema.text(block.text) : undefined,
    ))),
    plugins: [history()],
  });
  let dispatches = 0;
  const editor = {
    get state() { return state; },
    view: {
      dispatch(transaction: Transaction) { dispatches += 1; state = state.apply(transaction); },
      focus() { return undefined; },
    },
    commands: { focus() { return true; } },
  } as unknown as Editor;
  return {
    editor,
    state: () => state,
    dispatches: () => dispatches,
    undo: () => undo(state, (transaction) => { state = state.apply(transaction); }),
    redo: () => redo(state, (transaction) => { state = state.apply(transaction); }),
  };
}

function sceneFixture(count = 8) {
  return Array.from({ length: count }, (_, index) => {
    const heading = crypto.randomUUID();
    const action = crypto.randomUUID();
    return {
      heading,
      action,
      blocks: [
        { id: heading, kind: "sceneHeading", text: `INT. ESCENA ${index + 1} - DÍA` },
        { id: action, kind: "action", text: `Acción ${index + 1}.` },
      ],
    };
  });
}

test("scene movement preserves every block id and is one undoable transaction", () => {
  const scenes = sceneFixture();
  const originalBlocks = scenes.flatMap((scene) => scene.blocks);
  const harness = createStructuralEditor(originalBlocks);
  const original = harness.state().doc.toJSON();
  const originalIds = originalBlocks.map((block) => block.id).sort();

  assert.equal(moveWriterScene(harness.editor, scenes[7].heading, scenes[4].heading, "before"), "applied");
  assert.equal(harness.dispatches(), 1);
  assert.deepEqual(writerSceneIds(harness.state().doc), [
    scenes[0].heading, scenes[1].heading, scenes[2].heading, scenes[3].heading,
    scenes[7].heading, scenes[4].heading, scenes[5].heading, scenes[6].heading,
  ]);
  assert.deepEqual(harness.state().doc.toJSON().content.map((block: { attrs: { id: string } }) => block.attrs.id).sort(), originalIds);
  assert.equal(harness.undo(), true);
  assert.deepEqual(harness.state().doc.toJSON(), original);
  assert.equal(harness.redo(), true);
  assert.equal(writerSceneIds(harness.state().doc)[4], scenes[7].heading);
});

test("scene movement handles first, last and self targets without splitting a scene", () => {
  const scenes = sceneFixture(3);
  const harness = createStructuralEditor(scenes.flatMap((scene) => scene.blocks));
  assert.equal(moveWriterScene(harness.editor, scenes[0].heading, scenes[2].heading, "after"), "applied");
  assert.deepEqual(writerSceneIds(harness.state().doc), [scenes[1].heading, scenes[2].heading, scenes[0].heading]);
  assert.equal(moveWriterScene(harness.editor, scenes[0].heading, scenes[1].heading, "before"), "applied");
  assert.deepEqual(writerSceneIds(harness.state().doc), [scenes[0].heading, scenes[1].heading, scenes[2].heading]);
  const dispatches = harness.dispatches();
  assert.equal(moveWriterScene(harness.editor, scenes[1].heading, scenes[1].heading, "after"), "unchanged");
  assert.equal(harness.dispatches(), dispatches);
  for (const scene of scenes) {
    const headingIndex = harness.state().doc.toJSON().content.findIndex((block: { attrs: { id: string } }) => block.attrs.id === scene.heading);
    assert.equal(harness.state().doc.child(headingIndex + 1).attrs.id, scene.action);
  }
});

test("character rename changes only explicit and accepted references in one undo step", () => {
  const heading = crypto.randomUUID();
  const firstCharacter = crypto.randomUUID();
  const dialogue = crypto.randomUUID();
  const actionReference = crypto.randomUUID();
  const homonym = crypto.randomUUID();
  const secondCharacter = crypto.randomUUID();
  const harness = createStructuralEditor([
    { id: heading, kind: "sceneHeading", text: "INT. CASA - DÍA" },
    { id: firstCharacter, kind: "character", text: "SOL" },
    { id: dialogue, kind: "dialogue", text: "Hola." },
    { id: actionReference, kind: "action", text: "SOL entra por la puerta." },
    { id: homonym, kind: "action", text: "El sol entra por la ventana." },
    { id: secondCharacter, kind: "character", text: "SOL (V.O.)" },
  ]);
  const original = harness.state().doc.toJSON();
  assert.equal(renameWriterCharacter(harness.editor, {
    identityId: firstCharacter,
    sourceKey: "SOL",
    newName: "LUNA",
    references: [{
      blockId: actionReference,
      start: 0,
      end: 3,
      text: "SOL",
    }],
  }), "applied");
  assert.equal(harness.dispatches(), 1);
  assert.deepEqual(harness.state().doc.toJSON().content.map((block: { content?: Array<{ text: string }> }) => block.content?.[0]?.text ?? ""), [
    "INT. CASA - DÍA", "LUNA", "Hola.", "LUNA entra por la puerta.", "El sol entra por la ventana.", "LUNA (V.O.)",
  ]);
  assert.equal(harness.undo(), true);
  assert.deepEqual(harness.state().doc.toJSON(), original);
  assert.equal(harness.redo(), true);
  assert.equal(harness.state().doc.child(1).textContent, "LUNA");
});

test("scene duplication creates fresh ids immediately after the original and undoes atomically", () => {
  const scenes = sceneFixture(2);
  const harness = createStructuralEditor(scenes.flatMap((scene) => scene.blocks));
  const result = duplicateWriterScene(harness.editor, scenes[0].heading, "APERTURA (copia)");
  assert.equal(result.status, "applied");
  assert.equal(harness.dispatches(), 1);
  assert.equal(harness.state().doc.childCount, 6);
  assert.deepEqual([harness.state().doc.child(2).textContent, harness.state().doc.child(3).textContent], [
    "INT. ESCENA 1 - DÍA", "Acción 1.",
  ]);
  assert.equal(new Set(harness.state().doc.toJSON().content.map((block: { attrs: { id: string } }) => block.attrs.id)).size, 6);
  assert.equal(harness.state().doc.child(2).attrs.sceneNickname, "APERTURA (copia)");
  assert.equal(harness.undo(), true);
  assert.equal(harness.state().doc.childCount, 4);
});

test("scene nicknames are undoable editor metadata but remain outside canonical exchange JSON", () => {
  const scene = sceneFixture(1)[0];
  const harness = createStructuralEditor(scene.blocks);
  assert.equal(renameWriterSceneNickname(harness.editor, scene.heading, "LA LLAMADA"), "applied");
  assert.equal(harness.state().doc.child(0).attrs.sceneNickname, "LA LLAMADA");
  const canonical = canonicalWriterDocument(harness.state().doc.toJSON() as WriterDocument);
  assert.equal("sceneNickname" in canonical.content[0].attrs, false);
  assert.equal(harness.undo(), true);
  assert.equal(harness.state().doc.child(0).attrs.sceneNickname, null);
});

test("structural metadata parser preserves only bounded local nicknames and rename aliases", () => {
  const parsed = parseWriterStructuralMetadata({
    version: WRITER_STRUCTURAL_METADATA_VERSION,
    sceneNicknames: { scene: "  La llamada  ", bad: 42 },
    characterAliases: {
      SOL: { identityId: "identity-1", name: " LUNA ", previousName: " SOL ", blockIds: ["block-1", 2] },
      bad: { identityId: 2, name: "X" },
    },
  });
  assert.deepEqual(parsed.sceneNicknames, { scene: "La llamada" });
  assert.deepEqual(parsed.characterAliases, {
    SOL: { identityId: "identity-1", name: "LUNA", previousName: "SOL", blockIds: ["block-1"] },
  });
});
