import {
  blockText,
  deriveCharacters,
  type ScreenplayKind,
  type WriterDocument,
} from "./document.ts";
import {
  writerCharacterIdentityKey,
  type WriterCharacterObservation,
  type WriterKnownCharacterIdentity,
} from "./character-observations.ts";

export type CharacterWritingMetrics = {
  key: string;
  name: string;
  interventions: number;
  sceneInterventions: number;
};

export type WriterAcceptedCharacterActivity = {
  key: string;
  name: string;
  evidenceCount: number;
  firstBlockId: string | null;
  sceneCount: number;
  firstSceneOrder: number | null;
  lastSceneOrder: number | null;
};

const TURN_END_KINDS = new Set<ScreenplayKind>([
  "character",
  "sceneHeading",
  "action",
  "transition",
]);

export const QUICK_INSERTS = [
  { text: "FADE IN:", kind: "action", label: "FADE IN:" },
  { text: "FADE OUT.", kind: "transition", label: "FADE OUT." },
  { text: "CUT TO:", kind: "transition", label: "CUT TO:" },
  { text: "DISSOLVE TO:", kind: "transition", label: "DISSOLVE TO:" },
  { text: "FADE TO BLACK.", kind: "transition", label: "FADE TO BLACK." },
] as const satisfies ReadonlyArray<{ text: string; kind: ScreenplayKind; label: string }>;

export function buildSceneHeading(environment: string, place: string, moment: string): string {
  const cleanEnvironment = normalizeHeadingPart(environment).replace(/\.+$/u, "");
  const cleanPlace = normalizeHeadingPart(place);
  const cleanMoment = normalizeHeadingPart(moment);
  if (!cleanEnvironment || !cleanPlace || !cleanMoment) return "";
  return `${cleanEnvironment}. ${cleanPlace} - ${cleanMoment}`;
}

export function deriveCharacterWritingMetrics(document: WriterDocument): CharacterWritingMetrics[] {
  const identified = deriveCharacters(document);
  const byKey = new Map<string, CharacterWritingMetrics>(
    identified.map((character) => [
      character.key,
      { key: character.key, name: character.name, interventions: 0, sceneInterventions: 0 },
    ]),
  );
  const scenesByCharacter = new Map<string, Set<string>>();
  let sceneId: string | null = null;
  let turn: { key: string; sceneId: string | null; hasDialogue: boolean } | null = null;

  const finishTurn = () => {
    if (!turn?.hasDialogue) {
      turn = null;
      return;
    }
    const metrics = byKey.get(turn.key);
    if (metrics) {
      metrics.interventions += 1;
      if (turn.sceneId) {
        const scenes = scenesByCharacter.get(turn.key) ?? new Set<string>();
        scenes.add(turn.sceneId);
        scenesByCharacter.set(turn.key, scenes);
      }
    }
    turn = null;
  };

  for (const block of document.content) {
    if (block.attrs.kind === "sceneHeading") {
      finishTurn();
      sceneId = block.attrs.id;
      continue;
    }
    if (block.attrs.kind === "character") {
      finishTurn();
      const key = canonicalCharacterKey(blockText(block));
      if (byKey.has(key)) turn = { key, sceneId, hasDialogue: false };
      continue;
    }
    if (block.attrs.kind === "dialogue" && blockText(block).trim() && turn) turn.hasDialogue = true;
    else if (TURN_END_KINDS.has(block.attrs.kind)) finishTurn();
  }
  finishTurn();

  for (const metrics of byKey.values()) {
    metrics.sceneInterventions = scenesByCharacter.get(metrics.key)?.size ?? 0;
  }
  return [...byKey.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
  );
}

