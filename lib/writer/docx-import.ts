import JSZip from "jszip";

const MAX_ARCHIVE_ENTRIES = 1_024;
const MAX_EXPANDED_BYTES = 24_000_000;
const MAX_XML_BYTES = 8_000_000;
const MAX_COMPRESSION_RATIO = 120;

export type WriterDocxExtraction = {
  text: string;
  warnings: string[];
  paragraphs: WriterDocxParagraph[];
};

export type WriterDocxParagraph = {
  text: string;
  style: string | null;
};

export async function extractWriterDocx(buffer: ArrayBuffer): Promise<WriterDocxExtraction> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || read32(bytes, 0) !== 0x04034b50) throw new Error("El archivo no tiene una firma DOCX válida.");
  preflightZip(bytes);
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true, createFolders: false });
  const entries = Object.keys(zip.files);
  if (!entries.includes("[Content_Types].xml") || !entries.includes("word/document.xml")) {
    throw new Error("El archivo no contiene un documento Word válido.");
  }
  if (entries.some((name) => /(?:^|\/)vbaProject\.bin$|(?:^|\/)embeddings\//iu.test(name))) {
    throw new Error("El DOCX contiene macros u objetos incrustados no admitidos. Guarda una copia limpia sin contenido activo.");
  }
  const relationshipNames = entries.filter((name) => name.endsWith(".rels"));
  for (const name of relationshipNames) {
    const relationshipXml = await readBoundedText(zip, name, MAX_XML_BYTES);
    if (/TargetMode\s*=\s*["']External["']/iu.test(relationshipXml)) {
      throw new Error("El DOCX contiene enlaces externos activos. Guarda una copia sin vínculos externos.");
    }
  }
  const xml = await readBoundedText(zip, "word/document.xml", MAX_XML_BYTES);
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new Error("El DOCX contiene declaraciones XML no permitidas.");
  const warnings = docxWarnings(entries, xml);
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  if (parsed.querySelector("parsererror")) throw new Error("El contenido XML del DOCX está dañado.");
  const paragraphNodes = [...parsed.getElementsByTagNameNS("*", "p")];
  const paragraphs = paragraphNodes.map((paragraph) => ({
    text: readParagraph(paragraph),
    style: readParagraphStyle(paragraph),
  })).filter((paragraph) => paragraph.text.trim().length > 0);
  if (!paragraphs.length) throw new Error("El DOCX no contiene párrafos de texto legibles.");
  return { text: paragraphs.map((paragraph) => paragraph.text).join("\n"), warnings, paragraphs };
}

function readParagraphStyle(paragraph: Element) {
  const style = paragraph.getElementsByTagNameNS("*", "pStyle").item(0);
  return style?.getAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "val")
    ?? style?.getAttribute("w:val")
    ?? style?.getAttribute("val")
    ?? null;
}

function readParagraph(paragraph: Element) {
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const local = element.localName;
    if (local === "del" || local === "moveFrom" || local === "instrText") return;
    if (local === "t") { parts.push(element.textContent ?? ""); return; }
    if (local === "tab") { parts.push("\t"); return; }
    if (local === "br" || local === "cr") { parts.push("\n"); return; }
    for (const child of [...element.childNodes]) visit(child);
  };
  visit(paragraph);
  return parts.join("").replace(/\u00a0/gu, " ").replace(/[ \t]+\n/gu, "\n").trimEnd();
}

function docxWarnings(entries: string[], documentXml: string) {
  const warnings: string[] = [];
  if (/<w:tbl\b/iu.test(documentXml)) warnings.push("Las tablas se extrajeron como párrafos en su orden de lectura; el diseño de celdas no se conserva.");
  if (/<w:(?:ins|del|moveFrom|moveTo)\b/iu.test(documentXml)) warnings.push("El documento contiene control de cambios. Se tomó el texto visible insertado y se omitió el texto eliminado.");
  if (/<w:txbxContent\b/iu.test(documentXml)) warnings.push("El documento contiene cuadros de texto; revisa su posición en la lista antes de importar.");
  if (entries.some((name) => /^word\/(?:header|footer)\d*\.xml$/iu.test(name))) warnings.push("Encabezados y pies de página no se importaron.");
  if (entries.some((name) => /^word\/(?:comments|footnotes|endnotes)\.xml$/iu.test(name))) warnings.push("Comentarios y notas al pie/final no se importaron.");
  if (entries.some((name) => /^word\/media\//iu.test(name))) warnings.push("Las imágenes no se importaron y no se aplicó OCR.");
  return warnings;
}

async function readBoundedText(zip: JSZip, name: string, maximum: number) {
  const entry = zip.file(name);
  if (!entry) throw new Error("El DOCX está incompleto.");
  const bytes = await entry.async("uint8array");
  if (bytes.byteLength > maximum) throw new Error("El contenido XML del DOCX supera el límite seguro.");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function preflightZip(bytes: Uint8Array) {
  let offset = 0;
  let entries = 0;
  let expanded = 0;
  while (offset + 46 <= bytes.length) {
    if (read32(bytes, offset) !== 0x02014b50) { offset += 1; continue; }
    entries += 1;
    if (entries > MAX_ARCHIVE_ENTRIES) throw new Error("El DOCX contiene demasiadas entradas internas.");
    const flags = read16(bytes, offset + 8);
    const compressed = read32(bytes, offset + 20);
    const uncompressed = read32(bytes, offset + 24);
    const nameLength = read16(bytes, offset + 28);
    const extraLength = read16(bytes, offset + 30);
    const commentLength = read16(bytes, offset + 32);
    if ((flags & 1) !== 0) throw new Error("El DOCX está cifrado o protegido con contraseña.");
    expanded += uncompressed;
    if (expanded > MAX_EXPANDED_BYTES || (compressed > 0 && uncompressed / compressed > MAX_COMPRESSION_RATIO)) {
      throw new Error("El DOCX supera los límites seguros de expansión.");
    }
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength)).replace(/\\/gu, "/");
    if (!name || name.startsWith("/") || /^[a-z]:/iu.test(name) || name.split("/").includes("..")) {
      throw new Error("El DOCX contiene una ruta interna no segura.");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (!entries) throw new Error("El archivo no contiene un contenedor ZIP/DOCX válido.");
}

function read16(bytes: Uint8Array, offset: number) {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function read32(bytes: Uint8Array, offset: number) {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}
