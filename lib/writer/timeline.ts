import { SCREENPLAY_KINDS, WRITER_SCHEMA_VERSION, type ScreenplayKind } from "./document.ts";

export type TimelineEnvironment = "interior" | "exterior" | "mixed" | "unknown";
export type TimelineMomentCategory = "day" | "night" | "other" | "unspecified";

export type TimelineHeading = {
  environment: TimelineEnvironment;
  location: string | null;
  locationKey: string | null;
  moment: string | null;
  momentCategory: TimelineMomentCategory;
};

export type TimelineScene = {
  key: string;
  sourceId: string | null;
  canDeepLink: boolean;
  order: number;
  heading: string;
  headingData: TimelineHeading;
  wordCount: number;
  characterKeys: string[];
  excerpt: string | null;
  issues: string[];
};

export type TimelineCharacter = {
  key: string;
  name: string;
  variants: string[];
  sceneKeys: string[];
};

export type TimelineLocation = {
  key: string;
  name: string;
  sceneKeys: string[];
};

export type WriterTimeline = {
  scriptId: string;
  title: string;
  revision: number;
  updatedAt: string;
  scenes: TimelineScene[];
  characters: TimelineCharacter[];
  locations: TimelineLocation[];
  preamble: { wordCount: number; excerpt: string | null } | null;
  totalBodyWords: number;
  issues: string[];
};

export type TimelineSource = {
  scriptId: string;
  title: string;
  document: unknown;
  schemaVersion: number;
  revision: number;
  updatedAt: string;
};

export type TimelineDerivation =
  | { ok: true; timeline: WriterTimeline }
  | { ok: false; message: string };

export function refreshedSceneKey(previous: TimelineScene | null, nextScenes: TimelineScene[]) {
  if (!previous?.sourceId) return null;
  return nextScenes.find((scene) => scene.sourceId === previous.sourceId)?.key ?? null;
}

