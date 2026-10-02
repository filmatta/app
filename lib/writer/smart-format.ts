import {
  SCREENPLAY_KINDS,
  blockText,
  type ScreenplayKind,
  type WriterDocument,
} from "./document.ts";
import {
  analyzePastedWriterText,
  writerImportSummary,
  type WriterImportBlock,
  type WriterImportConfidence,
} from "./import.ts";
import { WRITER_NARRATIVE_PULSE_MIN_SCENES } from "./narrative-pulse.ts";
import { isClearlyNonCharacterLine } from "./character-cues.ts";

export const WRITER_SIGNIFICANT_PASTE_MIN_CHARACTERS = 120;
export const WRITER_SIGNIFICANT_PASTE_MIN_LINES = 4;

export type WriterPasteSignal =
  | "sceneHeading"
  | "characterDialogue"
  | "parenthetical"
  | "transition"
  | "multipleParagraphs";

export type WriterPasteAssessment = {
  qualifies: boolean;
  characters: number;
  nonEmptyLines: number;
  score: number;
  signals: WriterPasteSignal[];
};

export type WriterDocumentReadinessState =
  | "EMPTY"
  | "UNFORMATTED"
  | "PARTIALLY_FORMATTED"
  | "READY";

export type WriterStructuredFeature =
  | "review"
  | "assistant"
  | "setupPayoff"
  | "guided"
  | "timeline"
  | "pulse"
  | "ooc";

export type WriterDocumentReadiness = {
  state: WriterDocumentReadinessState;
  significantCharacters: number;
  meaningfulBlocks: number;
  sceneCount: number;
  characterCount: number;
  dialogueCount: number;
  suspiciousBlockIds: string[];
};

export type WriterFeatureReadiness = {
  available: boolean;
  reason: "empty" | "scenes" | "multipleScenes" | "charactersAndDialogue" | null;
};

export type WriterAutoFormatChange = {
  blockId: string;
  sourceLine: number;
  text: string;
  currentKind: ScreenplayKind;
  proposedKind: ScreenplayKind | null;
  confidence: WriterImportConfidence;
  signals: string[];
};

export type WriterAutoFormatPlan = {
  scope: "paste" | "document" | "partial";
  blockIds: string[];
  changes: WriterAutoFormatChange[];
  summary: ReturnType<typeof writerImportSummary>;
  alreadyFormatted: boolean;
};

export const WRITER_AUTO_FORMAT_MAX_AI_CANDIDATES = 80;

export type WriterAutoFormatCandidate = {
  blockId: string;
  text: string;
  currentKind: ScreenplayKind;
  parserProposal: ScreenplayKind | null;
  confidence: WriterImportConfidence;
  previousText: string | null;
  nextText: string | null;
  sceneHeading: string | null;
};

export type WriterAutoFormatClassification = {
  blockId: string;
  kind: ScreenplayKind;
  characterName: string | null;
};

const SCENE_HEADING = /^(?:INT\.?|EXT\.?|INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?)\s+\S/iu;
const PARENTHETICAL = /^\([^\n]+\)$/u;
const TRANSITION = /^(?:FADE (?:IN|OUT)|FADE TO BLACK|CUT TO|CORTE A|DISSOLVE TO)[:.]?$/iu;

