"use client";

import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState } from "@tiptap/pm/state";
import type { ScreenplayKind } from "./document.ts";
import { writerCharacterIdentityKey } from "./character-observations.ts";

export type WriterBlockTarget = {
  id: string;
  kind: ScreenplayKind;
  position: number;
  text: string;
};

export type ReplaceWriterBlockResult = "applied" | "unchanged" | "missing" | "changed";

export type WriterSelectionTarget = {
  document: ProseMirrorNode;
  from: number;
  to: number;
  targetId: string;
  kind: ScreenplayKind;
  text: string;
  multipleBlocks: boolean;
};

export type WriterSceneMovePosition = "before" | "after";

export type WriterCharacterReference = {
  blockId: string;
  start: number;
  end: number;
  text: string;
};

export type WriterCharacterRenameInput = {
  identityId: string;
  sourceKey: string;
  newName: string;
  references: readonly WriterCharacterReference[];
};

export type WriterStructuralCommandResult = "applied" | "unchanged" | "missing" | "invalid";

export type WriterAutoFormatMutation = {
  blockId: string;
  kind: ScreenplayKind;
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
  return findWriterBlockByIdInDocument(editor.state.doc, id);
}

export function findWriterBlockByIdInDocument(doc: ProseMirrorNode, id: string): WriterBlockTarget | null {
  let target: WriterBlockTarget | null = null;
  doc.descendants((node, position) => {
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

export function captureWriterSelectionTarget(state: EditorState): WriterSelectionTarget | null {
  const target = findWriterBlockAtPosition(state.doc, state.selection.from);
  if (!target) return null;
  return {
    document: state.doc,
    from: state.selection.from,
    to: state.selection.to,
    targetId: target.id,
    kind: target.kind,
    text: target.text,
    multipleBlocks: selectionSpansWriterBlocks(state),
  };
}

export function writerSelectionTargetIsCurrent(state: EditorState, target: WriterSelectionTarget): boolean {
  if (state.doc !== target.document || state.selection.from !== target.from || state.selection.to !== target.to) return false;
  const current = findWriterBlockByIdInDocument(state.doc, target.targetId);
  return Boolean(current && current.kind === target.kind && current.text === target.text);
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

export function applyWriterAutoFormat(
  editor: Editor,
  changes: readonly WriterAutoFormatMutation[],
): WriterStructuralCommandResult {
  if (!changes.length) return "unchanged";
  const requested = new Map(changes.map((change) => [change.blockId, change.kind]));
  const transaction = closeHistory(
    editor.state.tr.setMeta("writerStructuralOperation", "autoFormat"),
  );
  let changed = 0;
  editor.state.doc.forEach((node, position) => {
    const blockId = String(node.attrs.id ?? "");
    const kind = requested.get(blockId);
    if (!kind || node.attrs.kind !== "action" || node.attrs.kind === kind) return;
    transaction.setNodeMarkup(position, undefined, { ...node.attrs, kind });
    changed += 1;
  });
  if (!changed) return "unchanged";
  transaction.setMeta("addToHistory", true).scrollIntoView();
  editor.view.dispatch(transaction);
  editor.view.focus();
  return "applied";
}

export function writerSceneIds(doc: ProseMirrorNode) {
  const ids: string[] = [];
  doc.forEach((node) => {
    if (node.type.name === "screenplayBlock" && node.attrs.kind === "sceneHeading") {
      ids.push(String(node.attrs.id));
    }
  });
  return ids;
}

export function moveWriterScene(
  editor: Editor,
  sceneId: string,
  targetSceneId: string,
  position: WriterSceneMovePosition,
): WriterStructuralCommandResult {
  if (sceneId === targetSceneId) return "unchanged";
  const nodes: ProseMirrorNode[] = [];
  editor.state.doc.forEach((node) => nodes.push(node));
  const sourceStart = nodes.findIndex((node) => node.attrs.id === sceneId && node.attrs.kind === "sceneHeading");
  const targetStart = nodes.findIndex((node) => node.attrs.id === targetSceneId && node.attrs.kind === "sceneHeading");
  if (sourceStart < 0 || targetStart < 0) return "missing";
  const sourceEnd = nextSceneIndex(nodes, sourceStart + 1);
  const moving = nodes.slice(sourceStart, sourceEnd);
  const remaining = [...nodes.slice(0, sourceStart), ...nodes.slice(sourceEnd)];
  const targetIndex = remaining.findIndex((node) => node.attrs.id === targetSceneId && node.attrs.kind === "sceneHeading");
  if (targetIndex < 0) return "missing";
  const insertIndex = position === "before" ? targetIndex : nextSceneIndex(remaining, targetIndex + 1);
  const next = [...remaining.slice(0, insertIndex), ...moving, ...remaining.slice(insertIndex)];
  if (next.every((node, index) => node === nodes[index])) return "unchanged";

  const transaction = editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, Fragment.fromArray(next))
    .setMeta("writerStructuralOperation", "sceneOrderChanged");
  const headingPosition = topLevelNodePosition(transaction.doc, sceneId);
  if (headingPosition !== null) {
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(headingPosition + 1)));
  }
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return "applied";
}

export function duplicateWriterScene(
  editor: Editor,
  sceneId: string,
  nickname = "",
): { status: WriterStructuralCommandResult; sceneId?: string; blockIds?: string[] } {
  const nodes: Array<{ node: ProseMirrorNode; position: number }> = [];
  editor.state.doc.forEach((node, position) => nodes.push({ node, position }));
  const sourceStart = nodes.findIndex(({ node }) => node.attrs.id === sceneId && node.attrs.kind === "sceneHeading");
  if (sourceStart < 0) return { status: "missing" };
  const sourceEnd = nextSceneEntryIndex(nodes, sourceStart + 1);
  const source = nodes.slice(sourceStart, sourceEnd);
  const blockIds: string[] = [];
  const copies = source.map(({ node }, index) => {
    const id = crypto.randomUUID();
    blockIds.push(id);
    return node.type.create(
      {
        ...node.attrs,
        id,
        ...(index === 0 ? { sceneNickname: nickname || null } : {}),
      },
      node.content,
      node.marks,
    );
  });
  const insertAt = sourceEnd < nodes.length
    ? nodes[sourceEnd].position
    : editor.state.doc.content.size;
  const transaction = editor.state.tr
    .insert(insertAt, Fragment.fromArray(copies))
    .setMeta("writerStructuralOperation", "sceneDuplicated");
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(insertAt + 1)));
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return { status: "applied", sceneId: blockIds[0], blockIds };
}

