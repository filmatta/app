import {
  STORYBOARD_MAX_BYTES,
  STORYBOARD_MAX_OBJECTS,
  STORYBOARD_MAX_POINTS,
  STORYBOARD_MAX_TEXT,
  STORYBOARD_SCHEMA_VERSION,
  type StoryboardContentKind,
  type StoryboardDocument,
  type StoryboardObject,
  type StoryboardPoint,
} from "./types.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLOR_PATTERN = /^(#[0-9a-f]{6}|rgba?\([^)]+\))$/i;
const FONT_FAMILIES = new Set(["Arial", "Georgia", "Courier New"]);
const ALIGNMENTS = new Set(["left", "center", "right"]);

export type StoryboardDocumentValidation =
  | { ok: true; document: StoryboardDocument; bytes: number; points: number }
  | { ok: false; reason: string };

export function validateStoryboardDocument(value: unknown): StoryboardDocumentValidation {
  if (!isRecord(value) || value.schemaVersion !== STORYBOARD_SCHEMA_VERSION) {
    return invalid("La versión del dibujo no es compatible.");
  }
  if (!isRecord(value.frame) || !validDimension(value.frame.width) || !validDimension(value.frame.height)) {
    return invalid("El encuadre no es válido.");
  }
  if (!Array.isArray(value.objects) || value.objects.length > STORYBOARD_MAX_OBJECTS) {
    return invalid(`El panel admite hasta ${STORYBOARD_MAX_OBJECTS.toLocaleString("es-MX")} objetos.`);
  }

  let reference: StoryboardDocument["reference"] = null;
  if (value.reference !== null) {
    if (!isRecord(value.reference)
      || !validUuid(value.reference.assetId)
      || !validNumber(value.reference.x)
      || !validNumber(value.reference.y)
      || !validPositive(value.reference.width, 100_000)
      || !validPositive(value.reference.height, 100_000)
      || !validNumber(value.reference.rotation, 36_000)
      || !validRange(value.reference.opacity, 0, 1)) {
      return invalid("La referencia base no es válida.");
    }
    reference = {
      assetId: value.reference.assetId,
      x: value.reference.x,
      y: value.reference.y,
      width: value.reference.width,
      height: value.reference.height,
      rotation: value.reference.rotation,
      opacity: value.reference.opacity,
    };
  }

  const ids = new Set<string>();
  const objects: StoryboardObject[] = [];
  let points = 0;
  for (const raw of value.objects) {
    const parsed = parseObject(raw);
    if (!parsed.ok) return parsed;
    if (ids.has(parsed.object.id)) return invalid("Cada objeto del panel debe tener un ID único.");
    ids.add(parsed.object.id);
    if (parsed.object.type === "stroke") points += parsed.object.points.length;
    else if (parsed.object.type === "line" || parsed.object.type === "arrow") points += 2;
    if (points > STORYBOARD_MAX_POINTS) {
      return invalid(`El panel admite hasta ${STORYBOARD_MAX_POINTS.toLocaleString("es-MX")} puntos.`);
    }
    objects.push(parsed.object);
  }

  const document: StoryboardDocument = {
    schemaVersion: STORYBOARD_SCHEMA_VERSION,
    frame: { width: value.frame.width, height: value.frame.height },
    reference,
    objects,
  };
  const bytes = new TextEncoder().encode(stableStringify(document)).byteLength;
  if (bytes > STORYBOARD_MAX_BYTES) return invalid("El panel supera el límite editable de 2 MB.");
  return { ok: true, document, bytes, points };
}

export function storyboardContentKind(document: StoryboardDocument): StoryboardContentKind {
  const hasDrawing = document.objects.length > 0;
  const hasReference = document.reference !== null;
  if (hasDrawing && hasReference) return "mixed";
  if (hasDrawing) return "drawing";
  if (hasReference) return "reference";
  return "empty";
}

