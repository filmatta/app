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
    ];
  },
});
