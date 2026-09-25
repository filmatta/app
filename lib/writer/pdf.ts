import {
  WRITER_SCHEMA_VERSION,
  blockText,
  validateWriterDocument,
  type ScreenplayKind,
  type WriterBlock,
  type WriterMark,
  type WriterSnapshot,
} from "./document.ts";

export const WRITER_PDF_FONT_SIZE = 12;
export const WRITER_PDF_LINE_HEIGHT = 14.4;

export type WriterPdfPaperSize = "LETTER" | "A4";

export type WriterPdfOptions = {
  includeCover: boolean;
  title: string;
  authors: string;
  version: string;
  contact: string;
  paperSize: WriterPdfPaperSize;
};

export type WriterPdfGeneratedMarker = "dialogue-more" | "dialogue-continuation";

export type WriterPdfRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type WriterPdfPageItem = {
  sourceBlockId: string | null;
  kind: Exclude<ScreenplayKind, "authorNote">;
  generated: WriterPdfGeneratedMarker | null;
  x: number;
  y: number;
  width: number;
  align: "left" | "center" | "right";
  runs: WriterPdfRun[];
};

export type WriterPdfBodyPage = {
  number: number;
  items: WriterPdfPageItem[];
};

export type WriterPdfPaper = {
  width: number;
  height: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
};

export type WriterPdfLayout = {
  paper: WriterPdfPaper;
  pages: WriterPdfBodyPage[];
  sourceBlockIds: string[];
  excludedAuthorNotes: number;
  generatedMarkers: number;
};

type StyledCharacter = {
  value: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

type WrappedLine = {
  sourceBlockId: string;
  kind: Exclude<ScreenplayKind, "authorNote">;
  runs: WriterPdfRun[];
};

type DialogueGroup = {
  character: WriterBlock;
  parenthetical: WriterBlock | null;
  dialogue: WriterBlock;
};

const PAPER_SPECS: Record<WriterPdfPaperSize, WriterPdfPaper> = {
  LETTER: {
    width: 612,
    height: 792,
    marginLeft: 108,
    marginRight: 72,
    marginTop: 72,
    marginBottom: 72,
  },
  A4: {
    width: 595.28,
    height: 841.89,
    marginLeft: 108,
    marginRight: 72,
    marginTop: 72,
    marginBottom: 72,
  },
};

const WINDOWS_1252_EXTRA = new Set([
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192,
  0x02c6, 0x02dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c,
  0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039,
  0x203a, 0x20ac, 0x2122,
]);

const MARK_FLAGS: Record<WriterMark["type"], keyof Omit<StyledCharacter, "value">> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
};

export function defaultWriterPdfOptions(title: string): WriterPdfOptions {
  return {
    includeCover: true,
    title,
    authors: "",
    version: "",
    contact: "",
    paperSize: "LETTER",
  };
}

export function captureWriterPdfSnapshot(
  snapshot: WriterSnapshot,
  exportTitle: string,
): WriterSnapshot {
  const cloned = JSON.parse(JSON.stringify(snapshot)) as WriterSnapshot;
  const validated = validateWriterDocument(cloned.document);
  if (!validated.ok || cloned.schemaVersion !== WRITER_SCHEMA_VERSION) {
    throw new Error(validated.ok ? "La versión del guion no es compatible con esta exportación." : validated.reason);
  }
  const title = exportTitle.trim();
  if (!title) throw new Error("Escribe un título para la exportación.");
  return {
    title,
    document: validated.document,
    schemaVersion: cloned.schemaVersion,
  };
}

export function validateWriterPdfInput(snapshot: WriterSnapshot, options: WriterPdfOptions) {
  const validated = validateWriterDocument(snapshot.document);
  if (!validated.ok || snapshot.schemaVersion !== WRITER_SCHEMA_VERSION) {
    throw new Error(validated.ok ? "La versión del guion no es compatible con esta exportación." : validated.reason);
  }

  const exportableBlocks = snapshot.document.content.filter(
    (block) => block.attrs.kind !== "authorNote" && blockText(block).trim().length > 0,
  );
  if (exportableBlocks.length === 0) {
    const notes = snapshot.document.content.some(
      (block) => block.attrs.kind === "authorNote" && blockText(block).trim().length > 0,
    );
    throw new Error(notes
      ? "El guion sólo contiene notas del autor. Las notas se conservan en JSON, pero no forman parte del PDF de lectura."
      : "El guion no contiene texto exportable para generar un PDF.");
  }

  const textToCheck = [snapshot.title];
  for (const block of exportableBlocks) textToCheck.push(blockText(block));
  if (options.includeCover) {
    textToCheck.push(options.authors, options.version, options.contact);
  }
  assertScreenplayFontCoverage(textToCheck.join("\n"));
}