export function storyboardCanonicalPayload(document: StoryboardDocument, visualNote: string | null) {
  return stableStringify({ document, visualNote: visualNote?.trim() || null });
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseObject(value: unknown): { ok: true; object: StoryboardObject } | { ok: false; reason: string } {
  if (!isRecord(value) || !validUuid(value.id) || typeof value.type !== "string"
    || typeof value.color !== "string" || !COLOR_PATTERN.test(value.color)
    || !validRange(value.opacity, 0, 1)
    || !validTransform(value)) return invalid("Un objeto del dibujo no es válido.");

  const base = {
    id: value.id,
    type: value.type,
    color: value.color,
    opacity: value.opacity,
    x: value.x as number,
    y: value.y as number,
    rotation: value.rotation as number,
    scaleX: value.scaleX as number,
    scaleY: value.scaleY as number,
  };

  if (value.type === "stroke") {
    if (!Array.isArray(value.points) || value.points.length < 2 || !validPositive(value.width, 200)) {
      return invalid("Un trazo no es válido.");
    }
    const points: StoryboardPoint[] = [];
    for (const point of value.points) {
      if (!isRecord(point) || !validNumber(point.x) || !validNumber(point.y)
        || (point.pressure !== undefined && !validRange(point.pressure, 0, 1))) {
        return invalid("Un punto del trazo no es válido.");
      }
      points.push({ x: point.x, y: point.y, ...(point.pressure === undefined ? {} : { pressure: point.pressure }) });
    }
    return { ok: true, object: { ...base, type: "stroke", width: value.width, points } };
  }
  if (value.type === "line" || value.type === "arrow") {
    if (!Array.isArray(value.points) || value.points.length !== 4
      || !value.points.every((point) => validNumber(point)) || !validPositive(value.width, 200)) {
      return invalid("La línea o flecha no es válida.");
    }
    return { ok: true, object: { ...base, type: value.type, width: value.width, points: value.points as [number, number, number, number] } };
  }
  if (value.type === "rectangle" || value.type === "ellipse") {
    if (!validPositive(value.width, 100_000) || !validPositive(value.height, 100_000)
      || !validPositive(value.strokeWidth, 200)
      || (value.fill !== null && (typeof value.fill !== "string" || !COLOR_PATTERN.test(value.fill)))) {
      return invalid("La forma no es válida.");
    }
    return { ok: true, object: { ...base, type: value.type, width: value.width, height: value.height, strokeWidth: value.strokeWidth, fill: value.fill } };
  }
  if (value.type === "text") {
    if (typeof value.text !== "string" || value.text.length < 1 || value.text.length > STORYBOARD_MAX_TEXT
      || !validPositive(value.width, 100_000) || !validPositive(value.fontSize, 500)
      || typeof value.fontFamily !== "string" || !FONT_FAMILIES.has(value.fontFamily)
      || typeof value.align !== "string" || !ALIGNMENTS.has(value.align)) {
      return invalid("La anotación de texto no es válida.");
    }
    return { ok: true, object: { ...base, type: "text", text: value.text, width: value.width, fontSize: value.fontSize, fontFamily: value.fontFamily as "Arial" | "Georgia" | "Courier New", align: value.align as "left" | "center" | "right" } };
  }
  return invalid("El tipo de objeto no está permitido.");
}

function validTransform(value: Record<string, unknown>) {
  return validNumber(value.x) && validNumber(value.y) && validNumber(value.rotation, 36_000)
    && validRange(value.scaleX, -100, 100, 0.01) && validRange(value.scaleY, -100, 100, 0.01);
}

function validDimension(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 240 && Number(value) <= 8_192;
}

function validNumber(value: unknown, absoluteMax = 100_000): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= absoluteMax;
}

function validPositive(value: unknown, max: number): value is number {
  return validNumber(value, max) && value > 0;
}

function validRange(value: unknown, min: number, max: number, minimumAbsolute = 0): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    && (minimumAbsolute === 0 || Math.abs(value) >= minimumAbsolute);
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function invalid(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
