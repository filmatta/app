import {
  blockText,
  deriveCharacters,
  type WriterDocument,
} from "./document.ts";

export const WRITER_CHARACTER_RULE_VERSION = "es-v0.1";

export type WriterCharacterEvidence =
  | "intervention"
  | "actionReference"
  | "mention"
  | "indeterminate";

export type WriterCharacterConfidence = "high" | "medium" | "review";

export type WriterKnownCharacterIdentity = {
  key: string;
  name: string;
  source: "characterBlock" | "confirmedAction" | "manual";
};

export type WriterCharacterObservation = {
  id: string;
  identityKey: string;
  identity: string;
  blockId: string;
  sceneId: string | null;
  start: number;
  end: number;
  excerpt: string;
  evidence: WriterCharacterEvidence;
  signals: string[];
  ruleVersion: typeof WRITER_CHARACTER_RULE_VERSION;
  confidence: WriterCharacterConfidence;
  known: boolean;
  blockHash: string;
  fingerprint: string;
};

export type WriterCharacterAnalysisCache = Map<string, {
  hash: string;
  observations: WriterCharacterObservation[];
}>;

export type WriterCharacterAnalysisResult = {
  observations: WriterCharacterObservation[];
  cache: WriterCharacterAnalysisCache;
  analyzedBlocks: number;
  reusedBlocks: number;
};

type WriterCharacterObservationDraft = Omit<
  WriterCharacterObservation,
  "id" | "blockId" | "sceneId" | "excerpt" | "ruleVersion" | "blockHash" | "fingerprint"
>;

const ACTION_VERBS = [
  "abre", "abren", "abrió", "abrio", "aparece", "aparecen", "apareció", "aparecio",
  "avanza", "avanzan", "bloquea", "bloquean", "busca", "buscan", "camina", "caminan",
  "cierra", "cierran", "corre", "corren", "desaparece", "desaparecen", "despierta", "despiertan",
  "dice", "dicen", "entra", "entran", "entró", "entro", "escucha", "escuchan", "espera", "esperan", "está", "estan", "están",
  "golpea", "golpean", "grita", "gritan", "habla", "hablan", "lee", "leen", "mira", "miran",
  "observa", "observan", "recuerda", "recuerdan", "responde", "responden", "sale", "salen",
  "saluda", "saludan", "señala", "señalan", "sigue", "siguen", "sonríe", "sonríen", "toma", "toman",
  "trabaja", "trabajan", "ve", "ven", "vuelve", "vuelven",
] as const;

const ENTRY_VERBS = ["aparece", "aparecen", "entra", "entran", "llega", "llegan", "sale", "salen", "vuelve", "vuelven"] as const;

const PARTICIPANT_NOUNS = [
  "actor", "actriz", "animal", "ave", "bebé", "caballo", "camarera", "camarero", "capitana", "capitán",
  "conductor", "conductora", "criatura", "doctora", "doctor", "enfermera", "enfermero", "gata", "gato",
  "guardia", "hombre", "joven", "médica", "médico", "mesera", "mesero", "mujer", "niña", "niño",
  "oficial", "perra", "perro", "policía", "robot", "soldado", "soldada", "toro", "vigilante",
] as const;

const NAME_STOP_WORDS = new Set([
  "EL", "ELLA", "ELLAS", "ELLOS", "EN", "INT", "EXT", "LA", "LAS", "LOS", "UN", "UNA", "ÉL",
]);

const NAME_TOKEN = String.raw`(?:[A-ZÁÉÍÓÚÜÑ][\p{L}\p{M}'’-]*|[A-ZÁÉÍÓÚÜÑ0-9]+(?:-[A-ZÁÉÍÓÚÜÑ0-9]+)+)`;
const NAME_PHRASE = String.raw`${NAME_TOKEN}(?:\s+${NAME_TOKEN}){0,2}`;
const VERB_PATTERN = ACTION_VERBS.join("|");
const PARTICIPANT_PATTERN = PARTICIPANT_NOUNS.map((noun) => `${escapeRegExp(noun)}s?`).join("|");