export function layoutWriterPdf(
  snapshot: WriterSnapshot,
  options: WriterPdfOptions,
): WriterPdfLayout {
  validateWriterPdfInput(snapshot, options);
  const paper = PAPER_SPECS[options.paperSize];
  const paginator = new ScreenplayPaginator(paper);
  const sourceBlockIds: string[] = [];
  let excludedAuthorNotes = 0;

  for (let index = 0; index < snapshot.document.content.length;) {
    const block = snapshot.document.content[index];
    if (block.attrs.kind === "authorNote") {
      if (blockText(block).length > 0) excludedAuthorNotes += 1;
      index += 1;
      continue;
    }
    if (!blockText(block).trim()) {
      index += 1;
      continue;
    }

    if (block.attrs.kind === "character") {
      const group = readDialogueGroup(snapshot.document.content, index);
      if (group) {
        sourceBlockIds.push(group.character.attrs.id);
        if (group.parenthetical) sourceBlockIds.push(group.parenthetical.attrs.id);
        sourceBlockIds.push(group.dialogue.attrs.id);
        paginator.addDialogue(group);
        index += group.parenthetical ? 3 : 2;
        continue;
      }
    }

    sourceBlockIds.push(block.attrs.id);
    paginator.addBlock(block as WriterBlock & { attrs: { id: string; kind: Exclude<ScreenplayKind, "authorNote"> } });
    index += 1;
  }

  return {
    paper,
    pages: paginator.pages,
    sourceBlockIds,
    excludedAuthorNotes,
    generatedMarkers: paginator.generatedMarkers,
  };
}

export function writerPdfPageSize(size: WriterPdfPaperSize) {
  return { ...PAPER_SPECS[size] };
}

export function assertScreenplayFontCoverage(value: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const supported = character === "\n" || character === "\r" || character === "\t"
      || (codePoint >= 0x20 && codePoint <= 0x7e)
      || (codePoint >= 0xa0 && codePoint <= 0xff)
      || WINDOWS_1252_EXTRA.has(codePoint);
    if (!supported) {
      throw new Error(
        `El carácter “${character}” (U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}) no está cubierto por la fuente monoespaciada de esta exportación. Sustitúyelo antes de generar el PDF; el guion guardado no fue modificado.`,
      );
    }
  }
}

class ScreenplayPaginator {
  readonly pages: WriterPdfBodyPage[] = [{ number: 1, items: [] }];
  generatedMarkers = 0;
  private readonly paper: WriterPdfPaper;
  private y: number;

  constructor(paper: WriterPdfPaper) {
    this.paper = paper;
    this.y = paper.marginTop;
  }

  addBlock(block: WriterBlock & { attrs: { id: string; kind: Exclude<ScreenplayKind, "authorNote"> } }) {
    const lines = wrapBlock(block, columnsForKind(block.attrs.kind, this.paper));
    if (!lines.length) return;
    const gap = gapBefore(block.attrs.kind);
    const presenceAhead = block.attrs.kind === "sceneHeading" ? 2 : block.attrs.kind === "character" || block.attrs.kind === "parenthetical" ? 1 : 0;
    this.addBreakableLines(lines, gap, presenceAhead);
  }

  addDialogue(group: DialogueGroup) {
    const characterLines = wrapBlock(group.character, columnsForKind("character", this.paper));
    const parentheticalLines = group.parenthetical
      ? wrapBlock(group.parenthetical, columnsForKind("parenthetical", this.paper))
      : [];
    const dialogueLines = wrapBlock(group.dialogue, columnsForKind("dialogue", this.paper));
    if (!dialogueLines.length) {
      this.addBreakableLines([...characterLines, ...parentheticalLines], gapBefore("character"), 0);
      return;
    }

    const minimumDialogueLines = Math.min(2, dialogueLines.length);
    const preludeLines = characterLines.length + parentheticalLines.length;
    this.ensureSpace(preludeLines + minimumDialogueLines, gapBefore("character"));
    this.applyGap(gapBefore("character"));

    for (const line of characterLines) this.placeSourceLine(line);
    for (const line of parentheticalLines) {
      if (this.availableLines() <= minimumDialogueLines) {
        this.newPage();
      }
      this.placeSourceLine(line);
    }

    let cursor = 0;
    while (cursor < dialogueLines.length) {
      let available = this.availableLines();
      const remaining = dialogueLines.length - cursor;
      if (available <= 0) {
        this.newPage();
        this.placeContinuationCharacter(group.character);
        available = this.availableLines();
      }

      const willContinue = remaining > available;
      let take = willContinue ? Math.max(0, available - 1) : remaining;
      if (remaining - take === 1 && take > 2) take -= 1;
      if (take < Math.min(2, remaining) && !this.isPageEmpty()) {
        this.newPage();
        this.placeContinuationCharacter(group.character);
        continue;
      }
      if (take === 0) {
        this.newPage();
        this.placeContinuationCharacter(group.character);
        continue;
      }

      for (const line of dialogueLines.slice(cursor, cursor + take)) this.placeSourceLine(line);
      cursor += take;
      if (cursor < dialogueLines.length) {
        this.placeGeneratedLine("(MORE)", "parenthetical", "dialogue-more");
        this.newPage();
        this.placeContinuationCharacter(group.character);
      }
    }
  }

