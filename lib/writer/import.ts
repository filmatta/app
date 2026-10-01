import {
  SCREENPLAY_KINDS,
  WRITER_MAX_BLOCKS,
  createBlock,
  type ScreenplayKind,
  type WriterDocument,
} from "./document.ts";

export const WRITER_IMPORT_MAX_FILE_BYTES = 5_000_000;
export const WRITER_IMPORT_MAX_TEXT_CHARACTERS = 1_500_000;

export type WriterImportConfidence = "high" | "medium" | "review";
export type WriterImportFormat = "pasted" | "txt" | "fdx";

export type WriterImportSource = {
  format: WriterImportFormat;
  name: string;
  extractedText: string;
  significantCharacters: number;
  words: number;
};

export type WriterImportBlock = {
  id: string;
  originalText: string;
  sourceStartLine: number;
  sourceEndLine: number;
  proposedKind: ScreenplayKind | null;
  confidence: WriterImportConfidence;
  signals: string[];
  sourceType?: string;
};

export type WriterImportStaging = {
  source: WriterImportSource;
  suggestedTitle: string;
  blocks: WriterImportBlock[];
};

export type WriterImportAdapter = {
  format: "docx" | "pdf";
  implemented: false;
  reason: string;
};

export const PENDING_WRITER_IMPORT_ADAPTERS: readonly WriterImportAdapter[] = [
  {
    format: "docx",
    implemented: false,
    reason: "No hay un extractor DOCX local en el bundle actual.",
  },
  {
    format: "pdf",
    implemented: false,
    reason: "No hay un extractor PDF de texto local separado del renderer de exportación.",
  },
] as const;

const KIND_SET = new Set<string>(SCREENPLAY_KINDS);
const SCENE_HEADING = /^(?:INT\.?|EXT\.?|INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?)\s+\S/iu;
const TRANSITIONS = new Set([
  "FADE IN:",
  "FADE OUT:",
  "FADE OUT.",
  "CUT TO:",
  "CORTE A:",
  "DISSOLVE TO:",
  "FADE TO BLACK:",
  "FADE TO BLACK.",
]);
const EXPLICIT_AUTHOR_NOTE = /^\[\[\s*(?:NOTA\s+(?:DEL|DE)\s+AUTOR|AUTHOR\s+NOTE)\s*:\s*\S[\s\S]*\]\]$/iu;

const FDX_KIND_MAP: Readonly<Record<string, ScreenplayKind>> = {
  "scene heading": "sceneHeading",
  action: "action",
  character: "character",
  dialogue: "dialogue",
  parenthetical: "parenthetical",
  transition: "transition",
  "script note": "authorNote",
  note: "authorNote",
};

export function analyzePastedWriterText(text: string, title = "Borrador importado") {
  return analyzePlainText(text, {
    format: "pasted",
    name: "Texto pegado",
    suggestedTitle: title,
  });
}

export function analyzeWriterTxt(text: string, fileName: string) {
  if (/\u0000/u.test(text)) throw new Error("El archivo no parece contener texto legible.");
  return analyzePlainText(text, {
    format: "txt",
    name: fileName,
    suggestedTitle: titleFromFileName(fileName),
  });
}