export function normalizeWriterCharacterIdentity(value: string) {
  return value.trim().replace(/\s+/gu, " ").normalize("NFKC").toLocaleUpperCase("es-MX");
}

export function deriveWriterKnownCharacterIdentities(
  document: WriterDocument,
  local: readonly Omit<WriterKnownCharacterIdentity, "key">[] = [],
) {
  const identities = new Map<string, WriterKnownCharacterIdentity>();
  for (const character of deriveCharacters(document)) {
    identities.set(character.key, {
      key: character.key,
      name: character.name,
      source: "characterBlock",
    });
  }
  for (const identity of local) {
    const key = normalizeWriterCharacterIdentity(identity.name);
    if (!key || identities.has(key)) continue;
    identities.set(key, { ...identity, key });
  }
  return [...identities.values()];
}

export function analyzeWriterCharacterObservations(
  document: WriterDocument,
  knownIdentities: readonly WriterKnownCharacterIdentity[],
  previousCache: WriterCharacterAnalysisCache = new Map(),
): WriterCharacterAnalysisResult {
  const knownSignature = knownIdentities
    .map((identity) => identity.key)
    .sort()
    .join("\u001f");
  const cache: WriterCharacterAnalysisCache = new Map();
  const observations: WriterCharacterObservation[] = [];
  let analyzedBlocks = 0;
  let reusedBlocks = 0;
  let sceneId: string | null = null;

  for (const block of document.content) {
    if (block.attrs.kind === "sceneHeading") sceneId = block.attrs.id;
    if (block.attrs.kind !== "action") continue;
    const text = blockText(block);
    const blockHash = writerObservationTextHash(text);
    const cacheHash = writerObservationTextHash(`${blockHash}\u0000${sceneId ?? ""}\u0000${knownSignature}`);
    const cached = previousCache.get(block.attrs.id);
    if (cached?.hash === cacheHash) {
      cache.set(block.attrs.id, cached);
      observations.push(...cached.observations);
      reusedBlocks += 1;
      continue;
    }
    const detected = detectActionBlock(block.attrs.id, sceneId, text, blockHash, knownIdentities);
    cache.set(block.attrs.id, { hash: cacheHash, observations: detected });
    observations.push(...detected);
    analyzedBlocks += 1;
  }

  return { observations, cache, analyzedBlocks, reusedBlocks };
}

