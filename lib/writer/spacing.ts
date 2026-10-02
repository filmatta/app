import { blockText, type WriterDocument } from "./document.ts";

export function redundantWriterBlankBlockIds(
  document: WriterDocument,
  blockIds?: readonly string[],
) {
  const scope = blockIds ? new Set(blockIds) : null;
  const redundant: string[] = [];
  let blankRun = 0;
  for (const block of document.content) {
    if (scope && !scope.has(block.attrs.id)) {
      blankRun = 0;
      continue;
    }
    const presentationBlank = block.attrs.kind === "action" && !blockText(block).trim();
    if (!presentationBlank) {
      blankRun = 0;
      continue;
    }
    blankRun += 1;
    if (blankRun > 1) redundant.push(block.attrs.id);
  }
  return redundant;
}

export function countRedundantWriterBlankBlocks(
  document: WriterDocument,
  blockIds?: readonly string[],
) {
  return redundantWriterBlankBlockIds(document, blockIds).length;
}
