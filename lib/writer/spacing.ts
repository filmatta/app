import {
  blockText,
  type WriterBlock,
  type WriterDocument,
  type WriterInlineNode,
  type WriterMark,
} from "./document.ts";

const PRESENTATION_ONLY = /^[\s\u00a0\u2007\u200b\u202f\u2060\ufeff]*$/u;
const PRESENTATION_SPACES = /[\u00a0\u2007\u202f]/gu;
const INVISIBLE_PRESENTATION = /[\u200b\u2060\ufeff]/gu;

export function isWriterPresentationBlank(block: WriterBlock) {
  return block.attrs.kind === "action" && PRESENTATION_ONLY.test(blockText(block));
}

export function redundantWriterBlankBlockIds(
  document: WriterDocument,
  blockIds?: readonly string[],
) {
  const scope = blockIds ? new Set(blockIds) : null;
  const candidates = document.content.filter((block) =>
    (!scope || scope.has(block.attrs.id)) && isWriterPresentationBlank(block));
  if (!candidates.length) return [];

  // Once a screenplay contains real content, visual spacing belongs to the
  // stylesheet rather than empty Action blocks imported from a rich-text source.
  // An entirely empty document still retains one editable block.
  const meaningfulBlocks = document.content.filter((block) => !isWriterPresentationBlank(block));
  const removable = meaningfulBlocks.length ? candidates : candidates.slice(1);
  return removable.map((block) => block.attrs.id);
}

export function countRedundantWriterBlankBlocks(
  document: WriterDocument,
  blockIds?: readonly string[],
) {
  return redundantWriterBlankBlockIds(document, blockIds).length;
}

export function countWriterPresentationWhitespaceAdjustments(
  document: WriterDocument,
  blockIds?: readonly string[],
) {
  const scope = blockIds ? new Set(blockIds) : null;
  return document.content.filter((block) => {
    if ((scope && !scope.has(block.attrs.id)) || isWriterPresentationBlank(block)) return false;
    return JSON.stringify(block.content ?? []) !== JSON.stringify(normalizeWriterPresentationContent(block) ?? []);
  }).length;
}

export function normalizeWriterPresentationContent(block: WriterBlock): WriterInlineNode[] | undefined {
  if (!block.content?.length) return undefined;
  const expanded = block.content.flatMap((node): WriterInlineNode[] => {
    if (node.type === "hardBreak") return [node];
    const text = node.text
      .replace(/\r\n?/gu, "\n")
      .replace(PRESENTATION_SPACES, " ")
      .replace(INVISIBLE_PRESENTATION, "");
    return text.split("\n").flatMap((part, index): WriterInlineNode[] => [
      ...(index > 0 ? [{ type: "hardBreak" as const }] : []),
      ...(part ? [{ type: "text" as const, text: part, ...(node.marks ? { marks: node.marks } : {}) }] : []),
    ]);
  });

  const normalized: WriterInlineNode[] = [];
  for (const node of expanded) {
    if (node.type === "hardBreak") {
      trimTrailingHorizontalSpace(normalized);
      if (normalized.at(-1)?.type !== "hardBreak") normalized.push(node);
      continue;
    }
    const text = normalized.at(-1)?.type === "hardBreak"
      ? node.text.replace(/^[\t ]+/u, "")
      : node.text;
    if (text) pushText(normalized, text, node.marks);
  }

  while (normalized[0]?.type === "hardBreak") normalized.shift();
  while (normalized.at(-1)?.type === "hardBreak") normalized.pop();
  trimLeadingHorizontalSpace(normalized);
  trimTrailingHorizontalSpace(normalized);
  return normalized.length ? normalized : undefined;
}

function pushText(content: WriterInlineNode[], text: string, marks?: WriterMark[]) {
  const previous = content.at(-1);
  if (previous?.type === "text" && sameMarks(previous.marks, marks)) {
    previous.text += text;
    return;
  }
  content.push({ type: "text", text, ...(marks?.length ? { marks: marks.map((mark) => ({ ...mark })) } : {}) });
}

function trimLeadingHorizontalSpace(content: WriterInlineNode[]) {
  const first = content[0];
  if (first?.type !== "text") return;
  first.text = first.text.replace(/^[\t ]+/u, "");
  if (!first.text) content.shift();
}

function trimTrailingHorizontalSpace(content: WriterInlineNode[]) {
  const last = content.at(-1);
  if (last?.type !== "text") return;
  last.text = last.text.replace(/[\t ]+$/u, "");
  if (!last.text) content.pop();
}

function sameMarks(left?: WriterMark[], right?: WriterMark[]) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}