export function renameWriterCharacter(
  editor: Editor,
  input: WriterCharacterRenameInput,
): WriterStructuralCommandResult {
  if (!input.identityId) return "invalid";
  const { sourceKey, newName, references } = input;
  const replacements: Array<{ from: number; to: number; text: string }> = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "screenplayBlock") return;
    const blockId = String(node.attrs.id ?? "");
    if (node.attrs.kind === "character" && writerCharacterIdentityKey(node.textContent) === sourceKey) {
      const suffix = node.textContent.match(/\s*\((?:V\.?\s*O\.?|O\.?\s*S\.?|OFF|CONT(?:INUED|INUADO|['’]?D|\.)?)\)\s*$/iu)?.[0] ?? "";
      replacements.push({ from: position + 1, to: position + 1 + node.content.size, text: `${newName}${suffix}` });
    }
    for (const reference of references) {
      if (reference.blockId !== blockId || reference.start < 0 || reference.end <= reference.start) continue;
      if (node.textContent.slice(reference.start, reference.end) !== reference.text) continue;
      replacements.push({
        from: position + 1 + reference.start,
        to: position + 1 + reference.end,
        text: newName,
      });
    }
  });
  const unique = new Map(replacements.map((item) => [`${item.from}:${item.to}`, item]));
  const ordered = [...unique.values()].sort((left, right) => right.from - left.from);
  if (!ordered.length) return "missing";
  const transaction = editor.state.tr.setMeta("writerStructuralOperation", "characterRenamed");
  for (const replacement of ordered) transaction.insertText(replacement.text, replacement.from, replacement.to);
  const first = ordered.at(-1);
  if (first) transaction.setSelection(TextSelection.near(transaction.doc.resolve(first.from + newName.length)));
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return "applied";
}

export function renameWriterSceneNickname(editor: Editor, sceneId: string, nickname: string) {
  const target = findWriterBlockById(editor, sceneId);
  if (!target || target.kind !== "sceneHeading") return "missing" as const;
  const node = editor.state.doc.nodeAt(target.position);
  if (!node) return "missing" as const;
  const current = typeof node.attrs.sceneNickname === "string" ? node.attrs.sceneNickname : "";
  if (current === nickname) return "unchanged" as const;
  editor.view.dispatch(editor.state.tr
    .setNodeMarkup(target.position, undefined, { ...node.attrs, sceneNickname: nickname || null })
    .setMeta("writerStructuralOperation", "sceneNicknameChanged"));
  return "applied" as const;
}

function nextSceneIndex(nodes: readonly ProseMirrorNode[], from: number) {
  const next = nodes.findIndex((node, index) => index >= from && node.attrs.kind === "sceneHeading");
  return next < 0 ? nodes.length : next;
}

function nextSceneEntryIndex(nodes: ReadonlyArray<{ node: ProseMirrorNode }>, from: number) {
  const next = nodes.findIndex(({ node }, index) => index >= from && node.attrs.kind === "sceneHeading");
  return next < 0 ? nodes.length : next;
}

function topLevelNodePosition(doc: ProseMirrorNode, id: string) {
  let result: number | null = null;
  doc.forEach((node, position) => {
    if (result === null && node.attrs.id === id) result = position;
  });
  return result;
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
  options: { replaceExistingSceneHeading?: boolean; forceNew?: boolean } = {},
): boolean {
  const target = findWriterBlockById(editor, targetId);
  if (!target) return false;
  const node = editor.state.doc.nodeAt(target.position);
  const screenplayBlock = editor.state.schema.nodes.screenplayBlock;
  if (!node || !screenplayBlock || !text) return false;

  const shouldReuse = options.forceNew !== true && (!target.text.trim() ||
    (options.replaceExistingSceneHeading === true && target.kind === "sceneHeading"));
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

export function replaceWriterBlockWithSceneHeading(
  editor: Editor,
  targetId: string,
  expected: { kind: ScreenplayKind; text: string },
  heading: string,
): ReplaceWriterBlockResult {
  const target = findWriterBlockById(editor, targetId);
  if (!target) return "missing";
  if (target.kind !== expected.kind || target.text !== expected.text) return "changed";
  if (target.kind === "sceneHeading" && target.text === heading) {
    editor.commands.focus();
    return "unchanged";
  }

  const node = editor.state.doc.nodeAt(target.position);
  if (!node || !heading) return "missing";
  const transaction = editor.state.tr
    .setNodeMarkup(target.position, undefined, { ...node.attrs, kind: "sceneHeading" })
    .replaceWith(
      target.position + 1,
      target.position + node.nodeSize - 1,
      editor.state.schema.text(heading),
    );
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(target.position + 1 + heading.length)));
  editor.view.dispatch(transaction.scrollIntoView());
  editor.commands.focus();
  return "applied";
}
