import { blockText, type WriterDocument } from "./document.ts";

export type WriterSearchScope = "scene" | "document";
export type WriterSearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  scope: WriterSearchScope;
  sceneId: string | null;
};

export type WriterSearchResult = {
  id: string;
  sceneId: string | null;
  sceneNumber: number | null;
  sceneHeading: string;
  blockId: string;
  blockKind: string;
  start: number;
  end: number;
  text: string;
  snippet: string;
  reason: string;
};

const STOP_WORDS = new Set([
  "a", "al", "de", "del", "donde", "dónde", "el", "en", "es", "la", "las", "lo", "los",
  "parte", "por", "primera", "que", "qué", "se", "una", "y", "cuando", "cuándo", "guion",
]);

export function findWriterText(
  document: WriterDocument,
  query: string,
  options: WriterSearchOptions,
): WriterSearchResult[] {
  const needle = query.trim();
  if (!needle) return [];
  const matcher = searchRegExp(needle, options);
  if (!matcher) return [];
  const results: WriterSearchResult[] = [];
  let sceneId: string | null = null;
  let sceneNumber = 0;
  let sceneHeading = "Antes de la primera escena";
  for (const block of document.content) {
    const text = blockText(block);
    if (block.attrs.kind === "sceneHeading") {
      sceneId = block.attrs.id;
      sceneNumber += 1;
      sceneHeading = text.trim() || "Escena sin encabezado";
    }
    if (options.scope === "scene" && sceneId !== options.sceneId) continue;
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      results.push({
        id: `${block.attrs.id}:${start}:${end}`,
        sceneId,
        sceneNumber: sceneId ? sceneNumber : null,
        sceneHeading,
        blockId: block.attrs.id,
        blockKind: block.attrs.kind,
        start,
        end,
        text: match[0],
        snippet: writerSearchSnippet(text, start, end),
        reason: "Coincidencia textual",
      });
      if (match[0].length === 0) matcher.lastIndex += 1;
    }
  }
  return results;
}

export function findWriterSmartCandidates(
  document: WriterDocument,
  query: string,
  scope: WriterSearchScope,
  sceneId: string | null,
  limit = 24,
) {
  const tokens = smartTokens(query);
  if (!tokens.length) return [];
  const candidates: Array<WriterSearchResult & { score: number }> = [];
  let currentSceneId: string | null = null;
  let sceneNumber = 0;
  let heading = "Antes de la primera escena";
  for (const block of document.content) {
    const text = blockText(block).trim();
    if (block.attrs.kind === "sceneHeading") {
      currentSceneId = block.attrs.id;
      sceneNumber += 1;
      heading = text || "Escena sin encabezado";
    }
    if (!text || (scope === "scene" && currentSceneId !== sceneId)) continue;
    const normalized = fold(text);
    const matched = tokens.filter((token) => normalized.includes(token));
    if (!matched.length) continue;
    const score = matched.length * 10 + (matched.length === tokens.length ? 12 : 0)
      + (block.attrs.kind === "action" || block.attrs.kind === "dialogue" ? 2 : 0);
    const first = Math.max(0, normalized.indexOf(matched[0]));
    candidates.push({
      id: `smart:${block.attrs.id}`,
      sceneId: currentSceneId,
      sceneNumber: currentSceneId ? sceneNumber : null,
      sceneHeading: heading,
      blockId: block.attrs.id,
      blockKind: block.attrs.kind,
      start: first,
      end: Math.min(text.length, first + matched[0].length),
      text,
      snippet: writerSearchSnippet(text, first, Math.min(text.length, first + matched[0].length)),
      reason: matched.length === tokens.length
        ? "Coincide con todas las señales clave de la consulta."
        : `Coincide con ${matched.length} señal${matched.length === 1 ? "" : "es"} clave: ${matched.join(", ")}.`,
      score,
    });
  }
  return candidates.sort((left, right) => right.score - left.score || (left.sceneNumber ?? 0) - (right.sceneNumber ?? 0))
    .slice(0, limit).map(({ score, ...result }) => {
      void score;
      return result;
    });
}

export function buildWriterSmartSearchContext(query: string, candidates: readonly WriterSearchResult[]) {
  return {
    query: query.trim().slice(0, 500),
    candidates: candidates.slice(0, 24).map((candidate) => ({
      referenceId: candidate.id,
      sceneId: candidate.sceneId,
      sceneNumber: candidate.sceneNumber,
      sceneHeading: candidate.sceneHeading.slice(0, 160),
      blockId: candidate.blockId,
      blockKind: candidate.blockKind,
      snippet: candidate.snippet.slice(0, 420),
    })),
  };
}

export function writerSearchSnippet(text: string, start: number, end: number) {
  const from = Math.max(0, start - 70);
  const to = Math.min(text.length, end + 90);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

function searchRegExp(query: string, options: WriterSearchOptions) {
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const source = options.wholeWord ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
    return new RegExp(source, options.caseSensitive ? "gu" : "giu");
  } catch {
    return null;
  }
}

function smartTokens(query: string) {
  return [...new Set(fold(query).split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)))].slice(0, 12);
}

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es-MX");
}
