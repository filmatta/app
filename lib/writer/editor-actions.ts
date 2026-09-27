"use client";

import type { Editor } from "@tiptap/core";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState } from "@tiptap/pm/state";
import type { ScreenplayKind } from "./document.ts";

export type WriterBlockTarget = {
  id: string;
  kind: ScreenplayKind;
  position: number;
  text: string;
};

export function findWriterBlockAtPosition(doc: ProseMirrorNode, position: number): WriterBlockTarget | null {
  const safePosition = Math.max(0, Math.min(position, doc.content.size));
  const resolved = doc.resolve(safePosition);
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name !== "screenplayBlock") continue;
    return {
      id: String(node.attrs.id),
      kind: node.attrs.kind as ScreenplayKind,
      position: resolved.before(depth),
      text: node.textContent,
    };
  }
  return null;
}

export function findWriterBlockById(editor: Editor, id: string): WriterBlockTarget | null {
  let target: WriterBlockTarget | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "screenplayBlock" && node.attrs.id === id) {
      target = { id, kind: node.attrs.kind as ScreenplayKind, position, text: node.textContent };
      return false;
    }
  });
  return target;
}

export function currentWriterBlock(editor: Editor): WriterBlockTarget | null {
  return findWriterBlockAtPosition(editor.state.doc, editor.state.selection.from);
}

export function selectionSpansWriterBlocks(state: EditorState): boolean {
  const { from, to } = state.selection;
  return findWriterBlockAtPosition(state.doc, from)?.id !==
    findWriterBlockAtPosition(state.doc, Math.max(from, to - 1))?.id;
}

export function changeWriterBlockKind(editor: Editor, targetId: string, kind: ScreenplayKind): boolean {
  const target = findWriterBlockById(editor, targetId);
  if (!target) return false;
  if (target.kind === kind) {
    editor.commands.focus();
    return true;
  }
  const node = editor.state.doc.nodeAt(target.position);
  if (!node) return false;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(target.position, undefined, { ...node.attrs, kind }).scrollIntoView(),
  );
  editor.commands.focus();
  return true;
}

export function writerSceneForSelection(state: EditorState):
  | { sceneId: string; reason: null }
  | { sceneId: null; reason: string } {
  const first = findWriterBlockAtPosition(state.doc, state.selection.from);
  const last = findWriterBlockAtPosition(state.doc, Math.max(state.selection.from, state.selection.to - 1));
  if (!first || !last) return { sceneId: null, reason: "La selección no pertenece a una escena." };
  const firstScene = findWriterSceneForBlock(state.doc, first.id);
  const lastScene = findWriterSceneForBlock(state.doc, last.id);
  if (!firstScene || !lastScene) {
    return { sceneId: null, reason: "El texto anterior al primer encabezado no pertenece a una escena." };
  }
  if (firstScene !== lastScene) {
    return { sceneId: null, reason: "La selección abarca más de una escena." };
  }
  return { sceneId: firstScene, reason: null };
}

export function findWriterSceneForBlock(doc: ProseMirrorNode, blockId: string): string | null {
  let sceneId: string | null = null;
  let result: string | null = null;
  doc.descendants((node) => {
    if (node.type.name !== "screenplayBlock") return;
    if (node.attrs.kind === "sceneHeading") sceneId = String(node.attrs.id);
    if (node.attrs.id === blockId) {
      result = sceneId;
      return false;
    }
  });
  return result;
}

export function insertWriterPlainText(editor: Editor, text: string): boolean {
  if (!text) return false;
  const { state } = editor;
  if (!/[\r\n]/.test(text)) {
    editor.view.dispatch(state.tr.insertText(text).scrollIntoView());
    editor.commands.focus();
    return true;
  }
  const screenplayBlock = state.schema.nodes.screenplayBlock;
  if (!screenplayBlock) return false;
  const blocks = text.split(/\r?\n/).map((line) => screenplayBlock.create(
    { id: crypto.randomUUID(), kind: "action" },
    line ? state.schema.text(line) : undefined,
  ));
  editor.view.dispatch(
    state.tr.replaceSelection(new Slice(Fragment.fromArray(blocks), 0, 0)).scrollIntoView(),
  );
  editor.commands.focus();
  return true;
}

export function insertWriterBlock(
  editor: Editor,
  targetId: string,
  kind: ScreenplayKind,
  text: string,
  options: { replaceExistingSceneHeading?: boolean } = {},
): boolean {
  const target = findWriterBlockById(editor, targetId);
  if (!target) return false;
  const node = editor.state.doc.nodeAt(target.position);
  const screenplayBlock = editor.state.schema.nodes.screenplayBlock;
  if (!node || !screenplayBlock || !text) return false;

  const shouldReuse = !target.text.trim() ||
    (options.replaceExistingSceneHeading === true && target.kind === "sceneHeading");
  const transaction = editor.state.tr;
  let selectionPosition: number;

  if (shouldReuse) {
    transaction.setNodeMarkup(target.position, undefined, { ...node.attrs, kind });
    transaction.replaceWith(
      target.position + 1,
      target.position + node.nodeSize - 1,
      editor.state.schema.text(text),
    );
    selectionPosition = target.position + 1 + text.length;
  } else {
    const inserted = screenplayBlock.create(
      { id: crypto.randomUUID(), kind },
      editor.state.schema.text(text),
    );
    const insertAt = target.position + node.nodeSize;
    transaction.insert(insertAt, inserted);
    selectionPosition = insertAt + 1 + text.length;
  }

  transaction.setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition)));
  editor.view.dispatch(transaction.scrollIntoView());
  editor.commands.focus();
  return true;
}