export function writerObservationTextHash(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function detectActionBlock(
  blockId: string,
  sceneId: string | null,
  text: string,
  blockHash: string,
  knownIdentities: readonly WriterKnownCharacterIdentity[],
): WriterCharacterObservation[] {
  const observations: WriterCharacterObservationDraft[] = [];
  const occupied: Array<{ start: number; end: number; key: string }> = [];
  const knownKeys = new Set(knownIdentities.map((identity) => identity.key));

  for (const known of [...knownIdentities].sort((a, b) => b.name.length - a.name.length)) {
    const matcher = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(known.name)})(?=$|[^\\p{L}\\p{N}_])`, "giu");
    for (const match of text.matchAll(matcher)) {
      const prefix = match[1] ?? "";
      const identity = match[2];
      const start = (match.index ?? 0) + prefix.length;
      const evidence = evidenceForKnownReference(text, start, start + identity.length);
      addObservation(observations, occupied, {
        identityKey: known.key,
        identity,
        start,
        end: start + identity.length,
        evidence,
        signals: [
          "Coincide de forma exacta con una identidad ya reconocida.",
          evidence === "mention"
            ? "El contexto expresa mención, recuerdo, habla o ausencia; no acredita presencia física."
            : "Aparece dentro de un bloque Acción; se registra como referencia observable.",
        ],
        confidence: "high",
        known: true,
      });
    }
  }

  const roleSubject = new RegExp(
    `(^|[.!?…]\\s+)(?<identity>(?:un|una|el|la|los|las|dos|tres|varios|varias)\\s+(?:${PARTICIPANT_PATTERN}))\\s+(?<verb>${VERB_PATTERN})\\b`,
    "giu",
  );
  for (const match of text.matchAll(roleSubject)) {
    const identity = match.groups?.identity;
    if (!identity) continue;
    const start = (match.index ?? 0) + (match[1]?.length ?? 0);
    const anonymousKey = `ROLE:${sceneId ?? "PREAMBLE"}:${normalizeWriterCharacterIdentity(identity)}`;
    addObservation(observations, occupied, {
      identityKey: anonymousKey,
      identity,
      start,
      end: start + identity.length,
      evidence: "actionReference",
      signals: [
        "Sintagma nominal de participante con determinante o cantidad.",
        `Predicado de acción compatible: “${match.groups?.verb ?? ""}”.`,
        "Los roles anónimos se agrupan sólo dentro de esta escena.",
      ],
      confidence: "medium",
      known: false,
    });
  }

  const namedSubject = new RegExp(
    `(^|[.!?…]\\s+)(?<identity>${NAME_PHRASE})\\s+(?<negative>(?:no|NO)\\s+)?(?<verb>\\p{L}+)(?=$|[^\\p{L}\\p{M}])`,
    "gu",
  );
  for (const match of text.matchAll(namedSubject)) {
    const identity = match.groups?.identity;
    if (!identity || !isPlausibleName(identity) || !isActionVerb(match.groups?.verb ?? "")) continue;
    const key = normalizeWriterCharacterIdentity(identity);
    if (knownKeys.has(key)) continue;
    const start = (match.index ?? 0) + (match[1]?.length ?? 0);
    const negative = Boolean(match.groups?.negative);
    addObservation(observations, occupied, {
      identityKey: key,
      identity,
      start,
      end: start + identity.length,
      evidence: negative ? "mention" : "actionReference",
      signals: [
        "Nombre propio o identificador aparente en posición de sujeto.",
        `Predicado de acción compatible: “${match.groups?.verb ?? ""}”.`,
        ...(negative ? ["La negación impide inferir presencia física."] : []),
      ],
      confidence: "medium",
      known: false,
    });
  }

  const verbFirst = new RegExp(
    `(^|[.!?…]\\s+)(?<verb>\\p{L}+)\\s+(?<identity>${NAME_PHRASE})(?=$|[.,;:!?…])`,
    "gu",
  );
  for (const match of text.matchAll(verbFirst)) {
    const identity = match.groups?.identity;
    if (!identity || !isPlausibleName(identity) || !isEntryVerb(match.groups?.verb ?? "")) continue;
    const key = normalizeWriterCharacterIdentity(identity);
    if (knownKeys.has(key)) continue;
    const full = match[0];
    const relative = full.toLocaleUpperCase("es-MX").lastIndexOf(identity.toLocaleUpperCase("es-MX"));
    const start = (match.index ?? 0) + Math.max(0, relative);
    addObservation(observations, occupied, {
      identityKey: key,
      identity,
      start,
      end: start + identity.length,
      evidence: "actionReference",
      signals: [
        `Verbo de entrada o aparición antes del candidato: “${match.groups?.verb ?? ""}”.`,
        "Nombre propio o identificador aparente; el orden verbo–sujeto está contemplado.",
      ],
      confidence: "medium",
      known: false,
    });
  }

  const namedMention = new RegExp(
    `\\b(?:[Rr]ecuerda\\s+a|[Hh]abla\\s+de|[Mm]enciona\\s+a|[Pp]iensa\\s+en)\\s+(?<identity>${NAME_PHRASE})(?=$|[.,;:!?…])`,
    "gu",
  );
  for (const match of text.matchAll(namedMention)) {
    const identity = match.groups?.identity;
    if (!identity || !isPlausibleName(identity)) continue;
    const key = normalizeWriterCharacterIdentity(identity);
    if (knownKeys.has(key)) continue;
    const relative = match[0].toLocaleUpperCase("es-MX").lastIndexOf(identity.toLocaleUpperCase("es-MX"));
    const start = (match.index ?? 0) + Math.max(0, relative);
    addObservation(observations, occupied, {
      identityKey: key,
      identity,
      start,
      end: start + identity.length,
      evidence: "mention",
      signals: [
        "Nombre propio aparente dentro de una relación verbal de mención o recuerdo.",
        "Se propone para revisión sin inferir presencia física en la escena.",
      ],
      confidence: "review",
      known: false,
    });
  }

  const roleObject = new RegExp(
    `\\b(?:observa|mira|sigue|saluda|escucha|ve)\\s+a\\s+(?<identity>(?:un|una|el|la|los|las)\\s+(?:${PARTICIPANT_PATTERN}))\\b`,
    "giu",
  );
  for (const match of text.matchAll(roleObject)) {
    const identity = match.groups?.identity;
    if (!identity) continue;
    const relative = match[0].toLocaleUpperCase("es-MX").lastIndexOf(identity.toLocaleUpperCase("es-MX"));
    const start = (match.index ?? 0) + Math.max(0, relative);
    addObservation(observations, occupied, {
      identityKey: `ROLE:${sceneId ?? "PREAMBLE"}:${normalizeWriterCharacterIdentity(identity)}`,
      identity,
      start,
      end: start + identity.length,
      evidence: "indeterminate",
      signals: [
        "Sintagma de participante en una interacción observable.",
        "La relación exacta se deja indeterminada y requiere revisión.",
      ],
      confidence: "review",
      known: false,
    });
  }

  return observations.map<WriterCharacterObservation>((observation) => {
    const fingerprint = writerObservationTextHash([
      blockId,
      blockHash,
      observation.identityKey,
      observation.start,
      observation.end,
      observation.evidence,
      WRITER_CHARACTER_RULE_VERSION,
    ].join("\u0000"));
    return {
      ...observation,
      id: `${blockId}:${fingerprint}`,
      blockId,
      sceneId,
      excerpt: text,
      ruleVersion: WRITER_CHARACTER_RULE_VERSION,
      blockHash,
      fingerprint,
    };
  });
}

function addObservation(
  observations: WriterCharacterObservationDraft[],
  occupied: Array<{ start: number; end: number; key: string }>,
  observation: WriterCharacterObservationDraft,
) {
  if (occupied.some((item) => item.key === observation.identityKey
    && item.start === observation.start
    && item.end === observation.end)) return;
  occupied.push({ start: observation.start, end: observation.end, key: observation.identityKey });
  observations.push(observation);
}

function evidenceForKnownReference(text: string, start: number, end: number): WriterCharacterEvidence {
  const before = text.slice(Math.max(0, start - 28), start).toLocaleLowerCase("es-MX");
  const after = text.slice(end, Math.min(text.length, end + 30)).toLocaleLowerCase("es-MX");
  if (/(?:recuerda\s+a|habla\s+de|menciona\s+a|piensa\s+en)\s*$/u.test(before)) return "mention";
  if (/^\s+(?:no\s+está|no\s+se\s+encuentra|está\s+ausente)\b/u.test(after)) return "mention";
  return "actionReference";
}

function isPlausibleName(value: string) {
  const normalized = normalizeWriterCharacterIdentity(value);
  if (!normalized || NAME_STOP_WORDS.has(normalized)) return false;
  return normalized.length <= 64 && /[\p{L}\p{N}]/u.test(normalized);
}

function isActionVerb(value: string) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("es-MX");
  return (ACTION_VERBS as readonly string[]).includes(normalized);
}

function isEntryVerb(value: string) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("es-MX");
  return (ENTRY_VERBS as readonly string[]).includes(normalized);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
