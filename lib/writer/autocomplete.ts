"use client";

import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { blockText, deriveCharacters, type ScreenplayKind, type WriterDocument } from "./document.ts";
import { findWriterBlockAtPosition } from "./editor-actions.ts";
import { QUICK_INSERTS } from "./writing-ux.ts";

export type WriterAutocompleteSuggestion = {
  id: string;
  label: string;
  description: string;
  insertText: string;
  kind: ScreenplayKind;
};

export type WriterAutocompleteContext = {
  document: WriterDocument;
  blockKind: ScreenplayKind;
  blockText: string;
  cursorOffset: number;
  additionalCharacters?: readonly string[];
};

export type WriterAutocompleteKeyAction = "accept" | "close" | "next" | "previous" | "pass";

export function writerAutocompleteKeyAction(
  key: string,
  composing: boolean,
  explicitlySelected: boolean,
): WriterAutocompleteKeyAction {
  if (composing) return "pass";
  if (key === "Escape") return "close";
  if (key === "ArrowDown") return "next";
  if (key === "ArrowUp") return "previous";
  if (key === "Tab") return "accept";
  if (key === "Enter" && explicitlySelected) return "accept";
  return "pass";
}

const SCENE_COMPLETIONS: readonly WriterAutocompleteSuggestion[] = [
  { id: "scene-int", label: "INT.", description: "Encabezado interior", insertText: "INT.", kind: "sceneHeading" },
  { id: "scene-ext", label: "EXT.", description: "Encabezado exterior", insertText: "EXT.", kind: "sceneHeading" },
  { id: "scene-int-ext", label: "INT./EXT.", description: "Encabezado interior/exterior", insertText: "INT./EXT.", kind: "sceneHeading" },
];

const TRANSITION_COMPLETIONS: readonly WriterAutocompleteSuggestion[] = [...new Map(
  [...QUICK_INSERTS, { text: "FADE OUT:", kind: "transition" as const, label: "FADE OUT:" }].map((item) => [item.text, {
    id: `transition-${encodeURIComponent(item.text.toLocaleLowerCase("en-US"))}`,
    label: item.text,
    description: "Transición reconocida",
    insertText: item.text,
    kind: "transition" as const,
  }]),
).values()];

export function writerAutocompleteSuggestions(context: WriterAutocompleteContext) {
  const prefix = context.blockText.slice(0, context.cursorOffset);
  if (context.cursorOffset < 1 || prefix !== prefix.trimStart() || /[\r\n]/u.test(prefix)) return [];
  const normalized = prefix.normalize("NFKC").toLocaleUpperCase("es-MX");

  if (context.blockKind === "character") {
    if (normalized.length < 2 || normalized.length > 42 || /[^\p{L}\p{N} ._'-]/u.test(prefix)) return [];
    const characters = new Map(deriveCharacters(context.document).map((character) => [character.key, character.name]));
    for (const name of context.additionalCharacters ?? []) {
      const clean = name.trim().replace(/\s+/gu, " ");
      const key = clean.normalize("NFKC").toLocaleUpperCase("es-MX");
      if (clean && !characters.has(key)) characters.set(key, clean);
    }
    return [...characters].map(([key, name]) => ({ key, name }))
      .filter((character) => character.key.startsWith(normalized) && character.key !== normalized)
      .slice(0, 7)
      .map((character) => ({
        id: `character-${character.key}`,
        label: character.name,
        description: "Personaje existente",
        insertText: character.name,
        kind: "character" as const,
      }));
  }

  if (context.blockKind !== "action" && context.blockKind !== "sceneHeading" && context.blockKind !== "transition") {
    return [];
  }

  if (context.blockKind !== "transition") {
    const scenePrefix = normalized.replace(/[\s.]+/gu, "");
    const sceneSuggestions = SCENE_COMPLETIONS.filter((suggestion) => {
      const candidate = suggestion.insertText.replace(/[\s.]+/gu, "");
      return candidate.startsWith(scenePrefix)
        && (candidate !== scenePrefix || context.blockKind !== suggestion.kind);
    });
    if (sceneSuggestions.length && /^(?:I|IN|INT|E|EX|EXT|INT\/|INT\/E|INT\/EX|INT\/EXT)$/u.test(scenePrefix)) {
      return sceneSuggestions;
    }
  }

  const transitionSuggestions = TRANSITION_COMPLETIONS.filter((suggestion) => {
    const candidate = suggestion.insertText.toLocaleUpperCase("es-MX");
    return candidate.startsWith(normalized)
      && (candidate !== normalized || context.blockKind !== "transition");
  });
  if (transitionSuggestions.length && normalized.length >= 2 && /^[A-ZÁÉÍÓÚÜÑ .:']+$/u.test(normalized)) {
    return transitionSuggestions.slice(0, 7);
  }
  return [];
}

export function writerAutocompleteContext(editor: Editor, additionalCharacters: readonly string[] = []): WriterAutocompleteContext | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const target = findWriterBlockAtPosition(editor.state.doc, selection.from);
  if (!target) return null;
  const node = editor.state.doc.nodeAt(target.position);
  if (!node) return null;
  const cursorOffset = selection.from - target.position - 1;
  if (cursorOffset < 0 || cursorOffset > node.content.size) return null;
  return {
    document: editor.getJSON() as unknown as WriterDocument,
    blockKind: target.kind,
    blockText: target.text,
    cursorOffset,
    additionalCharacters: [...additionalCharacters],
  };
}

export function acceptWriterAutocomplete(
  editor: Editor,
  suggestion: WriterAutocompleteSuggestion,
  additionalCharacters: readonly string[] = [],
) {
  const context = writerAutocompleteContext(editor, additionalCharacters);
  const target = findWriterBlockAtPosition(editor.state.doc, editor.state.selection.from);
  if (!context || !target) return false;
  const available = writerAutocompleteSuggestions(context);
  if (!available.some((candidate) => candidate.id === suggestion.id)) return false;
  const node = editor.state.doc.nodeAt(target.position);
  if (!node) return false;

  const from = target.position + 1;
  const to = from + context.cursorOffset;
  const transaction = editor.state.tr;
  if (target.kind !== suggestion.kind) {
    transaction.setNodeMarkup(target.position, undefined, { ...node.attrs, kind: suggestion.kind });
  }
  transaction.insertText(suggestion.insertText, from, to);
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(from + suggestion.insertText.length)));
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return true;
}

export function knownWriterLocations(document: WriterDocument) {
  const locations = new Map<string, string>();
  for (const block of document.content) {
    if (block.attrs.kind !== "sceneHeading") continue;
    const text = blockText(block).trim();
    const match = text.match(/^\s*(?:INT\.?|EXT\.?|INT\.?\s*\/\s*EXT\.?)\s+(.+?)(?:\s+(?:-|—|–)\s+[^-—–]+)?$/iu);
    const location = match?.[1]?.trim();
    if (!location) continue;
    const key = location.normalize("NFKC").toLocaleUpperCase("es-MX");
    if (!locations.has(key)) locations.set(key, location);
  }
  return [...locations.values()];
}
