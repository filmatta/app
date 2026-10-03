const SPANISH_MONTHS = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
] as const;

const ENGLISH_MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;

const KNOWN_CUE_MODALITIES = new Map<string, string>([
  ["V.O.", "V.O."], ["VO", "V.O."],
  ["O.S.", "O.S."], ["OS", "O.S."],
  ["OFF", "OFF"],
  ["CONTINUED", "CONT."], ["CONTINUADO", "CONT."], ["CONT'D", "CONT."], ["CONT’D", "CONT."], ["CONT.", "CONT."],
  ["VIDEO", "VIDEO"], ["VÍDEO", "VIDEO"],
  ["TELÉFONO", "TELÉFONO"], ["TELEFONO", "TELÉFONO"],
  ["ALTAVOCES", "ALTAVOCES"], ["ALTAVOZ", "ALTAVOCES"],
  ["GRABACIÓN", "GRABACIÓN"], ["GRABACION", "GRABACIÓN"],
]);

const SAFE_NON_CHARACTER_LABEL = /^(?:T[IÍ]TULO|TITLE|ESCRITO POR|WRITTEN BY|GUION DE|SCREENPLAY BY|BORRADOR|DRAFT|COPYRIGHT|P[AÁ]GINA\s+\d+|PAGE\s+\d+|EN PANTALLA|ON SCREEN|LETRERO|SIGN|INSERT|LOCACI[OÓ]N|LOCATION)(?:\s*:.*)?$/iu;
const TRANSITION_LINE = /^(?:FADE IN:|FADE OUT:|CORTE A:|CORTE DIRECTO A:|DISOLVENCIA A:|SMASH CUT TO:|CUT TO:|DISSOLVE TO:)$/iu;
const SCENE_HEADING_LINE = /^(?:INT\.?|EXT\.?|INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?)\s+/iu;

export type WriterCharacterCueIdentity = {
  name: string;
  key: string;
  modalities: string[];
};

export function normalizeWriterCharacterText(value: string) {
  return value.trim().replace(/\s+/gu, " ").normalize("NFKC").toLocaleUpperCase("es-MX");
}

export function parseWriterCharacterCue(value: string): WriterCharacterCueIdentity {
  const original = value.trim().replace(/\s+/gu, " ");
  let name = original;
  const modalities: string[] = [];

  while (name) {
    const match = name.match(/\s*\(([^()]{1,32})\)\s*$/u);
    if (!match) break;
    const normalizedCue = normalizeCueModality(match[1]);
    if (!normalizedCue) break;
    modalities.unshift(normalizedCue);
    name = name.slice(0, match.index).trim();
  }

  if (!name) name = original;
  return {
    name,
    key: normalizeWriterCharacterText(name),
    modalities: [...new Set(modalities)],
  };
}

export function normalizeWriterCharacterCueModality(value: string) {
  return normalizeCueModality(value);
}

export function isClearlyNonCharacterLine(value: string) {
  const compact = value.trim().replace(/\s+/gu, " ").normalize("NFKC");
  const normalized = normalizeWriterCharacterText(compact);
  if (!normalized) return true;
  return isWriterDateLine(normalized)
    || isWriterTimeLine(normalized)
    || SCENE_HEADING_LINE.test(normalized)
    || TRANSITION_LINE.test(normalized)
    || SAFE_NON_CHARACTER_LABEL.test(normalized)
    || (/\p{L}/u.test(compact)
      && compact === normalized
      && /[.!?…,:;]$/u.test(compact));
}

export function isWriterDateLine(value: string) {
  const normalized = normalizeWriterCharacterText(value).replace(/,+/gu, " ").replace(/\s+/gu, " ");
  const spanish = SPANISH_MONTHS.join("|");
  const english = ENGLISH_MONTHS.join("|");
  return new RegExp(`^\\d{1,2}(?:\\s+DE)?\\s+(?:${spanish})(?:\\s+DE)?(?:\\s+\\d{2,4})?$`, "u").test(normalized)
    || new RegExp(`^\\d{1,2}\\s+(?:${english})(?:\\s+\\d{2,4})?$`, "u").test(normalized)
    || new RegExp(`^(?:${english})\\s+\\d{1,2}(?:\\s+\\d{2,4})?$`, "u").test(normalized)
    || /^\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?$/u.test(normalized);
}

export function isWriterTimeLine(value: string) {
  const normalized = normalizeWriterCharacterText(value).replace(/\s+/gu, " ");
  return /^(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[AP]\.?M\.?)?(?:\s+HRS?)?$/u.test(normalized)
    || /^\d{1,2}\s*[AP]\.?M\.?$/u.test(normalized);
}

function normalizeCueModality(value: string) {
  const normalized = normalizeWriterCharacterText(value)
    .replace(/\s+/gu, " ")
    .replace(/^V\s*\.?\s*O\.?$/u, "V.O.")
    .replace(/^O\s*\.?\s*S\.?$/u, "O.S.");
  return KNOWN_CUE_MODALITIES.get(normalized) ?? null;
}
