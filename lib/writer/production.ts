import { blockText, type WriterDocument } from "./document.ts";
import { deriveWriterSceneSources, type WriterSceneSource } from "./script-assistant.ts";

export const WRITER_BREAKDOWN_CATEGORIES = [
  "character",
  "prop",
  "location",
  "wardrobe",
  "vehicle",
  "animal",
  "extra",
  "makeup",
  "practical_effect",
  "visual_effect",
  "stunt",
  "sound_music",
  "other",
] as const;

export type WriterBreakdownCategory = (typeof WRITER_BREAKDOWN_CATEGORIES)[number];
export type WriterBreakdownNature = "present" | "used" | "mentioned" | "inferred";

export const WRITER_BREAKDOWN_CATEGORY_LABELS: Record<WriterBreakdownCategory, string> = {
  character: "Personajes",
  prop: "Props / utilería",
  location: "Locaciones",
  wardrobe: "Vestuario",
  vehicle: "Vehículos",
  animal: "Animales",
  extra: "Extras",
  makeup: "Maquillaje",
  practical_effect: "Efectos prácticos",
  visual_effect: "Efectos visuales",
  stunt: "Acción especializada",
  sound_music: "Sonido / música",
  other: "Otros",
};

export type WriterBreakdownCandidate = {
  fingerprint: string;
  name: string;
  category: WriterBreakdownCategory;
  sceneId: string;
  blockId: string;
  excerpt: string;
  nature: WriterBreakdownNature;
  canonicalIdentityKey?: string;
  fromOffset?: number;
  toOffset?: number;
  source: "rule" | "ai";
};

export type WriterBreakdownElement = {
  id: string;
  scriptId: string;
  category: WriterBreakdownCategory;
  name: string;
  status: "suggested" | "confirmed" | "dismissed";
  source: "rule" | "ai" | "user" | "character_identity";
  canonicalIdentityKey: string | null;
  note: string | null;
  assetId: string | null;
  fingerprint: string;
  revision: number;
  appearances: WriterBreakdownAppearance[];
  retired?: boolean;
};

export type WriterBreakdownAppearance = {
  id: string;
  sceneId: string | null;
  blockId: string | null;
  excerpt: string;
  nature: WriterBreakdownNature;
  fromOffset: number | null;
  toOffset: number | null;
  sourceRevision: number;
  stale: boolean;
};

export type WriterShotlist = {
  id: string;
  scriptId: string | null;
  title: string;
  sourceRevision: number | null;
  revision: number;
  groups: WriterShotlistGroup[];
};

export type WriterShotlistGroup = {
  id: string;
  shotlistId: string;
  sourceSceneId: string | null;
  sourceSceneTitle: string | null;
  title: string;
  position: number;
  sourceStatus: "linked" | "missing" | "manual";
  revision: number;
  shots: WriterShot[];
};

export type WriterShot = {
  id: string;
  shotlistId: string;
  groupId: string;
  sourceBlockId: string | null;
  origin: "manual" | "assisted" | "suggested";
  shotType: string;
  composition: string | null;
  subject: string;
  angle: string;
  movement: string;
  support: string | null;
  lens: string | null;
  setup: string | null;
  durationSeconds: number | null;
  status: "pending" | "ready";
  description: string | null;
  intention: string | null;
  notes: string | null;
  assetId: string | null;
  position: number;
  sourceRevision: number | null;
  revision: number;
};

export const WRITER_SHOT_TYPES = [
  "Gran plano general",
  "Plano general",
  "Plano conjunto",
  "Plano entero",
  "Plano americano",
  "Plano medio",
  "Primer plano",
  "Primerísimo primer plano",
  "Plano detalle",
  "OTS",
  "POV",
  "Inserto",
  "Two-shot",
  "Personalizado",
] as const;

export const WRITER_SHOT_ANGLES = [
  "A nivel",
  "Picado",
  "Contrapicado",
  "Cenital",
  "Nadir",
  "Holandés",
  "Personalizado",
] as const;

export const WRITER_SHOT_MOVEMENTS = [
  "Fijo",
  "Pan",
  "Tilt",
  "Travelling",
  "Dolly in",
  "Dolly out",
  "Push-in",
  "Pull-out",
  "Pedestal",
  "Zoom",
  "Seguimiento",
  "Personalizado",
] as const;

