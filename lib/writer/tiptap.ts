"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
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

export const ScreenplayBlockExtension = Node.create({
  name: "screenplayBlock",
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
    ];
  },
});
