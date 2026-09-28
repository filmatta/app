import assert from "node:assert/strict";
import test from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { history, redo, undo } from "@tiptap/pm/history";
import type { Editor } from "@tiptap/core";
import {
  acceptWriterAutocomplete,
  writerAutocompleteKeyAction,
  writerAutocompleteSuggestions,
} from "../../lib/writer/autocomplete.ts";
import { createBlock, type ScreenplayKind, type WriterDocument } from "../../lib/writer/document.ts";

function suggestions(kind: ScreenplayKind, text: string, known: string[] = [], local: string[] = []) {
  const document: WriterDocument = {
    type: "doc",
    content: [
      ...known.map((name) => createBlock("character", name)),
      createBlock(kind, text),
    ],
  };
  return writerAutocompleteSuggestions({ document, blockKind: kind, blockText: text, cursorOffset: text.length, additionalCharacters: local });
}

test("format suggestions only match a logical prefix in a compatible block", () => {
  assert.ok(suggestions("action", "INT").some((item) => item.insertText === "INT."));
  assert.ok(suggestions("action", "EXT").some((item) => item.insertText === "EXT."));
  assert.ok(suggestions("action", "INT/EXT").some((item) => item.insertText === "INT./EXT."));
  assert.deepEqual(suggestions("action", "Carolina intenta abrir la puerta."), []);
  assert.deepEqual(suggestions("dialogue", "INT"), []);
});

test("transitions reuse the known Writer vocabulary", () => {
  const values = suggestions("action", "FAD").map((item) => item.insertText);
  assert.ok(values.includes("FADE IN:"));
  assert.ok(values.includes("FADE OUT:"));
  assert.ok(values.includes("FADE OUT."));
  assert.ok(values.includes("FADE TO BLACK."));
});

test("character suggestions only return identities already present", () => {
  assert.deepEqual(suggestions("character", "CAR", ["CAROLINA", "ESPERANZA"]).map((item) => item.insertText), ["CAROLINA"]);
  assert.deepEqual(suggestions("character", "MART", ["CAROLINA", "ESPERANZA"]), []);
  assert.deepEqual(suggestions("character", "ROB", ["CAROLINA"], ["ROBOT R-7", "CAROLINA"]).map((item) => item.insertText), ["ROBOT R-7"]);
});

test("keyboard contract keeps Enter normal until navigation and ignores IME composition", () => {
  assert.equal(writerAutocompleteKeyAction("Tab", false, false), "accept");
  assert.equal(writerAutocompleteKeyAction("Escape", false, false), "close");
  assert.equal(writerAutocompleteKeyAction("Enter", false, false), "pass");
  assert.equal(writerAutocompleteKeyAction("Enter", false, true), "accept");
  assert.equal(writerAutocompleteKeyAction("Tab", true, true), "pass");
});

test("acceptance preserves the block id and is one undoable transaction", () => {
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
    doc: schema.node("doc", null, [schema.node("screenplayBlock", { id, kind: "action" }, schema.text("INT"))]),
    plugins: [history()],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)));
  const original = state.doc.toJSON();
  const editor = {
    get state() { return state; },
    getJSON() { return state.doc.toJSON(); },
    view: {
      focus() {},
      dispatch(transaction: Transaction) { state = state.apply(transaction); },
    },
    commands: { focus() { return true; } },
  } as unknown as Editor;
  const suggestion = suggestions("action", "INT").find((item) => item.insertText === "INT.");
  assert.ok(suggestion);
  assert.equal(acceptWriterAutocomplete(editor, suggestion), true);
  assert.equal(state.doc.child(0).attrs.id, id);
  assert.equal(state.doc.child(0).attrs.kind, "sceneHeading");
  assert.equal(state.doc.child(0).textContent, "INT.");
  assert.equal(undo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.deepEqual(state.doc.toJSON(), original);
  assert.equal(redo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.equal(state.doc.child(0).attrs.id, id);
});