type ParsedBlock = {
  kind: ScreenplayKind;
  id: string | null;
  text: string;
  index: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds = new Set<string>(SCREENPLAY_KINDS);
const BODY_KINDS = new Set<ScreenplayKind>(["action", "dialogue"]);

// Only well-known screenplay suffixes are removed. Arbitrary parentheticals remain part of the name.
const CHARACTER_SUFFIX = /\s*\((?:V\.?\s*O\.?|O\.?\s*S\.?|OFF|CONT(?:INUED|INUADO|['’]?D|\.)?)\)\s*$/iu;

const MOMENTS: ReadonlyArray<{ values: string[]; category: TimelineMomentCategory }> = [
  { values: ["DÍA", "DIA", "DAY"], category: "day" },
  { values: ["NOCHE", "NIGHT"], category: "night" },
  {
    values: [
      "AMANECER", "DAWN", "ATARDECER", "DUSK", "TARDE", "AFTERNOON", "MAÑANA", "MORNING",
      "CONTINUO", "CONTINUA", "CONTINUOUS", "MÁS TARDE", "MAS TARDE", "LATER",
      "MOMENTOS DESPUÉS", "MOMENTOS DESPUES", "MOMENTS LATER", "HORA MÁGICA", "HORA MAGICA",
      "GOLDEN HOUR",
    ],
    category: "other",
  },
];

export function deriveWriterTimeline(source: TimelineSource): TimelineDerivation {
  if (source.schemaVersion !== WRITER_SCHEMA_VERSION) {
    return { ok: false, message: "La versión guardada de este guion no es compatible con Timeline." };
  }
  if (!Number.isSafeInteger(source.revision) || source.revision < 1) {
    return { ok: false, message: "La revisión guardada no es válida." };
  }

  const parsed = parseBlocks(source.document);
  if (!parsed.ok) return parsed;

  const scenes: TimelineScene[] = [];
  const characterMap = new Map<string, { name: string; variants: Set<string>; sceneKeys: Set<string> }>();
  const locationMap = new Map<string, { name: string; sceneKeys: Set<string> }>();
  const preambleBlocks: ParsedBlock[] = [];
  const globalIssues: string[] = [];
  let current: { scene: TimelineScene; excerptParts: string[] } | null = null;

  for (const block of parsed.blocks) {
    if (block.kind === "sceneHeading") {
      const sourceId = block.id;
      const key = sourceId ?? `ephemeral:${source.revision}:${block.index}`;
      const issues = sourceId ? [] : ["El encabezado no tiene un ID estable; la selección no puede enlazarse al editor."];
      const heading = cleanText(block.text) || "Escena sin encabezado";
      const headingData = parseSceneHeading(heading);
      current = {
        scene: {
          key,
          sourceId,
          canDeepLink: Boolean(sourceId),
          order: scenes.length + 1,
          heading,
          headingData,
          wordCount: 0,
          characterKeys: [],
          excerpt: null,
          issues,
        },
        excerptParts: [],
      };
      scenes.push(current.scene);
      if (headingData.location && headingData.locationKey) {
        const entry = locationMap.get(headingData.locationKey) ?? {
          name: headingData.location,
          sceneKeys: new Set<string>(),
        };
        entry.sceneKeys.add(key);
        locationMap.set(headingData.locationKey, entry);
      }
      continue;
    }

    if (!current) {
      if (block.kind !== "authorNote") preambleBlocks.push(block);
      continue;
    }
    if (block.kind === "authorNote") continue;

    if (BODY_KINDS.has(block.kind)) {
      current.scene.wordCount += countWords(block.text);
      const text = cleanText(block.text);
      if (text && current.excerptParts.join(" ").length < 280) current.excerptParts.push(text);
      current.scene.excerpt = excerpt(current.excerptParts.join(" "));
    }

    if (block.kind === "character") {
      const variant = cleanText(block.text);
      if (!variant) continue;
      const identity = characterIdentity(variant);
      if (!current.scene.characterKeys.includes(identity.key)) current.scene.characterKeys.push(identity.key);
      const entry = characterMap.get(identity.key) ?? {
        name: identity.name,
        variants: new Set<string>(),
        sceneKeys: new Set<string>(),
      };
      entry.variants.add(variant);
      entry.sceneKeys.add(current.scene.key);
      characterMap.set(identity.key, entry);
    }
  }

  const preambleWordCount = preambleBlocks
    .filter((block) => BODY_KINDS.has(block.kind))
    .reduce((total, block) => total + countWords(block.text), 0);
  const preambleExcerpt = excerpt(
    preambleBlocks
      .filter((block) => BODY_KINDS.has(block.kind))
      .map((block) => cleanText(block.text))
      .filter(Boolean)
      .join(" "),
  );
  const preamble = preambleBlocks.length > 0
    ? { wordCount: preambleWordCount, excerpt: preambleExcerpt }
    : null;
  if (preamble) globalIssues.push("Hay texto antes del primer encabezado de escena.");

  return {
    ok: true,
    timeline: {
      scriptId: source.scriptId,
      title: source.title,
      revision: source.revision,
      updatedAt: source.updatedAt,
      scenes,
      characters: [...characterMap.entries()]
        .map(([key, value]) => ({
          key,
          name: value.name,
          variants: [...value.variants],
          sceneKeys: [...value.sceneKeys],
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })),
      locations: [...locationMap.entries()]
        .map(([key, value]) => ({ key, name: value.name, sceneKeys: [...value.sceneKeys] }))
        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })),
      preamble,
      totalBodyWords: scenes.reduce((total, scene) => total + scene.wordCount, 0),
      issues: globalIssues,
    },
  };
}

export function parseSceneHeading(value: string): TimelineHeading {
  const original = cleanText(value);
  const prefix = original.match(/^\s*(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\.?\s*\/\s*E\.?|INT\.?|EXT\.?)\s+/iu);
  if (!prefix) {
    return { environment: "unknown", location: null, locationKey: null, moment: null, momentCategory: "unspecified" };
  }
  const normalizedPrefix = prefix[1].replace(/\s+/g, "").toLocaleUpperCase("es-MX");
  const environment: TimelineEnvironment = normalizedPrefix.includes("/")
    ? "mixed"
    : normalizedPrefix.startsWith("INT") || normalizedPrefix.startsWith("I.")
      ? "interior"
      : "exterior";
  const remainder = original.slice(prefix[0].length).trim();
  const parts = remainder.split(/\s+(?:-|—|–)\s+/u).map((part) => part.trim()).filter(Boolean);
  const candidate = parts.at(-1) ?? "";
  const recognizedMoment = recognizeMoment(candidate);
  const locationParts = recognizedMoment ? parts.slice(0, -1) : parts;
  const location = cleanText(locationParts.join(" - ")) || null;
  return {
    environment,
    location,
    locationKey: location ? normalizeKey(location) : null,
    moment: recognizedMoment ? candidate : null,
    momentCategory: recognizedMoment?.category ?? "unspecified",
  };
}

function parseBlocks(value: unknown): { ok: true; blocks: ParsedBlock[] } | { ok: false; message: string } {
  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content)) {
    return { ok: false, message: "El documento guardado no tiene una estructura compatible con Timeline." };
  }
  const ids = new Set<string>();
  const blocks: ParsedBlock[] = [];
  for (let index = 0; index < value.content.length; index += 1) {
    const block = value.content[index];
    if (!isRecord(block) || block.type !== "screenplayBlock" || !isRecord(block.attrs)) {
      return { ok: false, message: "El documento contiene un bloque incompatible con Timeline." };
    }
    const kind = block.attrs.kind;
    if (typeof kind !== "string" || !kinds.has(kind)) {
      return { ok: false, message: "El documento contiene un tipo de bloque incompatible con Timeline." };
    }
    const rawId = block.attrs.id;
    let id: string | null = null;
    if (rawId !== undefined && rawId !== null && rawId !== "") {
      if (typeof rawId !== "string" || !UUID_PATTERN.test(rawId) || ids.has(rawId)) {
        return { ok: false, message: "El documento contiene identificadores incompatibles con Timeline." };
      }
      id = rawId;
      ids.add(rawId);
    }
    const text = inlineText(block.content);
    if (text === null) {
      return { ok: false, message: "El documento contiene texto inline incompatible con Timeline." };
    }
    blocks.push({ kind: kind as ScreenplayKind, id, text, index });
  }
  return { ok: true, blocks };
}