export function assessWriterPaste(text: string): WriterPasteAssessment {
  const normalized = text.replace(/\r\n?/gu, "\n");
  const lines = normalized.split("\n");
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
  const signals = new Set<WriterPasteSignal>();
  let score = 0;

  if (/\n\s*\n/u.test(normalized)) {
    signals.add("multipleParagraphs");
    score += 1;
  }
  for (let index = 0; index < nonEmpty.length; index += 1) {
    const line = nonEmpty[index];
    const next = nonEmpty[index + 1] ?? "";
    if (SCENE_HEADING.test(line)) {
      signals.add("sceneHeading");
      score += 3;
    } else if (TRANSITION.test(line)) {
      signals.add("transition");
      score += 2;
    } else if (PARENTHETICAL.test(line)) {
      signals.add("parenthetical");
      score += 1;
    } else if (looksLikeCharacterCue(line, next)) {
      signals.add("characterDialogue");
      score += 2;
    }
  }

  const characters = [...normalized].length;
  const nonEmptyLines = nonEmpty.length;
  const enoughBody = characters >= WRITER_SIGNIFICANT_PASTE_MIN_CHARACTERS
    && nonEmptyLines >= WRITER_SIGNIFICANT_PASTE_MIN_LINES;
  const compactScreenplay = characters >= 60 && nonEmptyLines >= 3 && score >= 4;
  const longStructuredText = nonEmptyLines >= 8 && score >= 3;

  return {
    qualifies: Boolean((enoughBody && score >= 2) || compactScreenplay || longStructuredText),
    characters,
    nonEmptyLines,
    score,
    signals: [...signals],
  };
}

export function getWriterDocumentReadiness(document: WriterDocument): WriterDocumentReadiness {
  const meaningful = document.content.filter((block) => blockText(block).trim());
  const significantCharacters = meaningful.reduce(
    (total, block) => total + [...blockText(block)].filter((character) => !/\s/u.test(character)).length,
    0,
  );
  let sceneCount = 0;
  let characterCount = 0;
  let dialogueCount = 0;
  const suspiciousBlockIds: string[] = [];

  for (let index = 0; index < document.content.length; index += 1) {
    const block = document.content[index];
    const text = blockText(block).trim();
    if (!text) continue;
    if (block.attrs.kind === "sceneHeading") sceneCount += 1;
    if (block.attrs.kind === "character") characterCount += 1;
    if (block.attrs.kind === "dialogue") dialogueCount += 1;
    if (block.attrs.kind !== "action") continue;
    const next = document.content.slice(index + 1).find((candidate) => blockText(candidate).trim());
    if (SCENE_HEADING.test(text) || TRANSITION.test(text) || PARENTHETICAL.test(text)
      || looksLikeCharacterCue(text, next ? blockText(next).trim() : "")) {
      suspiciousBlockIds.push(block.attrs.id);
    }
  }

  let state: WriterDocumentReadinessState;
  if (meaningful.length === 0 || significantCharacters < 20) state = "EMPTY";
  else if (sceneCount === 0) state = "UNFORMATTED";
  else if (suspiciousBlockIds.length > 0) state = "PARTIALLY_FORMATTED";
  else state = "READY";

  return {
    state,
    significantCharacters,
    meaningfulBlocks: meaningful.length,
    sceneCount,
    characterCount,
    dialogueCount,
    suspiciousBlockIds,
  };
}

export function canUseStructuredFeature(
  readiness: WriterDocumentReadiness,
  feature: WriterStructuredFeature,
): WriterFeatureReadiness {
  if (readiness.state === "EMPTY") return { available: false, reason: "empty" };
  if (feature === "timeline") {
    return readiness.sceneCount >= 1
      ? { available: true, reason: null }
      : { available: false, reason: "scenes" };
  }
  if (feature === "pulse") {
    return readiness.sceneCount >= WRITER_NARRATIVE_PULSE_MIN_SCENES
      ? { available: true, reason: null }
      : { available: false, reason: "multipleScenes" };
  }
  if (feature === "setupPayoff") {
    return readiness.sceneCount >= 2
      ? { available: true, reason: null }
      : { available: false, reason: "multipleScenes" };
  }
  if (feature === "ooc") {
    return readiness.sceneCount >= 1 && readiness.characterCount >= 1 && readiness.dialogueCount >= 1
      ? { available: true, reason: null }
      : { available: false, reason: "charactersAndDialogue" };
  }
  return readiness.sceneCount >= 1
    ? { available: true, reason: null }
    : { available: false, reason: "scenes" };
}

