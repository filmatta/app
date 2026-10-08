import type { WriterDocument } from "./document.ts";
import { deriveWriterSceneSources, type WriterSceneSource } from "./script-assistant.ts";
import { matchBreakdownLexicon, normalizeBreakdownLookup } from "./breakdown-lexicon.ts";
import { normalizeProductionName, productionIdentityKey, sceneLocationLabel, type WriterBreakdownCandidate, type WriterBreakdownCategory, type WriterBreakdownNature } from "./production.ts";

const actionVerb = /\b(?:abre|encuentra|toma|sostiene|extrae|saca|guarda|deja|coloca|lleva|viste|conduce|recoge|enciende|apaga|entrega|muestra|repara|esconde|rompe|usa)\s+\b/giu;
const determiner = /^(?:un|una|unos|unas|el|la|los|las|su|sus|dos|tres|cuatro|\d+)\s+/iu;
const cut = /\b(?:y|pero|mientras|cuando|porque|para|sin|sobre|bajo|debajo|dentro|hacia|junto|contra|frente|que|quien|donde|después|antes|al|del|en|con)\b/iu;
const finiteVerb = /\b(?:se|no|está|era|fue|parece|sabe|pasa|asustan|asusta|ríen|ríe|apunta|jala|dispara|sale|entra|llega|corre|cae|mira|habla|dice|hace|aumenta|responde|encuentra|abre|coloca|saca|toma|guarda|lleva|viste|conduce|recoge|enciende|apaga|entrega|muestra|rompe|usa)\b/iu;
const abstract = /^(?:algo|nada|nadie|todo|ambos|ambas|alguien|tensión|relación|confianza|verdad|miedo|esperanza)$/iu;
const metaphor = /\b(?:era|es|fue|parece|como|metáfora|noticia)\b.{0,35}\b(?:bomba|disparo|arma)\b|\b(?:bomba de tiempo|disparo al corazón)\b/iu;
const rawWords = /[\p{L}\p{N}]+/gu;

function sentences(text: string) {
  const result: Array<{ value: string; start: number }> = [];
  for (const match of text.matchAll(/[^.!?;\n]+[.!?;]?/gu)) {
    const value = match[0].trim();
    if (value) result.push({ value, start: (match.index ?? 0) + match[0].indexOf(value) });
  }
  return result;
}

function nounPhrase(text: string) {
  const prefix = text.match(determiner);
  if (!prefix) return null;
  const remainder = text.slice(prefix[0].length);
  const boundary = remainder.search(cut);
  const raw = (boundary >= 0 ? remainder.slice(0, boundary) : remainder).trim().replace(/[,.:!?]+$/u, "").trim();
  const words = raw.split(/\s+/u);
  if (!raw || words.length > 5 || abstract.test(raw) || finiteVerb.test(raw)) return null;
  // "de" is retained only for a compact compound such as "tarjeta de acceso".
  if (words.some((word) => /^(?:de|del)$/iu.test(word)) && words.length > 4) return null;
  return { name: raw, offset: prefix[0].length };
}

function physicalContext(sentence: string, wordStart: number, wordEnd: number) {
  if (metaphor.test(sentence)) return false;
  const before = sentence.slice(Math.max(0, wordStart - 65), wordStart);
  const after = sentence.slice(wordEnd, Math.min(sentence.length, wordEnd + 35));
  return /\b(?:abre|encuentra|toma|sostiene|extrae|saca|guarda|deja|coloca|lleva|viste|conduce|recoge|enciende|apaga|entrega|muestra|repara|esconde|rompe|usa|descansa|yace|está|hay|aparece|explota)\b/iu.test(before + after)
    || /\b(?:sobre|bajo|debajo|dentro|junto|en|con)\s+(?:el|la|los|las|un|una)\s*$/iu.test(before);
}

