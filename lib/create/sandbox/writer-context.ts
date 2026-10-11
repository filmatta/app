import { blockText, validateWriterDocument, type WriterDocument } from "../../writer/document.ts";

export type SandboxWriterSummary = {
  premise: string;
  characters: string;
  motivations: string;
  conflicts: string;
  structure: string;
  events: string;
};

const summaryKeys = ["premise", "characters", "motivations", "conflicts", "structure", "events"] as const;

export function isSandboxWriterSummary(value: unknown): value is SandboxWriterSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return summaryKeys.every((key) => typeof row[key] === "string" && row[key].length <= 500)
    && JSON.stringify(row).length <= 4000;
}

// Use sparse narrative evidence across the whole script. Never send the full document.
export function extractBoundedWriterEvidence(value: unknown): string | null {
  const checked = validateWriterDocument(value);
  if (!checked.ok) return null;
  const document: WriterDocument = checked.document;
  const headings = document.content.filter((block) => block.attrs.kind === "sceneHeading")
    .map((block) => blockText(block).trim()).filter(Boolean).slice(0, 24)
    .map((text, index) => `${index + 1}. ${text.slice(0, 110)}`);
  const characters = [...new Set(document.content.filter((block) => block.attrs.kind === "character")
    .map((block) => blockText(block).trim()).filter(Boolean))].slice(0, 20);
  const narrative = document.content.filter((block) => ["action", "dialogue"].includes(block.attrs.kind)
    && blockText(block).trim());
  const samples = Array.from({ length: Math.min(36, narrative.length) }, (_, index) =>
    narrative[Math.floor(index * narrative.length / Math.min(36, narrative.length))]);
  const lines = ["Escenas:", ...headings, "Personajes mencionados:", ...characters,
    "Fragmentos narrativos distribuidos por el guion:",
    ...samples.map((block) => `${block.attrs.kind}: ${blockText(block).trim().slice(0, 150)}`)];
  const evidence = lines.join("\n").slice(0, 8000);
  return headings.length || characters.length || narrative.length ? evidence : null;
}