const categorySet = new Set<string>(WRITER_BREAKDOWN_CATEGORIES);
const natureSet = new Set<string>(["present", "used", "mentioned", "inferred"]);
const physicalActionVerb = "sostiene|toma|agarra|abre|cierra|enciende|apaga|guarda|esconde|encuentra|descubre|extrae|saca|dispara|conduce|viste|lleva|usa|deja|coloca|levanta|recoge|hay|aparecen?";
const physicalDeterminer = "un(?:a|o)?s?|el|la|los|las|su|sus|\\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez";
// Only consume the verb: a later verb in the same sentence must still be examined.
const physicalActionPattern = new RegExp(`\\b(${physicalActionVerb})\\s+(?=(?:${physicalDeterminer})\\s+)`, "giu");
const carriedEntrancePattern = new RegExp(`\\b(?:entra|sale|camina|aparece|llega)\\s+con\\s+(?=(?:${physicalDeterminer})\\s+)`, "giu");
const visibleSubjectPattern = /\b((?:un(?:a|o)?s?|el|la|los|las)\s+[\p{L}\p{N}][\p{L}\p{N}\s-]{1,60}?)\s+(?:descansa|yace|permanece|está|espera)\b/giu;
const physicalPlacementPattern = /\b(?:sobre|contra|junto a|debajo de)\s+((?:un(?:a|o)?s?|el|la|los|las)\s+[\p{L}\p{N}][\p{L}\p{N}\s-]{1,48})/giu;
const sourcePlacementPattern = /\bde\s+((?:un(?:a|o)?s?|el|la|los|las|su|sus)\s+[\p{L}\p{N}][\p{L}\p{N}\s-]{1,48})/giu;
const phraseEnd = /\s+(?:mientras|cuando|que|pero|para|porque|con|sin|sobre|bajo|en|contra|junto|dentro|hacia|desde|al|del|hay)\b.*$/iu;
const sourcePhraseEnd = new RegExp(`\\s+de\\s+(?=(?:${physicalDeterminer})\\s+).*$`, "iu");
const article = new RegExp(`^(?:${physicalDeterminer})\\s+`, "iu");
const clauseInsideNominal = new RegExp(`\\b(?:${physicalActionVerb}|descansa|yace|permanece|está|espera|se|no|que|quien|alguien|nadie|todo|algo|ambos|era|fue|parece)\\b`, "iu");
const determinerInsideNominal = new RegExp(`\\b(?:${physicalDeterminer})\\b`, "iu");

export function normalizeProductionName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/^(?:el|la|los|las|un|una|unos|unas)\s+/iu, "")
    .replace(/\s+/gu, " ")
    .slice(0, 160);
}

export function productionIdentityKey(value: string) {
  return normalizeProductionName(value).toLocaleUpperCase("es-MX");
}

export function sceneLocationLabel(heading: string) {
  const clean = heading.trim().replace(/^(?:INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|INT\.?|EXT\.?)\s*/iu, "");
  const location = clean.split(/\s+-\s+(?=(?:D[IÍ]A|NOCHE|TARDE|MAÑANA|MADRUGADA|CONTINUO|MOMENTOS DESPU[EÉ]S)\b)/iu)[0]?.trim();
  return location ? location.slice(0, 160) : null;
}