export function analyzeWriterFdx(xml: string, fileName: string): WriterImportStaging {
  validateExtractedTextSize(xml);
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) {
    throw new Error("El FDX contiene declaraciones XML no permitidas.");
  }
  if (!/<FinalDraft\b[^>]*>/iu.test(xml) || !/<\/FinalDraft\s*>/iu.test(xml)) {
    throw new Error("El archivo FDX está dañado o no tiene una raíz FinalDraft válida.");
  }

  const paragraphPattern = /<Paragraph\b([^>]*)>([\s\S]*?)<\/Paragraph\s*>/giu;
  const blocks: WriterImportBlock[] = [];
  let match: RegExpExecArray | null;
  while ((match = paragraphPattern.exec(xml)) !== null) {
    const sourceType = readXmlAttribute(match[1], "Type") ?? "Sin tipo";
    const originalText = extractFdxParagraphText(match[2]);
    if (!originalText.trim()) {
      continue;
    }
    const proposedKind = FDX_KIND_MAP[sourceType.trim().toLocaleLowerCase("en-US")] ?? null;
    const sourceStartLine = xml.slice(0, match.index).split(/\r?\n/u).length;
    const sourceEndLine = sourceStartLine + match[0].split(/\r?\n/u).length - 1;
    blocks.push({
      id: crypto.randomUUID(),
      originalText,
      sourceStartLine,
      sourceEndLine,
      proposedKind,
      confidence: proposedKind ? "high" : "review",
      signals: proposedKind
        ? [`FDX declara explícitamente el tipo “${sourceType}”.`]
        : [`FDX declara “${sourceType}”, sin equivalencia canónica automática.`],
      sourceType,
    });
  }
  if (!blocks.length) throw new Error("El FDX no contiene párrafos de guion legibles.");
  enforceBlockLimit(blocks.length);
  const extractedText = blocks.map((block) => block.originalText).join("\n");
  return {
    source: buildSource("fdx", fileName, extractedText),
    suggestedTitle: titleFromFileName(fileName),
    blocks,
  };
}

export function writerImportToDocument(blocks: readonly WriterImportBlock[]): WriterDocument {
  if (!blocks.length) throw new Error("No hay texto para importar.");
  enforceBlockLimit(blocks.length);
  const unresolved = blocks.filter((block) => !block.proposedKind);
  if (unresolved.length) {
    throw new Error(`Quedan ${unresolved.length} elementos por revisar.`);
  }
  const unconfirmed = blocks.filter((block) => block.confidence !== "high");
  if (unconfirmed.length) {
    throw new Error(`Quedan ${unconfirmed.length} propuestas ambiguas por confirmar.`);
  }
  return {
    type: "doc",
    content: blocks.map((block) => createBlock(block.proposedKind!, block.originalText)),
  };
}

export function changeWriterImportKind(
  blocks: readonly WriterImportBlock[],
  ids: ReadonlySet<string>,
  kind: ScreenplayKind,
) {
  if (!KIND_SET.has(kind)) throw new Error("El tipo seleccionado no es compatible con Writer.");
  return blocks.map((block) => ids.has(block.id)
    ? {
      ...block,
      proposedKind: kind,
      confidence: "high" as const,
      signals: [...block.signals, "Tipo confirmado manualmente durante la revisión."],
    }
    : block);
}

export function writerImportPreservesSignificantText(staging: WriterImportStaging) {
  const represented = staging.blocks.map((block) => block.originalText).join("\n");
  return significantCharacterCount(represented) === staging.source.significantCharacters
    && wordCount(represented) === staging.source.words;
}

export function writerImportSummary(blocks: readonly WriterImportBlock[]) {
  const byKind = Object.fromEntries(SCREENPLAY_KINDS.map((kind) => [kind, 0])) as Record<ScreenplayKind, number>;
  const characterNames = new Set<string>();
  let unresolved = 0;
  let needsReview = 0;
  for (const block of blocks) {
    if (block.proposedKind) byKind[block.proposedKind] += 1;
    else unresolved += 1;
    if (block.proposedKind === "character") {
      const name = block.originalText.trim().replace(/\s+/gu, " ");
      if (name) characterNames.add(name.normalize("NFKC").toLocaleUpperCase("es-MX"));
    }
    if (block.confidence !== "high" || !block.proposedKind) needsReview += 1;
  }
  return {
    byKind,
    distinctCharacterNames: characterNames.size,
    possibleActionCharacters: 0,
    unresolved,
    needsReview,
    total: blocks.length,
  };
}

