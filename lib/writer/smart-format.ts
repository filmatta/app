import {
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
  const sourceText = targets.map(blockText).join("\n");
  const staging = analyzePastedWriterText(sourceText, "Formato automático");
  const changes: WriterAutoFormatChange[] = [];

  for (const detected of staging.blocks) {
    const target = targets[detected.sourceStartLine - 1];
    if (!target || target.attrs.kind !== "action" || !blockText(target).trim()) continue;
    if (detected.proposedKind === target.attrs.kind) continue;
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
    && !/[.!?…,:;]$/u.test(line)
    && Boolean(next)
    && !SCENE_HEADING.test(next)
    && !TRANSITION.test(next);
}