function inlineText(value: unknown): string | null {
  if (value === undefined) return "";
  if (!Array.isArray(value)) return null;
  const parts: string[] = [];
  for (const node of value) {
    if (!isRecord(node) || (node.type !== "text" && node.type !== "hardBreak")) return null;
    if (node.type === "text") {
      if (typeof node.text !== "string") return null;
      parts.push(node.text);
    } else parts.push("\n");
  }
  return parts.join("");
}

function characterIdentity(variant: string) {
  let name = variant;
  let previous = "";
  while (previous !== name) {
    previous = name;
    name = name.replace(CHARACTER_SUFFIX, "").trim();
  }
  if (!name) name = variant;
  return { name, key: normalizeKey(name) };
}

function recognizeMoment(value: string) {
  const key = normalizeKey(value);
  for (const group of MOMENTS) {
    if (group.values.some((candidate) => normalizeKey(candidate) === key)) return { category: group.category };
  }
  return null;
}

function cleanText(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function normalizeKey(value: string) {
  return cleanText(value).normalize("NFKC").toLocaleUpperCase("es-MX");
}

function countWords(value: string) {
  const text = cleanText(value);
  return text ? text.split(/\s+/u).length : 0;
}

function excerpt(value: string) {
  const text = cleanText(value);
  if (!text) return null;
  return text.length <= 280 ? text : `${text.slice(0, 277).trimEnd()}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