export function createWriterAutoFormatPlan(
  document: WriterDocument,
  input: { scope: WriterAutoFormatPlan["scope"]; blockIds?: readonly string[] },
): WriterAutoFormatPlan {
  const requested = input.blockIds ? new Set(input.blockIds) : null;
  const targets = document.content.filter((block) => !requested || requested.has(block.attrs.id));
  const entirelyActionSource = targets.every((block) => block.attrs.kind === "action");
  const sourceText = targets.map(blockText).join("\n");
  const staging = analyzePastedWriterText(sourceText, "Formato automático");
  const changes: WriterAutoFormatChange[] = [];

  for (const detected of staging.blocks) {
    const target = targets[detected.sourceStartLine - 1];
    if (!target || target.attrs.kind !== "action" || !blockText(target).trim()) continue;
    if (detected.proposedKind === target.attrs.kind
      && (!entirelyActionSource || detected.confidence === "high")) continue;
    changes.push(toChange(target.attrs.id, target.attrs.kind, detected));
  }

  return {
    scope: input.scope,
    blockIds: targets.map((block) => block.attrs.id),
    changes,
    summary: writerImportSummary(staging.blocks),
    alreadyFormatted: changes.length === 0,
  };
}

export function resolveWriterAutoFormatChanges(
  plan: WriterAutoFormatPlan,
  choices: Readonly<Record<string, ScreenplayKind>>,
  reviewAll: boolean,
) {
  return plan.changes.flatMap((change) => {
    const selected = choices[change.blockId]
      ?? (reviewAll ? change.proposedKind ?? "action" : change.confidence === "high" ? change.proposedKind : null);
    if (!selected || selected === change.currentKind) return [];
    return [{ blockId: change.blockId, kind: selected }];
  });
}

export function writerAutoFormatCandidates(
  document: WriterDocument,
  plan: WriterAutoFormatPlan,
): WriterAutoFormatCandidate[] {
  const ambiguous = new Map(
    plan.changes
      .filter((change) => (change.confidence !== "high" || !change.proposedKind)
        && !isClearlyNonCharacterLine(change.text))
      .map((change) => [change.blockId, change]),
  );
  if (ambiguous.size === 0) return [];

  const meaningful = document.content
    .map((block, index) => ({ block, index, text: blockText(block).trim() }))
    .filter((item) => item.text);
  const positions = new Map(meaningful.map((item, index) => [item.block.attrs.id, index]));
  const result: WriterAutoFormatCandidate[] = [];

  for (const change of plan.changes) {
    if (!ambiguous.has(change.blockId)) continue;
    const meaningfulIndex = positions.get(change.blockId);
    if (meaningfulIndex === undefined) continue;
    const item = meaningful[meaningfulIndex];
    let sceneHeading: string | null = null;
    for (let cursor = meaningfulIndex - 1; cursor >= 0; cursor -= 1) {
      const candidate = meaningful[cursor];
      if (candidate.block.attrs.kind === "sceneHeading" || SCENE_HEADING.test(candidate.text)) {
        sceneHeading = clippedContext(candidate.text);
        break;
      }
    }
    result.push({
      blockId: change.blockId,
      text: clippedContext(item.text),
      currentKind: change.currentKind,
      parserProposal: change.proposedKind,
      confidence: change.confidence,
      previousText: meaningful[meaningfulIndex - 1]?.text
        ? clippedContext(meaningful[meaningfulIndex - 1].text)
        : null,
      nextText: meaningful[meaningfulIndex + 1]?.text
        ? clippedContext(meaningful[meaningfulIndex + 1].text)
        : null,
      sceneHeading,
    });
    if (result.length >= WRITER_AUTO_FORMAT_MAX_AI_CANDIDATES) break;
  }
  return result;
}