export function deriveAcceptedCharacterActivity(
  document: WriterDocument,
  identities: readonly WriterKnownCharacterIdentity[],
  observations: readonly WriterCharacterObservation[],
): WriterAcceptedCharacterActivity[] {
  const accepted = new Map(identities.map((identity) => [identity.key, identity]));
  const evidenceByKey = new Map<string, Map<string, string>>();
  const sceneOrderById = new Map<string, number>();
  const sceneIdsByKey = new Map<string, Set<string>>();
  let currentSceneId: string | null = null;
  let currentSceneOrder = 0;
  for (const block of document.content) {
    if (block.attrs.kind === "sceneHeading") {
      currentSceneId = block.attrs.id;
      currentSceneOrder += 1;
      sceneOrderById.set(currentSceneId, currentSceneOrder);
    }
    if (block.attrs.kind !== "character") continue;
    const key = writerCharacterIdentityKey(blockText(block));
    if (!accepted.has(key) || !currentSceneId) continue;
    const scenes = sceneIdsByKey.get(key) ?? new Set<string>();
    scenes.add(currentSceneId);
    sceneIdsByKey.set(key, scenes);
  }
  for (const observation of observations) {
    if (!accepted.has(observation.identityKey)) continue;
    const evidence = evidenceByKey.get(observation.identityKey) ?? new Map<string, string>();
    evidence.set(observation.fingerprint, observation.blockId);
    evidenceByKey.set(observation.identityKey, evidence);
    if (observation.sceneId) {
      const scenes = sceneIdsByKey.get(observation.identityKey) ?? new Set<string>();
      scenes.add(observation.sceneId);
      sceneIdsByKey.set(observation.identityKey, scenes);
    }
  }
  for (const block of document.content) {
    if (block.attrs.kind !== "character") continue;
    const key = writerCharacterIdentityKey(blockText(block));
    if (!accepted.has(key)) continue;
    const evidence = evidenceByKey.get(key) ?? new Map<string, string>();
    if (![...evidence.values()].includes(block.attrs.id)) evidence.set(`block:${block.attrs.id}`, block.attrs.id);
    evidenceByKey.set(key, evidence);
  }
  return identities
    .map((identity) => {
      const evidence = evidenceByKey.get(identity.key) ?? new Map<string, string>();
      const orders = [...(sceneIdsByKey.get(identity.key) ?? new Set<string>())]
        .map((sceneId) => sceneOrderById.get(sceneId))
        .filter((order): order is number => typeof order === "number")
        .sort((left, right) => left - right);
      return {
        key: identity.key,
        name: identity.name,
        evidenceCount: evidence.size,
        firstBlockId: evidence.values().next().value ?? null,
        sceneCount: orders.length,
        firstSceneOrder: orders.at(0) ?? null,
        lastSceneOrder: orders.at(-1) ?? null,
      };
    })
    .filter((activity, index) => activity.evidenceCount > 0 || identities[index]?.source === "manual")
    .sort((left, right) => right.evidenceCount - left.evidenceCount
      || left.name.localeCompare(right.name, "es", { sensitivity: "base" }));
}

export function countTextualMentions(
  document: WriterDocument,
  selectedKey: string,
  characters = deriveCharacters(document),
): number {
  const candidates = characters
    .map(({ key, name }) => ({ key, name: name.normalize("NFKC") }))
    .filter(({ name }) => name.length > 0)
    .sort((left, right) => right.name.length - left.name.length || left.name.localeCompare(right.name, "es"));
  if (!candidates.some(({ key }) => key === selectedKey) || !candidates.length) return 0;

  const alternatives = candidates.map(({ name }) => escapeRegExp(name)).join("|");
  const matcher = new RegExp(`(?<![\\p{L}\\p{N}_])(${alternatives})(?![\\p{L}\\p{N}_])`, "giu");
  const keyByNormalizedName = new Map(candidates.map(({ key, name }) => [canonicalCharacterKey(name), key]));
  let count = 0;

  for (const block of document.content) {
    if (block.attrs.kind !== "action" && block.attrs.kind !== "dialogue") continue;
    for (const match of blockText(block).normalize("NFKC").matchAll(matcher)) {
      if (keyByNormalizedName.get(canonicalCharacterKey(match[1])) === selectedKey) count += 1;
    }
  }
  return count;
}

export function canonicalCharacterKey(value: string): string {
  return value.trim().replace(/\s+/gu, " ").normalize("NFKC").toLocaleUpperCase("es-MX");
}

function normalizeHeadingPart(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleUpperCase("es-MX");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