export function detectWriterBreakdownRules(document: WriterDocument, sceneIds?: ReadonlySet<string>) {
  const candidates: WriterBreakdownCandidate[] = [];
  for (const scene of deriveWriterSceneSources(document)) {
    if (sceneIds && !sceneIds.has(scene.sceneId)) continue;
    const headingBlock = scene.blocks[0];
    const location = sceneLocationLabel(scene.heading);
    if (location && headingBlock) {
      candidates.push(ruleCandidate({
        name: location,
        category: "location",
        scene,
        blockId: headingBlock.id,
        excerpt: scene.heading,
        nature: "present",
      }));
    }
    for (const block of scene.blocks) {
      const text = block.text;
      if (!text.trim()) continue;
      if (block.kind === "character") {
        const name = normalizeProductionName(text.replace(/\s*\([^)]*\)\s*$/u, ""));
        if (name) candidates.push(ruleCandidate({
          name,
          category: "character",
          scene,
          blockId: block.id,
          excerpt: text,
          nature: "present",
          canonicalIdentityKey: productionIdentityKey(name),
        }));
        continue;
      }
      if (block.kind !== "action") continue;
      const addPhysicalPhrases = (raw: string, start: number, nature: WriterBreakdownNature, category: WriterBreakdownCategory = "prop") => {
        const bounded = raw.replace(phraseEnd, "").replace(sourcePhraseEnd, "");
        let precedingNominal = false;
        for (const part of bounded.matchAll(/(?:^|,\s*|\s+y\s+)((?:(?:un(?:a|o)?s?|el|la|los|las|su|sus)\s+)?[\p{L}\p{N}][\p{L}\p{N}\s-]*?)(?=,|\s+y\s+|$)/giu)) {
          const phrase = part[1]?.trim().replace(/[.,;:!?]+$/u, "").trim() ?? "";
          const prefix = phrase.match(article)?.[0] ?? "";
          if (!prefix && !precedingNominal) break;
          const name = phrase.slice(prefix.length);
          const wordCount = name.split(/\s+/u).length;
          // A bare coordinated token alone is too easily a finite verb ("y ríe").
          if (!name || wordCount > 5 || (!prefix && (wordCount < 2 || /^\p{Lu}/u.test(name)))
            || clauseInsideNominal.test(name) || determinerInsideNominal.test(name)) break;
          const localOffset = raw.indexOf(phrase, part.index ?? 0) + prefix.length;
          const fromOffset = start + localOffset;
          if (text.slice(fromOffset, fromOffset + name.length) !== name) break;
          candidates.push(ruleCandidate({ name, category, scene, blockId: block.id, excerpt: text.slice(0, 500), nature, fromOffset, toOffset: fromOffset + name.length }));
          precedingNominal = true;
        }
      };
      for (const match of text.matchAll(physicalActionPattern)) {
        const category: WriterBreakdownCategory = match[1]?.toLocaleLowerCase("es-MX") === "conduce" ? "vehicle" : match[1]?.toLocaleLowerCase("es-MX") === "viste" ? "wardrobe" : "prop";
        const start = (match.index ?? 0) + match[0].length;
        const raw = text.slice(start).split(/[.!?;\n]/u, 1)[0] ?? "";
        addPhysicalPhrases(raw, start, match[1]?.toLocaleLowerCase("es-MX") === "hay" ? "present" : "used", category);
        if (/^(?:saca|extrae|recoge)$/iu.test(match[1] ?? "")) {
          for (const source of raw.matchAll(sourcePlacementPattern)) {
            addPhysicalPhrases(source[1] ?? "", start + (source.index ?? 0) + source[0].indexOf(source[1] ?? ""), "present");
          }
        }
      }
      for (const match of text.matchAll(carriedEntrancePattern)) {
        const start = (match.index ?? 0) + match[0].length;
        addPhysicalPhrases(text.slice(start).split(/[.!?;\n]/u, 1)[0] ?? "", start, "present");
      }
      for (const match of text.matchAll(visibleSubjectPattern)) addPhysicalPhrases(match[1] ?? "", (match.index ?? 0) + match[0].indexOf(match[1] ?? ""), "present");
      for (const match of text.matchAll(physicalPlacementPattern)) addPhysicalPhrases(match[1] ?? "", (match.index ?? 0) + match[0].indexOf(match[1] ?? ""), "present");
    }
  }
  const occurrences = new Map<string, number>();
  const seenRanges = new Set<string>();
  return candidates.filter((candidate) => {
    const range = `${candidate.fingerprint}:${candidate.fromOffset ?? "none"}:${candidate.toOffset ?? "none"}`;
    if (seenRanges.has(range)) return false;
    seenRanges.add(range);
    const previous = occurrences.get(candidate.fingerprint) ?? 0;
    occurrences.set(candidate.fingerprint, previous + 1);
    if (previous) candidate.fingerprint += `:at:${candidate.fromOffset ?? previous}`;
    return true;
  });
}

