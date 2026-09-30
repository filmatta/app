"use client";

import { mergeAttributes, Node, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { ScreenplayKind } from "./document.ts";

const enterNext: Record<ScreenplayKind, ScreenplayKind> = {
  sceneHeading: "action",
  action: "action",
  character: "dialogue",
  dialogue: "action",
  parenthetical: "dialogue",
  transition: "sceneHeading",
  authorNote: "action",
};

const sceneHighlightKey = new PluginKey<DecorationSet>("writerSceneHighlight");
const observationMarkerKey = new PluginKey<DecorationSet>("writerObservationMarkers");
const assistantMarkerKey = new PluginKey<DecorationSet>("writerAssistantMarkers");
type ImportReviewDecorationState = {
  decorations: DecorationSet;
  items: readonly WriterImportReviewDecoration[];
  onOpen: (id: string) => void;
};
const importReviewDecorationKey = new PluginKey<ImportReviewDecorationState>("writerImportReviewDecorations");

export type WriterImportReviewDecoration = {
  id: string;
  blockId: string;
  category: ScreenplayKind;
  state: "classification" | "question";
  active: boolean;
};

export type WriterAssistantMarkerDecoration = {
  sceneId: string;
  blockId: string;
  observationId: string;
  state: "QUESTION" | "INFO" | "REVIEW";
};

function sceneHighlightDecorations(doc: ProseMirrorNode, id: string) {
  let decorations = DecorationSet.empty;
  doc.descendants((node, position) => {
    if (node.type.name === "screenplayBlock" && node.attrs.id === id) {
      decorations = DecorationSet.create(doc, [
        Decoration.node(position, position + node.nodeSize, { class: "writer-scene-target-highlight" }),
      ]);
      return false;
    }
  });
  return decorations;
}

export function setWriterSceneHighlight(editor: Editor, id: string | null) {
  editor.view.dispatch(editor.state.tr.setMeta(sceneHighlightKey, id));
}

export function setWriterObservationMarkers(
  editor: Editor,
  counts: ReadonlyMap<string, number>,
  onOpen: (blockId: string) => void,
) {
  const decorations: Decoration[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "screenplayBlock") return;
    const blockId = String(node.attrs.id ?? "");
    const count = counts.get(blockId) ?? 0;
    if (!blockId || count < 1) return;
    decorations.push(Decoration.widget(position + node.nodeSize - 1, () => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "writer-observation-marker";
      marker.dataset.blockId = blockId;
      marker.contentEditable = "false";
      marker.setAttribute("aria-label", `${count} ${count === 1 ? "observación" : "observaciones"} en este bloque`);
      marker.title = `${count} ${count === 1 ? "observación" : "observaciones"}`;
      marker.textContent = count > 1 ? String(count) : "•";
      marker.addEventListener("mousedown", (event) => event.preventDefault());
      marker.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen(blockId);
      });
      return marker;
    }, {
      key: `writer-observation-${blockId}-${count}`,
      side: 1,
      stopEvent: (event) => event.type === "mousedown" || event.type === "click",
    }));
  });
  editor.view.dispatch(editor.state.tr.setMeta(
    observationMarkerKey,
    DecorationSet.create(editor.state.doc, decorations),
  ));
}

export function setWriterAssistantMarkers(
  editor: Editor,
  items: readonly WriterAssistantMarkerDecoration[],
  onOpen: (item: WriterAssistantMarkerDecoration) => void,
) {
  const byBlockId = new Map(items.map((item) => [item.blockId, item]));
  const decorations: Decoration[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "screenplayBlock") return;
    const item = byBlockId.get(String(node.attrs.id ?? ""));
    if (!item) return;
    decorations.push(Decoration.widget(position + node.nodeSize - 1, () => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "writer-assistant-marker";
      marker.dataset.assistantObservationId = item.observationId;
      marker.dataset.assistantState = item.state.toLocaleLowerCase("en-US");
      marker.contentEditable = "false";
      marker.setAttribute("aria-label", "Abrir observación narrativa");
      marker.title = item.state === "QUESTION" ? "Pregunta narrativa" : "Observación narrativa";
      marker.textContent = "!";
      marker.addEventListener("mousedown", (event) => event.preventDefault());
      marker.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen(item);
      });
      return marker;
    }, {
      key: `writer-assistant-${item.sceneId}-${item.blockId}-${item.observationId}`,
      side: 1,
      stopEvent: (event) => event.type === "mousedown" || event.type === "click",
    }));
  });
  editor.view.dispatch(editor.state.tr.setMeta(
    assistantMarkerKey,
    DecorationSet.create(editor.state.doc, decorations),
  ));
}

export function setWriterImportReviewDecorations(
  editor: Editor,
  items: readonly WriterImportReviewDecoration[],
  onOpen: (id: string) => void,
) {
  editor.view.dispatch(editor.state.tr.setMeta(importReviewDecorationKey, {
    decorations: importReviewDecorations(editor.state.doc, items),
    items,
    onOpen,
  } satisfies ImportReviewDecorationState));
}