  private addBreakableLines(
    lines: WrappedLine[],
    gap: number,
    presenceAhead: number,
  ) {
    this.ensureSpace(Math.min(lines.length, 2) + presenceAhead, gap);
    this.applyGap(gap);
    let cursor = 0;
    while (cursor < lines.length) {
      let available = this.availableLines();
      if (available <= 0) {
        this.newPage();
        available = this.availableLines();
      }
      const remaining = lines.length - cursor;
      if (remaining > available && available < 2 && !this.isPageEmpty()) {
        this.newPage();
        continue;
      }
      let take = Math.min(remaining, available);
      if (remaining - take === 1 && take > 1) take -= 1;
      for (const line of lines.slice(cursor, cursor + take)) this.placeSourceLine(line);
      cursor += take;
      if (cursor < lines.length) this.newPage();
    }
  }

  private ensureSpace(lineCount: number, gap: number) {
    const required = lineCount * WRITER_PDF_LINE_HEIGHT + (this.isPageEmpty() ? 0 : gap);
    if (this.paper.height - this.paper.marginBottom - this.y < required && !this.isPageEmpty()) {
      this.newPage();
    }
  }

  private applyGap(gap: number) {
    if (this.isPageEmpty()) return;
    if (this.y + gap + WRITER_PDF_LINE_HEIGHT > this.paper.height - this.paper.marginBottom) {
      this.newPage();
      return;
    }
    this.y += gap;
  }

  private placeSourceLine(line: WrappedLine) {
    if (this.availableLines() <= 0) this.newPage();
    const placement = placementForKind(line.kind, this.paper);
    this.currentPage().items.push({
      sourceBlockId: line.sourceBlockId,
      kind: line.kind,
      generated: null,
      x: placement.x,
      y: this.y,
      width: placement.width,
      align: placement.align,
      runs: line.runs,
    });
    this.y += WRITER_PDF_LINE_HEIGHT;
  }

  private placeContinuationCharacter(character: WriterBlock) {
    const name = blockText(character).trim().replace(/\s+/gu, " ");
    const text = name ? `${name} (CONT'D)` : `(CONT'D)`;
    for (const runs of wrapPlainText(text, columnsForKind("character", this.paper))) {
      this.placeGeneratedRuns(runs, "character", "dialogue-continuation");
    }
  }

  private placeGeneratedLine(
    text: string,
    kind: Exclude<ScreenplayKind, "authorNote">,
    generated: WriterPdfGeneratedMarker,
  ) {
    for (const runs of wrapPlainText(text, columnsForKind(kind, this.paper))) {
      this.placeGeneratedRuns(runs, kind, generated);
    }
  }

  private placeGeneratedRuns(
    runs: WriterPdfRun[],
    kind: Exclude<ScreenplayKind, "authorNote">,
    generated: WriterPdfGeneratedMarker,
  ) {
    if (this.availableLines() <= 0) this.newPage();
    const placement = placementForKind(kind, this.paper);
    this.currentPage().items.push({
      sourceBlockId: null,
      kind,
      generated,
      x: placement.x,
      y: this.y,
      width: placement.width,
      align: placement.align,
      runs,
    });
    this.generatedMarkers += 1;
    this.y += WRITER_PDF_LINE_HEIGHT;
  }

  private availableLines() {
    return Math.floor((this.paper.height - this.paper.marginBottom - this.y + 0.01) / WRITER_PDF_LINE_HEIGHT);
  }

  private isPageEmpty() {
    return this.currentPage().items.length === 0;
  }

  private currentPage() {
    return this.pages[this.pages.length - 1];
  }

  private newPage() {
    if (this.isPageEmpty()) {
      this.y = this.paper.marginTop;
      return;
    }
    this.pages.push({ number: this.pages.length + 1, items: [] });
    this.y = this.paper.marginTop;
  }
}