function ruleCandidate(input: {
  name: string;
  category: WriterBreakdownCategory;
  scene: WriterSceneSource;
  blockId: string;
  excerpt: string;
  nature: WriterBreakdownNature;
  canonicalIdentityKey?: string;
  fromOffset?: number;
  toOffset?: number;
}): WriterBreakdownCandidate {
  const normalized = productionIdentityKey(input.name);
  return {
    fingerprint: [input.category, normalized, input.scene.sceneId, input.blockId, input.nature].join(":"),
    name: normalizeProductionName(input.name),
    category: input.category,
    sceneId: input.scene.sceneId,
    blockId: input.blockId,
    excerpt: input.excerpt.slice(0, 500),
    nature: input.nature,
    canonicalIdentityKey: input.canonicalIdentityKey,
    fromOffset: input.fromOffset,
    toOffset: input.toOffset,
    source: "rule",
  };
}

export function validateWriterBreakdownCandidates(
  value: unknown,
  document: WriterDocument,
): WriterBreakdownCandidate[] {
  if (!Array.isArray(value)) return [];
  const scenes = new Map(deriveWriterSceneSources(document).map((scene) => [scene.sceneId, scene]));
  const result: WriterBreakdownCandidate[] = [];
  for (const item of value) {
    if (!isRecord(item)
      || typeof item.name !== "string"
      || typeof item.category !== "string"
      || !categorySet.has(item.category)
      || typeof item.sceneId !== "string"
      || typeof item.blockId !== "string"
      || typeof item.excerpt !== "string"
      || typeof item.nature !== "string"
      || !natureSet.has(item.nature)) continue;
    const scene = scenes.get(item.sceneId);
    const block = scene?.blocks.find((candidate) => candidate.id === item.blockId);
    const name = normalizeProductionName(item.name);
    const excerpt = item.excerpt.trim();
    if (!scene || !block || !name || !excerpt || !block.text.includes(excerpt)) continue;
    const category = item.category as WriterBreakdownCategory;
    const nature = item.nature as WriterBreakdownNature;
    result.push({
      fingerprint: `${category}:${productionIdentityKey(name)}:${scene.sceneId}:${block.id}:${nature}`,
      name,
      category,
      sceneId: scene.sceneId,
      blockId: block.id,
      excerpt: excerpt.slice(0, 500),
      nature,
      ...(category === "character" ? { canonicalIdentityKey: productionIdentityKey(name) } : {}),
      source: "ai",
    });
  }
  return dedupeBreakdownCandidates(result);
}

export function dedupeBreakdownCandidates(candidates: WriterBreakdownCandidate[]) {
  return [...new Map(candidates.map((candidate) => [candidate.fingerprint, candidate])).values()];
}

export function writerShotlistSummary(groups: WriterShotlistGroup[]) {
  const shots = groups.flatMap((group) => group.shots);
  const durationSeconds = shots.reduce((total, shot) => total + (shot.durationSeconds ?? 0), 0);
  const missingDurations = shots.filter((shot) => shot.durationSeconds == null).length;
  return {
    totalShots: shots.length,
    plannedGroups: groups.filter((group) => group.shots.length > 0).length,
    totalGroups: groups.length,
    durationSeconds,
    missingDurations,
  };
}

export function writerShotlistCsv(shotlist: WriterShotlist) {
  const header = [
    "#", "Escena", "Plano", "Composición", "Sujeto / acción", "Ángulo", "Movimiento",
    "Soporte", "Lente", "Setup", "Duración (s)", "Estado", "Descripción", "Intención narrativa", "Notas",
  ];
  let number = 0;
  const rows = shotlist.groups.flatMap((group) => group.shots.map((shot) => {
    number += 1;
    return [
      number,
      group.title,
      shot.shotType,
      shot.composition ?? "",
      shot.subject,
      shot.angle,
      shot.movement,
      shot.support ?? "",
      shot.lens ?? "",
      shot.setup ?? "",
      shot.durationSeconds ?? "",
      shot.status === "ready" ? "Listo" : "Pendiente",
      shot.description ?? "",
      shot.intention ?? "",
      shot.notes ?? "",
    ];
  }));
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}

export function shotlistSceneLabel(document: WriterDocument, sceneId: string) {
  const block = document.content.find((candidate) => candidate.attrs.id === sceneId && candidate.attrs.kind === "sceneHeading");
  return block ? blockText(block).trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
