import {
  WRITER_SCHEMA_VERSION,
  blockText,
  type WriterBlock,
  type WriterDocument,
  type WriterSnapshot,
} from "./document.ts";

const FDX_TYPES: Partial<Record<WriterBlock["attrs"]["kind"], string>> = {
  sceneHeading: "Scene Heading",
  action: "Action",
  character: "Character",
  dialogue: "Dialogue",
  parenthetical: "Parenthetical",
  transition: "Transition",
};

export function createWriterBackup(snapshot: WriterSnapshot) {
  return JSON.stringify(
    {
      format: "filmatta-writer-backup",
      formatVersion: 1,
      schemaVersion: WRITER_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      title: snapshot.title,
      document: snapshot.document,
    },
    null,
    2,
  );
}

export function createBasicFdx(snapshot: WriterSnapshot) {
  const paragraphs = snapshot.document.content.flatMap((block) => {
    const type = FDX_TYPES[block.attrs.kind];
    if (!type) return [];
    const nodes = block.content ?? [];
    const textNodes = nodes.length
      ? nodes.map((node) => {
          if (node.type === "hardBreak") return "<Text>\n</Text>";
          const styles = (node.marks ?? [])
            .map((mark) => ({ bold: "Bold", italic: "Italic", underline: "Underline" })[mark.type])
            .filter(Boolean)
            .join("+");
          return `<Text${styles ? ` Style="${styles}"` : ""}>${escapeXml(node.text)}</Text>`;
        })
      : ["<Text></Text>"];
    return [`    <Paragraph Type="${type}">${textNodes.join("")}</Paragraph>`];
  });

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="1">',
    "  <Content>",
    ...paragraphs,
    "  </Content>",
    "</FinalDraft>",
    "",
  ].join("\n");
}

export function writerFileStem(title: string) {
  const stem = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return stem || "guion";
}

export function plainDocumentText(document: WriterDocument) {
  return document.content.map(blockText).join("\n");
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