function readDialogueGroup(blocks: WriterBlock[], index: number): DialogueGroup | null {
  const character = blocks[index];
  const next = blocks[index + 1];
  if (!next) return null;
  if (next.attrs.kind === "dialogue" && blockText(next).trim()) {
    return { character, parenthetical: null, dialogue: next };
  }
  const dialogue = blocks[index + 2];
  if (next.attrs.kind === "parenthetical" && dialogue?.attrs.kind === "dialogue" && blockText(dialogue).trim()) {
    return { character, parenthetical: next, dialogue };
  }
  return null;
}

function wrapBlock(block: WriterBlock, columns: number): WrappedLine[] {
  const paragraphs = blockParagraphs(block);
  const kind = block.attrs.kind as Exclude<ScreenplayKind, "authorNote">;
  return paragraphs.flatMap((paragraph) => wrapCharacters(paragraph, columns).map((runs) => ({
    sourceBlockId: block.attrs.id,
    kind,
    runs,
  })));
}

function blockParagraphs(block: WriterBlock): StyledCharacter[][] {
  const paragraphs: StyledCharacter[][] = [[]];
  for (const node of block.content ?? []) {
    if (node.type === "hardBreak") {
      paragraphs.push([]);
      continue;
    }
    const flags = { bold: false, italic: false, underline: false };
    for (const mark of node.marks ?? []) flags[MARK_FLAGS[mark.type]] = true;
    for (const value of node.text.replaceAll("\t", "    ")) {
      paragraphs[paragraphs.length - 1].push({ value, ...flags });
    }
  }
  return paragraphs;
}

function wrapCharacters(characters: StyledCharacter[], columns: number): WriterPdfRun[][] {
  if (!characters.length) return [[emptyRun()]];
  const lines: WriterPdfRun[][] = [];
  let cursor = 0;
  while (cursor < characters.length) {
    let end = Math.min(cursor + columns, characters.length);
    if (end < characters.length) {
      let whitespace = -1;
      for (let index = end - 1; index >= cursor; index -= 1) {
        if (/\s/u.test(characters[index].value)) {
          whitespace = index;
          break;
        }
      }
      if (whitespace >= cursor) end = whitespace + 1;
    }
    lines.push(charactersToRuns(characters.slice(cursor, end)));
    cursor = end;
  }
  return lines;
}

function wrapPlainText(text: string, columns: number) {
  const characters = [...text].map((value) => ({
    value,
    bold: false,
    italic: false,
    underline: false,
  }));
  return wrapCharacters(characters, columns);
}

function charactersToRuns(characters: StyledCharacter[]): WriterPdfRun[] {
  if (!characters.length) return [emptyRun()];
  const runs: WriterPdfRun[] = [];
  for (const character of characters) {
    const previous = runs.at(-1);
    if (previous
      && previous.bold === character.bold
      && previous.italic === character.italic
      && previous.underline === character.underline) {
      previous.text += character.value;
    } else {
      runs.push({
        text: character.value,
        bold: character.bold,
        italic: character.italic,
        underline: character.underline,
      });
    }
  }
  return runs;
}

function emptyRun(): WriterPdfRun {
  return { text: " ", bold: false, italic: false, underline: false };
}

function placementForKind(
  kind: Exclude<ScreenplayKind, "authorNote">,
  paper: WriterPdfPaper,
) {
  const bodyWidth = paper.width - paper.marginLeft - paper.marginRight;
  if (kind === "character") {
    return { x: paper.marginLeft + 158.4, width: Math.min(172.8, bodyWidth - 158.4), align: "left" as const };
  }
  if (kind === "dialogue") {
    return { x: paper.marginLeft + 72, width: Math.min(252, bodyWidth - 72), align: "left" as const };
  }
  if (kind === "parenthetical") {
    return { x: paper.marginLeft + 115.2, width: Math.min(158.4, bodyWidth - 115.2), align: "left" as const };
  }
  if (kind === "transition") {
    return { x: paper.marginLeft, width: bodyWidth, align: "right" as const };
  }
  return { x: paper.marginLeft, width: bodyWidth, align: "left" as const };
}

function columnsForKind(kind: Exclude<ScreenplayKind, "authorNote">, paper: WriterPdfPaper) {
  return Math.max(1, Math.floor(placementForKind(kind, paper).width / (WRITER_PDF_FONT_SIZE * 0.6)));
}

function gapBefore(kind: Exclude<ScreenplayKind, "authorNote">) {
  if (kind === "sceneHeading") return 24;
  if (kind === "character" || kind === "transition") return 12;
  if (kind === "action") return 12;
  return 0;
}