export function validateWriterAutoFormatClassifications(
  candidates: readonly WriterAutoFormatCandidate[],
  value: unknown,
): WriterAutoFormatClassification[] {
  if (!isRecord(value) || !Array.isArray(value.classifications)) {
    throw new Error("La clasificación asistida no tiene el formato esperado.");
  }
  const known = new Set(candidates.map((candidate) => candidate.blockId));
  const seen = new Set<string>();
  const classifications = value.classifications.map((entry) => {
    const allowedKeys = new Set(["blockId", "kind", "characterName"]);
    if (!isRecord(entry)
      || Object.keys(entry).some((key) => !allowedKeys.has(key))
      || typeof entry.blockId !== "string"
      || !known.has(entry.blockId)
      || seen.has(entry.blockId)
      || typeof entry.kind !== "string"
      || !SCREENPLAY_KINDS.includes(entry.kind as ScreenplayKind)
      || (entry.kind === "character"
        && isClearlyNonCharacterLine(candidates.find((candidate) => candidate.blockId === entry.blockId)?.text ?? ""))
      || !(entry.characterName === null || typeof entry.characterName === "string")) {
      throw new Error("La clasificación asistida contiene un resultado inválido.");
    }
    seen.add(entry.blockId);
    return {
      blockId: entry.blockId,
      kind: entry.kind as ScreenplayKind,
      characterName: entry.characterName === null ? null : entry.characterName.slice(0, 80),
    };
  });
  if (seen.size !== candidates.length) {
    throw new Error("La clasificación asistida no devolvió todos los bloques ambiguos.");
  }
  return classifications;
}

export function mergeWriterAutoFormatClassifications(
  plan: WriterAutoFormatPlan,
  classifications: readonly WriterAutoFormatClassification[],
): WriterAutoFormatPlan {
  const classified = new Map(classifications.map((item) => [item.blockId, item]));
  const byKind = { ...plan.summary.byKind };
  let unresolved = plan.summary.unresolved;
  let needsReview = plan.summary.needsReview;
  const characterNames = new Set<string>();
  const changes = plan.changes.map((change) => {
    if (change.proposedKind === "character") characterNames.add(normalizedCharacterName(change.text));
    const result = classified.get(change.blockId);
    if (!result) return change;
    if (change.proposedKind) byKind[change.proposedKind] = Math.max(0, byKind[change.proposedKind] - 1);
    else unresolved = Math.max(0, unresolved - 1);
    byKind[result.kind] += 1;
    if (change.confidence !== "high" || !change.proposedKind) needsReview = Math.max(0, needsReview - 1);
    if (result.kind === "character") characterNames.add(normalizedCharacterName(change.text));
    return {
      ...change,
      proposedKind: result.kind,
      confidence: "high" as const,
      signals: [...change.signals, "Clasificación contextual asistida aplicada sin modificar el texto."],
    };
  });
  return {
    ...plan,
    changes,
    summary: {
      ...plan.summary,
      byKind,
      unresolved,
      needsReview,
      distinctCharacterNames: Math.max(plan.summary.distinctCharacterNames, characterNames.size),
    },
    alreadyFormatted: changes.length === 0,
  };
}

function toChange(blockId: string, currentKind: ScreenplayKind, detected: WriterImportBlock): WriterAutoFormatChange {
  return {
    blockId,
    sourceLine: detected.sourceStartLine,
    text: detected.originalText,
    currentKind,
    proposedKind: detected.proposedKind,
    confidence: detected.confidence,
    signals: detected.signals,
  };
}

function looksLikeCharacterCue(line: string, next: string) {
  const normalized = line.normalize("NFKC").toLocaleUpperCase("es-MX");
  return [...line].length <= 42
    && /\p{L}/u.test(line)
    && line === normalized
    && !isClearlyNonCharacterLine(line)
    && !/[.!?…,:;]$/u.test(line)
    && Boolean(next)
    && !SCENE_HEADING.test(next)
    && !TRANSITION.test(next);
}

function clippedContext(value: string) {
  return [...value].slice(0, 240).join("");
}

function normalizedCharacterName(value: string) {
  return value.trim().replace(/\s+/gu, " ").normalize("NFKC").toLocaleUpperCase("es-MX");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