function importReviewDecorations(
  doc: ProseMirrorNode,
  items: readonly WriterImportReviewDecoration[],
) {
  const byBlockId = new Map(items.map((item) => [item.blockId, item]));
  const decorations: Decoration[] = [];
  doc.descendants((node, position) => {
    if (node.type.name !== "screenplayBlock") return;
    const item = byBlockId.get(String(node.attrs.id ?? ""));
    if (!item) return;
    const attributes = {
      class: `writer-import-review-highlight${item.active ? " is-active" : ""}`,
      "data-writer-import-review-id": item.id,
      "data-writer-import-review-category": item.category,
      "data-writer-import-review-state": item.state,
    };
    if (node.content.size > 0) {
      decorations.push(Decoration.inline(position + 1, position + 1 + node.content.size, attributes, {
        inclusiveStart: false,
        inclusiveEnd: false,
      }));
    } else {
      decorations.push(Decoration.node(position, position + node.nodeSize, attributes));
    }
  });
  return DecorationSet.create(doc, decorations);
}

export const ScreenplayBlockExtension = Node.create({
  name: "screenplayBlock",
  priority: 1_000,
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
        renderHTML: ({ id }) => ({ "data-block-id": id }),
      },
      kind: {
        default: "action",
        parseHTML: (element) => element.getAttribute("data-screenplay-kind") ?? "action",
        renderHTML: ({ kind }) => ({ "data-screenplay-kind": kind }),
      },
      sceneNickname: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "p[data-screenplay-kind]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes, { class: "writer-screenplay-block" }), 0];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state, view } = this.editor;
        if (view.composing || !state.selection.empty) return false;
        const { $from } = state.selection;
        if ($from.parent.type.name !== this.name || $from.parentOffset !== $from.parent.content.size) {
          return false;
        }
        const kind = ($from.parent.attrs.kind ?? "action") as ScreenplayKind;
        const block = state.schema.nodes.screenplayBlock.create({
          id: crypto.randomUUID(),
          kind: enterNext[kind] ?? "action",
        });
        const insertAt = $from.after();
        const transaction = state.tr.insert(insertAt, block);
        transaction.setSelection(TextSelection.near(transaction.doc.resolve(insertAt + 1)));
        view.dispatch(transaction.scrollIntoView());
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          const seen = new Set<string>();
          const replacements: Array<{ position: number; attrs: Record<string, unknown> }> = [];
          newState.doc.descendants((node, position) => {
            if (node.type.name !== "screenplayBlock") return;
            const id = typeof node.attrs.id === "string" ? node.attrs.id : "";
            if (!id || seen.has(id)) {
              replacements.push({ position, attrs: { ...node.attrs, id: crypto.randomUUID() } });
            } else {
              seen.add(id);
            }
          });
          if (!replacements.length) return null;
          const transaction = newState.tr;
          for (const replacement of replacements) {
            transaction.setNodeMarkup(replacement.position, undefined, replacement.attrs);
          }
          return transaction;
        },
      }),
      new Plugin<DecorationSet>({
        key: sceneHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, current, _oldState, newState) {
            const highlightedId = transaction.getMeta(sceneHighlightKey) as string | null | undefined;
            if (highlightedId !== undefined) {
              return highlightedId ? sceneHighlightDecorations(newState.doc, highlightedId) : DecorationSet.empty;
            }
            return transaction.docChanged ? current.map(transaction.mapping, transaction.doc) : current;
          },
        },
        props: {
          decorations: (state) => sceneHighlightKey.getState(state),
        },
      }),
      new Plugin<DecorationSet>({
        key: observationMarkerKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, current) {
            const next = transaction.getMeta(observationMarkerKey) as DecorationSet | undefined;
            if (next !== undefined) return next;
            return transaction.docChanged ? DecorationSet.empty : current;
          },
        },
        props: {
          decorations: (state) => observationMarkerKey.getState(state),
        },
      }),
      new Plugin<DecorationSet>({
        key: assistantMarkerKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, current) {
            const next = transaction.getMeta(assistantMarkerKey) as DecorationSet | undefined;
            if (next !== undefined) return next;
            return transaction.docChanged ? current.map(transaction.mapping, transaction.doc) : current;
          },
        },
        props: {
          decorations: (state) => assistantMarkerKey.getState(state),
        },
      }),
      new Plugin<ImportReviewDecorationState>({
        key: importReviewDecorationKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty, items: [], onOpen: () => undefined }),
          apply(transaction, current, oldState) {
            const next = transaction.getMeta(importReviewDecorationKey) as ImportReviewDecorationState | undefined;
            if (next !== undefined) return next;
            const replacedWholeDocument = transaction.steps.some((step) => {
              const json = step.toJSON() as { stepType?: string; from?: number; to?: number };
              return json.stepType === "replace" && json.from === 0 && json.to === oldState.doc.content.size;
            });
            if (transaction.docChanged && (transaction.getMeta("writerStructuralOperation") || replacedWholeDocument)) {
              return {
                ...current,
                decorations: importReviewDecorations(transaction.doc, current.items),
              };
            }
            return transaction.docChanged
              ? { ...current, decorations: current.decorations.map(transaction.mapping, transaction.doc) }
              : current;
          },
        },
        props: {
          decorations: (state) => importReviewDecorationKey.getState(state)?.decorations,
          handleClick: (view, _position, event) => {
            const target = event.target instanceof Element
              ? event.target.closest<HTMLElement>("[data-writer-import-review-id]")
              : null;
            const id = target?.dataset.writerImportReviewId;
            if (!id) return false;
            importReviewDecorationKey.getState(view.state)?.onOpen(id);
            return true;
          },
        },
      }),
    ];
  },
});
