export const WRITER_SCHEMA_VERSION = 1;
export const WRITER_MAX_DOCUMENT_BYTES = 2_000_000;
export const WRITER_MAX_BLOCKS = 10_000;
export const WRITER_MAX_DEPTH = 40;
export const WRITER_MAX_TITLE_LENGTH = 160;

export const SCREENPLAY_KINDS = [
  "sceneHeading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "authorNote",
] as const;

export type ScreenplayKind = (typeof SCREENPLAY_KINDS)[number];

export type WriterMark = { type: "bold" | "italic" | "underline" };
export type WriterInlineNode =
  | { type: "text"; text: string; marks?: WriterMark[] }
  | { type: "hardBreak" };

export type WriterBlock = {
  type: "screenplayBlock";
  attrs: { id: string; kind: ScreenplayKind };
  content?: WriterInlineNode[];
};

export type WriterDocument = {
  type: "doc";
  content: WriterBlock[];
};

export type WriterSnapshot = {
  title: string;
  document: WriterDocument;
  schemaVersion: number;
};

export type SceneSummary = {
  id: string;
  order: number;
  title: string;
};

export type CharacterSummary = {
  key: string;
  name: string;
  occurrences: number;
};

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kindSet = new Set<string>(SCREENPLAY_KINDS);
const markSet = new Set(["bold", "italic", "underline"]);

export function createEmptyWriterDocument(): WriterDocument {
  return {
    type: "doc",
    content: [
      createBlock("sceneHeading"),
      createBlock("action"),
    ],
  };
}

export function createBlock(
  kind: ScreenplayKind,
  text = "",
  id = crypto.randomUUID(),
): WriterBlock {
  return {
    type: "screenplayBlock",
    attrs: { id, kind },
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

export function normalizeWriterTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ");
  if (!title || title.length > WRITER_MAX_TITLE_LENGTH) return null;
  return title;
}

export function validateWriterDocument(value: unknown):
  | { ok: true; document: WriterDocument; bytes: number; blocks: number }
  | { ok: false; reason: string } {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, reason: "El documento no puede serializarse." };
  }
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > WRITER_MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: "El documento supera el límite de 2 MB." };
  }
  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content)) {
    return { ok: false, reason: "La raíz del documento no es compatible." };
  }
  if (value.content.length > WRITER_MAX_BLOCKS) {
    return { ok: false, reason: "El documento supera 10,000 bloques." };
  }
  const ids = new Set<string>();
  for (const block of value.content) {
    if (!isRecord(block) || block.type !== "screenplayBlock") {
      return { ok: false, reason: "El documento contiene un bloque desconocido." };
    }
    if (!isRecord(block.attrs)) {
      return { ok: false, reason: "Un bloque no tiene atributos válidos." };
    }
    const { id, kind } = block.attrs;
    if (typeof id !== "string" || !ID_PATTERN.test(id) || ids.has(id)) {
      return { ok: false, reason: "El documento contiene identificadores inválidos o repetidos." };
    }
    ids.add(id);
    if (typeof kind !== "string" || !kindSet.has(kind)) {
      return { ok: false, reason: "El documento contiene un tipo de bloque desconocido." };
    }
    if (block.content !== undefined) {
      if (!Array.isArray(block.content)) {
        return { ok: false, reason: "El contenido de un bloque no es válido." };
      }
      for (const inline of block.content) {
        if (!isRecord(inline) || (inline.type !== "text" && inline.type !== "hardBreak")) {
          return { ok: false, reason: "El documento contiene contenido inline desconocido." };
        }
        if (inline.type === "text") {
          if (typeof inline.text !== "string") {
            return { ok: false, reason: "El texto de un bloque no es válido." };
          }
          if (inline.marks !== undefined) {
            if (!Array.isArray(inline.marks)) {
              return { ok: false, reason: "El formato inline no es válido." };
            }
            for (const mark of inline.marks) {
              if (!isRecord(mark) || typeof mark.type !== "string" || !markSet.has(mark.type)) {
                return { ok: false, reason: "El documento contiene formato inline desconocido." };
              }
            }
          }
        }
      }
    }
  }
  if (measureDepth(value) > WRITER_MAX_DEPTH) {
    return { ok: false, reason: "El documento supera la profundidad permitida." };
  }
  return {
    ok: true,
    document: value as WriterDocument,
    bytes,
    blocks: value.content.length,
  };
}

export function blockText(block: WriterBlock): string {
  return (block.content ?? [])
    .map((node) => (node.type === "text" ? node.text : "\n"))
    .join("");
}

export function deriveScenes(document: WriterDocument): SceneSummary[] {
  const scenes: SceneSummary[] = [];
  for (const block of document.content) {
    if (block.attrs.kind !== "sceneHeading") continue;
    scenes.push({
      id: block.attrs.id,
      order: scenes.length + 1,
      title: blockText(block).trim() || "Escena sin encabezado",
    });
  }
  return scenes;
}

export function deriveCharacters(document: WriterDocument): CharacterSummary[] {
  const characters = new Map<string, CharacterSummary>();
  for (const block of document.content) {
    if (block.attrs.kind !== "character") continue;
    const name = blockText(block).trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.normalize("NFKC").toLocaleUpperCase("es-MX");
    const current = characters.get(key);
    if (current) current.occurrences += 1;
    else characters.set(key, { key, name, occurrences: 1 });
  }
  return [...characters.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  );
}

export function countDocumentWords(document: WriterDocument): number {
  const text = document.content.map(blockText).join(" ").trim();
  return text ? text.split(/\s+/u).length : 0;
}

export function rekeyWriterDocument(document: WriterDocument): WriterDocument {
  return {
    type: "doc",
    content: document.content.map((block) => ({
      ...block,
      attrs: { ...block.attrs, id: crypto.randomUUID() },
      content: block.content?.map((node) => ({
        ...node,
        ...(node.type === "text" && node.marks
          ? { marks: node.marks.map((mark) => ({ ...mark })) }
          : {}),
      })),
    })),
  };
}

function measureDepth(value: unknown, depth = 0): number {
  if (depth > WRITER_MAX_DEPTH) return depth;
  if (Array.isArray(value)) {
    return value.reduce<number>((max, item) => Math.max(max, measureDepth(item, depth + 1)), depth);
  }
  if (isRecord(value)) {
    return Object.values(value).reduce<number>(
      (max, item) => Math.max(max, measureDepth(item, depth + 1)),
      depth,
    );
  }
  return depth;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