export function validateWriterImportFile(file: { name: string; size: number; type: string }) {
  if (file.size <= 0) throw new Error("El archivo está vacío.");
  if (file.size > WRITER_IMPORT_MAX_FILE_BYTES) throw new Error("El archivo supera el límite de 5 MB.");
  const extension = file.name.split(".").at(-1)?.toLocaleLowerCase("en-US") ?? "";
  if (extension !== "txt" && extension !== "fdx") {
    throw new Error("Este formato todavía no está disponible. Usa texto pegado, TXT o FDX.");
  }
  const mime = file.type.toLocaleLowerCase("en-US");
  if (!mime) return extension as "txt" | "fdx";
  const valid = extension === "txt"
    ? mime === "text/plain"
    : ["application/xml", "text/xml", "application/octet-stream", "application/vnd.finaldraft"].includes(mime);
  if (!valid) throw new Error("El tipo real del archivo no coincide con su extensión.");
  return extension as "txt" | "fdx";
}

function analyzePlainText(
  text: string,
  input: { format: "pasted" | "txt"; name: string; suggestedTitle: string },
): WriterImportStaging {
  validateExtractedTextSize(text);
  const normalized = text.replace(/\r\n?/gu, "\n");
  const lines = normalized.split("\n");
  const blocks: WriterImportBlock[] = [];
  let dialogueContext = false;

  for (let index = 0; index < lines.length; index += 1) {
    const originalText = lines[index];
    const trimmed = originalText.trim();
    if (!trimmed) {
      dialogueContext = false;
      continue;
    }
    const previousBlank = index === 0 || !lines[index - 1].trim();
    const nextIndex = nextNonEmptyLine(lines, index + 1);
    const nextText = nextIndex === -1 ? "" : lines[nextIndex].trim();
    const classification = classifyPlainTextLine({
      text: originalText,
      trimmed,
      previousBlank,
      nextText,
      dialogueContext,
    });
    blocks.push({
      id: crypto.randomUUID(),
      originalText,
      sourceStartLine: index + 1,
      sourceEndLine: index + 1,
      ...classification,
    });
    dialogueContext = classification.proposedKind === "character"
      || classification.proposedKind === "parenthetical"
      || (classification.proposedKind === "dialogue" && !previousBlank);
    if (["sceneHeading", "action", "transition", null].includes(classification.proposedKind)) {
      dialogueContext = false;
    }
  }

  if (!blocks.length) throw new Error("No encontramos texto significativo para analizar.");
  enforceBlockLimit(blocks.length);
  return {
    // Keep the complete extracted source, including blank lines and indentation.
    // Staging blocks carry the meaningful lines plus their original line numbers.
    source: buildSource(input.format, input.name, normalized),
    suggestedTitle: input.suggestedTitle,
    blocks,
  };
}

function classifyPlainTextLine(input: {
  text: string;
  trimmed: string;
  previousBlank: boolean;
  nextText: string;
  dialogueContext: boolean;
}): Pick<WriterImportBlock, "proposedKind" | "confidence" | "signals"> {
  const { text, trimmed, previousBlank, nextText, dialogueContext } = input;
  const normalizedUpper = trimmed.normalize("NFKC").toLocaleUpperCase("es-MX");
  if (SCENE_HEADING.test(trimmed)) {
    return {
      proposedKind: "sceneHeading",
      confidence: "high",
      signals: ["Prefijo explícito de encabezado de escena al inicio de la línea."],
    };
  }
  if (TRANSITIONS.has(normalizedUpper)) {
    return {
      proposedKind: "transition",
      confidence: "high",
      signals: ["Coincidencia exacta con una transición reconocida por Writer."],
    };
  }
  if (!dialogueContext && previousBlank && EXPLICIT_AUTHOR_NOTE.test(trimmed)) {
    return {
      proposedKind: "authorNote",
      confidence: "high",
      signals: ["Marcador explícito y aislado de nota del autor."],
    };
  }
  if (dialogueContext && /^\([^\n]+\)$/u.test(trimmed)) {
    return {
      proposedKind: "parenthetical",
      confidence: "high",
      signals: ["Paréntesis inmediatamente dentro de un turno de diálogo."],
    };
  }
  if (dialogueContext) {
    return {
      proposedKind: "dialogue",
      confidence: "high",
      signals: ["Texto situado después de un personaje o acotación sin separación de turno."],
    };
  }

  const short = [...trimmed].length <= 42;
  const uppercase = hasLetters(trimmed) && trimmed === normalizedUpper;
  const hasTerminalSentencePunctuation = /[.!?…,:;]$/u.test(trimmed);
  const nextCanBeDialogue = Boolean(nextText)
    && !SCENE_HEADING.test(nextText)
    && !TRANSITIONS.has(nextText.normalize("NFKC").toLocaleUpperCase("es-MX"));
  if (short && uppercase && !hasTerminalSentencePunctuation && previousBlank && nextCanBeDialogue) {
    return {
      proposedKind: "character",
      confidence: "medium",
      signals: [
        "Línea corta en mayúsculas.",
        "Separada del bloque anterior y seguida de texto compatible con diálogo.",
      ],
    };
  }

  const words = wordCount(trimmed);
  const sentenceCase = /\p{Ll}/u.test(trimmed);
  const narrativePunctuation = /[.!?…,:;—-]/u.test(trimmed);
  if (sentenceCase && (words >= 3 || narrativePunctuation)) {
    return {
      proposedKind: "action",
      confidence: words >= 5 ? "high" : "medium",
      signals: ["Prosa narrativa con minúsculas y estructura de oración."],
    };
  }

  return {
    proposedKind: null,
    confidence: "review",
    signals: [
      text === trimmed ? "La posición no aporta sangría utilizable." : "La sangría aislada no basta para decidir el tipo.",
      "No hay señales combinadas suficientes para clasificar sin revisión.",
    ],
  };
}