function candidate(scene: WriterSceneSource, blockId: string, excerpt: string, name: string, category: WriterBreakdownCategory, nature: WriterBreakdownNature, fromOffset?: number, toOffset?: number): WriterBreakdownCandidate {
  const clean = normalizeProductionName(name);
  return {
    fingerprint: [category, productionIdentityKey(clean), scene.sceneId, blockId, nature].join(":"),
    name: clean, category, sceneId: scene.sceneId, blockId, excerpt: excerpt.slice(0, 500), nature,
    ...(fromOffset === undefined ? {} : { fromOffset, toOffset }), source: "rule",
  };
}

export function detectWriterBreakdownV3(document: WriterDocument, sceneIds?: ReadonlySet<string>) {
  const found: WriterBreakdownCandidate[] = [];
  for (const scene of deriveWriterSceneSources(document)) {
    if (sceneIds && !sceneIds.has(scene.sceneId)) continue;
    const heading = scene.blocks[0];
    const location = sceneLocationLabel(scene.heading);
    if (location && heading) found.push(candidate(scene, heading.id, scene.heading, location, "location", "present"));
    for (const block of scene.blocks) {
      if (block.kind !== "action" || !block.text.trim()) continue;
      for (const sentence of sentences(block.text)) {
        const words = [...sentence.value.matchAll(rawWords)];
        const hits = matchBreakdownLexicon(sentence.value);
        const claimed: Array<{ start: number; end: number }> = [];
        const spans: Array<{ start: number; nature: WriterBreakdownNature; category: WriterBreakdownCategory }> = [];
        for (const match of sentence.value.matchAll(actionVerb)) {
          const start = (match.index ?? 0) + match[0].length;
          spans.push({ start, nature: "used", category: /^viste\b/iu.test(match[0]) ? "wardrobe" : /^conduce\b/iu.test(match[0]) ? "vehicle" : "prop" });
        }
        for (const match of sentence.value.matchAll(/\b(?:sobre|debajo de|junto a|dentro de)\s+(?=(?:el|la|los|las|un|una)\s+)/giu)) {
          spans.push({ start: (match.index ?? 0) + match[0].length, nature: "present", category: "prop" });
        }
        for (const match of sentence.value.matchAll(/\b(?:descansa|yace|permanece|está)\s+(?=(?:el|la|los|las|un|una)\s+)/giu)) {
          spans.push({ start: (match.index ?? 0) + match[0].length, nature: "present", category: "prop" });
        }
        for (const span of spans) {
          const raw = sentence.value.slice(span.start);
          const phrase = nounPhrase(raw);
          if (!phrase || metaphor.test(sentence.value)) continue;
          const start = span.start + phrase.offset;
          const end = start + phrase.name.length;
          if (claimed.some((item) => item.start < end && item.end > start)) continue;
          const hit = matchBreakdownLexicon(phrase.name).find((item) => item.wordIndex === 0);
          const exactHit = hit && normalizeBreakdownLookup(phrase.name) === hit.alias ? hit : null;
          found.push(candidate(scene, block.id, block.text, exactHit?.canonical ?? phrase.name, hit?.category ?? span.category, span.nature, sentence.start + start, sentence.start + end));
          claimed.push({ start, end });
        }
        for (const hit of hits) {
          const first = words[hit.wordIndex];
          const last = words[hit.wordIndex + hit.alias.split(" ").length - 1];
          if (!first || !last) continue;
          const start = first.index ?? 0;
          const end = (last.index ?? 0) + last[0].length;
          if (claimed.some((item) => item.start < end && item.end > start) || !physicalContext(sentence.value, start, end)) continue;
          const nature = /\b(?:abre|encuentra|toma|sostiene|extrae|saca|guarda|deja|coloca|lleva|viste|conduce|recoge|enciende|apaga|entrega|muestra|repara|esconde|rompe|usa)\b/iu.test(sentence.value.slice(0, start)) ? "used" : "present";
          found.push(candidate(scene, block.id, block.text, hit.canonical, hit.category, nature, sentence.start + start, sentence.start + end));
        }
      }
    }
  }
  const seen = new Set<string>();
  return found.filter((item) => {
    const key = `${item.category}:${item.sceneId}:${item.blockId}:${item.fromOffset ?? -1}:${item.toOffset ?? -1}:${productionIdentityKey(item.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
