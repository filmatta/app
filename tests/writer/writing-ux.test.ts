import assert from "node:assert/strict";
import test from "node:test";
import type { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { history, redo, undo } from "@tiptap/pm/history";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import {
  changeWriterBlockKind,
  insertWriterBlock,
  insertWriterPlainText,
  replaceWriterBlockWithSceneHeading,
  writerSceneForSelection,
} from "../../lib/writer/editor-actions.ts";
import {
  buildSceneHeading,
  countTextualMentions,
  deriveCharacterWritingMetrics,
} from "../../lib/writer/writing-ux.ts";

test("builds a canonical heading only after every real value is present", () => {
  assert.equal(buildSceneHeading("INT.", "  Cocina principal ", "noche"), "INT. COCINA PRINCIPAL - NOCHE");
  assert.equal(buildSceneHeading("EXT.", "", "DÍA"), "");
  assert.equal(buildSceneHeading("INT./EXT.", "AUTO", "amanecer"), "INT./EXT. AUTO - AMANECER");
});

test("separates identified characters, dialogue turns and scenes with dialogue", () => {
  const document: WriterDocument = {
    type: "doc",
    content: [
      createBlock("sceneHeading", "INT. CASA - DÍA"),
      createBlock("character", "ANA"),
      createBlock("parenthetical", "(bajo)"),
      createBlock("dialogue", "Una primera parte."),
      createBlock("dialogue", "Y otra del mismo turno."),
      createBlock("authorNote", "privado"),
      createBlock("character", "ANA"),
      createBlock("parenthetical", "(espera)"),
      createBlock("action", "No llegó a hablar."),
      createBlock("character", "ANA (V.O.)"),
      createBlock("dialogue", "Desde otro lugar."),
      createBlock("sceneHeading", "EXT. CALLE - NOCHE"),
      createBlock("character", "ANA"),
      createBlock("dialogue", "Segundo escenario."),
    ],
  };

  assert.deepEqual(deriveCharacterWritingMetrics(document), [
    { key: "ANA", name: "ANA", interventions: 2, sceneInterventions: 2 },
    { key: "ANA (V.O.)", name: "ANA (V.O.)", interventions: 1, sceneInterventions: 1 },
  ]);
});

test("counts textual mentions with Unicode boundaries and longest known names", () => {
  const document: WriterDocument = {
    type: "doc",
    content: [
      createBlock("character", "ANA"),
      createBlock("dialogue", "ANA mira a ANA MARÍA junto a la VENTANA."),
      createBlock("character", "ANA MARÍA"),
      createBlock("dialogue", "ANA MARÍA responde a Ana."),
      createBlock("action", "ANA MARÍA y ANA entran; AÑA no es ANA."),
      createBlock("sceneHeading", "INT. CASA DE ANA - DÍA"),
      createBlock("authorNote", "ANA no cuenta aquí"),
    ],
  };
  const characters = [
    { key: "ANA", name: "ANA", occurrences: 1 },
    { key: "ANA MARÍA", name: "ANA MARÍA", occurrences: 1 },
  ];

  assert.equal(countTextualMentions(document, "ANA", characters), 4);
  assert.equal(countTextualMentions(document, "ANA MARÍA", characters), 3);
});

test("a compound insertion is one undoable transaction and preserves adjacent content", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "screenplayBlock+" },
      text: { group: "inline" },
      screenplayBlock: {
        group: "block",
        content: "inline*",
        attrs: { id: { default: null }, kind: { default: "action" } },
      },
    },
  });
  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  let state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [
      schema.node("screenplayBlock", { id: firstId, kind: "action" }, schema.text("Antes")),
      schema.node("screenplayBlock", { id: secondId, kind: "action" }, schema.text("Después")),
    ]),
    plugins: [history()],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
  const original = state.doc.toJSON();
  let dispatches = 0;
  const editor = {
    get state() { return state; },
    view: { dispatch(transaction: Transaction) { dispatches += 1; state = state.apply(transaction); } },
    commands: { focus() { return true; } },
  } as unknown as Editor;

  assert.equal(insertWriterBlock(editor, firstId, "transition", "CUT TO:"), true);
  assert.equal(dispatches, 1);
  assert.deepEqual(state.doc.toJSON().content.map((node: { attrs: { kind: string } }) => node.attrs.kind), ["action", "transition", "action"]);
  assert.equal(state.doc.textBetween(0, state.doc.content.size, "|"), "Antes|CUT TO:|Después");
  assert.equal(undo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.deepEqual(state.doc.toJSON(), original);
  assert.equal(redo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.equal(state.doc.textBetween(0, state.doc.content.size, "|"), "Antes|CUT TO:|Después");
});

test("keeps a 20,000-word mention scan deterministic", () => {
  const document: WriterDocument = {
    type: "doc",
    content: [
      createBlock("character", "ANA"),
      createBlock("dialogue", "Hola"),
      createBlock("action", `${"palabra ".repeat(19_999)}ANA`),
    ],
  };
  assert.equal(countTextualMentions(document, "ANA"), 1);
  assert.equal(deriveCharacterWritingMetrics(document)[0].interventions, 1);
});