function extractFdxParagraphText(contents: string) {
  const withBreaks = contents
    .replace(/<LineBreak\b[^>]*\/?\s*>/giu, "\n")
    .replace(/<Text\b[^>]*\/>/giu, "")
    .replace(/<Text\b[^>]*>([\s\S]*?)<\/Text\s*>/giu, (_match, text: string) => text);
  return decodeXmlEntities(withBreaks.replace(/<[^>]+>/gu, ""));
}

function readXmlAttribute(attributes: string, name: string) {
  const matcher = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "iu");
  const match = attributes.match(matcher);
  return match ? decodeXmlEntities(match[2]) : null;
}

function decodeXmlEntities(value: string) {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/giu, (entity, decimal, hex) => {
    if (decimal) return safeCodePoint(Number.parseInt(decimal, 10), entity);
    if (hex) return safeCodePoint(Number.parseInt(hex, 16), entity);
    if (entity.toLocaleLowerCase("en-US") === "&amp;") return "&";
    if (entity.toLocaleLowerCase("en-US") === "&lt;") return "<";
    if (entity.toLocaleLowerCase("en-US") === "&gt;") return ">";
    if (entity.toLocaleLowerCase("en-US") === "&quot;") return "\"";
    if (entity.toLocaleLowerCase("en-US") === "&apos;") return "'";
    return entity;
  });
}

function safeCodePoint(value: number, fallback: string) {
  try {
    return Number.isSafeInteger(value) ? String.fromCodePoint(value) : fallback;
  } catch {
    return fallback;
  }
}

function buildSource(format: WriterImportFormat, name: string, extractedText: string): WriterImportSource {
  return {
    format,
    name,
    extractedText,
    significantCharacters: significantCharacterCount(extractedText),
    words: wordCount(extractedText),
  };
}

function validateExtractedTextSize(text: string) {
  if (!text.trim()) throw new Error("No encontramos texto significativo para analizar.");
  if (text.length > WRITER_IMPORT_MAX_TEXT_CHARACTERS) {
    throw new Error("El texto supera el límite de 1,500,000 caracteres.");
  }
}

function enforceBlockLimit(count: number) {
  if (count > WRITER_MAX_BLOCKS) throw new Error("El borrador supera el límite de 10,000 bloques.");
}

function nextNonEmptyLine(lines: string[], start: number) {
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim()) return index;
  }
  return -1;
}

function titleFromFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/u, "").trim();
  return (withoutExtension || "Borrador importado").slice(0, 160);
}

function hasLetters(value: string) {
  return /\p{L}/u.test(value);
}

function significantCharacterCount(value: string) {
  return [...value].filter((character) => !/\s/u.test(character)).length;
}

function wordCount(value: string) {
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized ? normalized.split(" ").length : 0;
}