test("scene navigation resolves stable ids even when headings have identical text", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "screenplayBlock+" },
      text: { group: "inline" },
      screenplayBlock: {
        group: "block",
        content: "inline*",
        attrs: { id: { default: null }, kind: { default: "action" } },
      },
    },
  });
  const firstSceneId = crypto.randomUUID();
  const secondSceneId = crypto.randomUUID();
  const firstActionId = crypto.randomUUID();
  const secondActionId = crypto.randomUUID();
  const doc = schema.node("doc", null, [
    schema.node("screenplayBlock", { id: firstSceneId, kind: "sceneHeading" }, schema.text("INT. CASA - DÍA")),
    schema.node("screenplayBlock", { id: firstActionId, kind: "action" }, schema.text("Primera")),
    schema.node("screenplayBlock", { id: secondSceneId, kind: "sceneHeading" }, schema.text("INT. CASA - DÍA")),
    schema.node("screenplayBlock", { id: secondActionId, kind: "action" }, schema.text("Segunda")),
  ]);
  const positions = new Map<string, number>();
  doc.descendants((node, position) => {
    if (node.type.name === "screenplayBlock") positions.set(String(node.attrs.id), position);
  });
  let state = EditorState.create({ schema, doc });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, positions.get(secondActionId)! + 1)));
  assert.deepEqual(writerSceneForSelection(state), { sceneId: secondSceneId, reason: null });
  state = state.apply(state.tr.setSelection(TextSelection.create(
    state.doc,
    positions.get(firstActionId)! + 1,
    positions.get(secondActionId)! + 2,
  )));
  assert.equal(writerSceneForSelection(state).sceneId, null);
  assert.match(writerSceneForSelection(state).reason ?? "", /más de una escena/i);
});

test("same-kind conversion is a no-op and multiline menu paste creates unique action blocks", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "screenplayBlock+" },
      text: { group: "inline" },
      screenplayBlock: {
        group: "block",
        content: "inline*",
        attrs: { id: { default: null }, kind: { default: "action" } },
      },
    },
  });
  const id = crypto.randomUUID();
  let state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [schema.node("screenplayBlock", { id, kind: "action" }, schema.text("Base"))]),
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 5)));
  let dispatches = 0;
  const editor = {
    get state() { return state; },
    view: { dispatch(transaction: Transaction) { dispatches += 1; state = state.apply(transaction); } },
    commands: { focus() { return true; } },
  } as unknown as Editor;

  assert.equal(changeWriterBlockKind(editor, id, "action"), true);
  assert.equal(dispatches, 0);
  assert.equal(insertWriterPlainText(editor, "Uno\nDos"), true);
  const blocks = state.doc.toJSON().content as Array<{ attrs: { id: string; kind: string } }>;
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((block) => block.attrs.kind), ["action", "action"]);
  assert.equal(new Set(blocks.map((block) => block.attrs.id)).size, 2);
});

test("assisted scene conversion preserves the block id in one undoable transaction and rejects stale targets", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "screenplayBlock+" },
      text: { group: "inline" },
      screenplayBlock: {
        group: "block",
        content: "inline*",
        attrs: { id: { default: null }, kind: { default: "action" } },
      },
    },
  });
  const id = crypto.randomUUID();
  let state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [schema.node("screenplayBlock", { id, kind: "action" }, schema.text("Texto original"))]),
    plugins: [history()],
  });
  const original = state.doc.toJSON();
  let dispatches = 0;
  const editor = {
    get state() { return state; },
    view: { dispatch(transaction: Transaction) { dispatches += 1; state = state.apply(transaction); } },
    commands: { focus() { return true; } },
  } as unknown as Editor;

  assert.equal(
    replaceWriterBlockWithSceneHeading(editor, id, { kind: "action", text: "Texto distinto" }, "INT. CASA - DÍA"),
    "changed",
  );
  assert.equal(dispatches, 0);
  assert.equal(
    replaceWriterBlockWithSceneHeading(editor, id, { kind: "action", text: "Texto original" }, "INT. CASA - DÍA"),
    "applied",
  );
  assert.equal(dispatches, 1);
  assert.equal(state.doc.childCount, 1);
  assert.equal(state.doc.child(0).attrs.id, id);
  assert.equal(state.doc.child(0).attrs.kind, "sceneHeading");
  assert.equal(state.doc.child(0).textContent, "INT. CASA - DÍA");
  assert.equal(undo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.deepEqual(state.doc.toJSON(), original);
  assert.equal(redo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.equal(state.doc.child(0).attrs.id, id);
  assert.equal(
    replaceWriterBlockWithSceneHeading(editor, id, { kind: "sceneHeading", text: "INT. CASA - DÍA" }, "INT. CASA - DÍA"),
    "unchanged",
  );
  assert.equal(dispatches, 1);
});

test("assisted scene insertion always creates a new block without converting an empty target", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "screenplayBlock+" },
      text: { group: "inline" },
      screenplayBlock: {
        group: "block",
        content: "inline*",
        attrs: { id: { default: null }, kind: { default: "action" } },
      },
    },
  });
  const id = crypto.randomUUID();
  let state = EditorState.create({ schema, doc: schema.node("doc", null, [schema.node("screenplayBlock", { id, kind: "action" })]) });
  const editor = {
    get state() { return state; },
    view: { dispatch(transaction: Transaction) { state = state.apply(transaction); } },
    commands: { focus() { return true; } },
  } as unknown as Editor;

  assert.equal(insertWriterBlock(editor, id, "sceneHeading", "EXT. PATIO - NOCHE", { forceNew: true }), true);
  assert.equal(state.doc.childCount, 2);
  assert.equal(state.doc.child(0).attrs.id, id);
  assert.equal(state.doc.child(0).attrs.kind, "action");
  assert.equal(state.doc.child(0).textContent, "");
  assert.equal(state.doc.child(1).attrs.kind, "sceneHeading");
  assert.notEqual(state.doc.child(1).attrs.id, id);
});
