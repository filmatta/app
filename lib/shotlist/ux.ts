import type { WriterShot, WriterShotlist, WriterShotlistGroup } from "@/lib/writer/production";

export const SHOTLIST_LENSES = [
  8, 10, 12, 14, 15, 16, 18, 20, 21, 24, 25, 27, 28, 29, 32, 35, 40,
  50, 58, 65, 75, 85, 100, 105, 135, 150, 180, 200, 300,
].map((value) => `${value} mm`);

export type ShotlistColumnKey =
  | "number"
  | "scene"
  | "location"
  | "interiorExterior"
  | "shotType"
  | "subject"
  | "description"
  | "lens"
  | "composition"
  | "angle"
  | "movement"
  | "support"
  | "setup"
  | "durationSeconds"
  | "status"
  | "notes"
  | "storyboard";

export const SHOTLIST_COLUMNS: Array<{
  key: ShotlistColumnKey;
  label: string;
  defaultVisible: boolean;
  filterable: boolean;
}> = [
  { key: "number", label: "Plano", defaultVisible: true, filterable: false },
  { key: "scene", label: "Escena", defaultVisible: true, filterable: true },
  { key: "location", label: "Locación", defaultVisible: true, filterable: true },
  { key: "interiorExterior", label: "INT / EXT", defaultVisible: true, filterable: true },
  { key: "shotType", label: "Tipología", defaultVisible: true, filterable: true },
  { key: "subject", label: "Acción", defaultVisible: true, filterable: true },
  { key: "description", label: "Descripción", defaultVisible: true, filterable: true },
  { key: "lens", label: "Óptica", defaultVisible: true, filterable: true },
  { key: "composition", label: "Composición", defaultVisible: false, filterable: true },
  { key: "angle", label: "Ángulo", defaultVisible: true, filterable: true },
  { key: "movement", label: "Movimiento", defaultVisible: true, filterable: true },
  { key: "support", label: "Soporte", defaultVisible: false, filterable: true },
  { key: "setup", label: "Setup", defaultVisible: false, filterable: true },
  { key: "durationSeconds", label: "Duración (s)", defaultVisible: false, filterable: true },
  { key: "status", label: "Estado", defaultVisible: true, filterable: true },
  { key: "notes", label: "Observaciones", defaultVisible: true, filterable: true },
  { key: "storyboard", label: "Storyboard", defaultVisible: false, filterable: false },
];

export type ShotlistFilter = {
  id: string;
  column: Exclude<ShotlistColumnKey, "number" | "storyboard">;
  condition: "equals" | "contains" | "empty" | "in" | "none";
  value: string;
  values?: string[];
};

export const SHOTLIST_VALUE_COLUMNS: ShotlistFilter["column"][] = ["location", "interiorExterior", "shotType", "lens", "angle", "movement", "support", "status"];

export function shotlistFilterValue(row: ShotlistRowContext, column: ShotlistFilter["column"]) {
  if (column === "location") return row.group.id;
  if (column === "lens") return normalizeLens(row.shot.lens);
  if (column === "status") return row.shot.status;
  return normalizeText(rowValue(row, column));
}

export function shotlistValueCatalog(rows: ShotlistRowContext[], column: ShotlistFilter["column"]) {
  const values = new Map<string, { key: string; label: string; detail: string; count: number }>();
  for (const row of rows) {
    const key = shotlistFilterValue(row, column);
    const raw = rowValue(row, column);
    const label = column === "status" ? row.shot.status === "ready" ? "Listo" : "Pendiente" : column === "lens" ? normalizeLens(raw) || "(Sin especificar)" : raw.trim() || "(Sin especificar)";
    const detail = column === "location" ? `Esc. ${row.sceneNumber} · ${row.group.title}` : "";
    const existing = values.get(key);
    if (existing) existing.count += 1;
    else values.set(key, { key, label, detail, count: 1 });
  }
  return [...values.values()].sort((a, b) => a.label.localeCompare(b.label, "es-MX") || a.detail.localeCompare(b.detail, "es-MX"));
}

export type ShotlistRowContext = {
  group: WriterShotlistGroup;
  shot: WriterShot;
  number: number;
  sceneNumber: number;
  location: string;
  interiorExterior: string;
};

export function deriveSceneContext(title: string) {
  const normalized = title.trim().replace(/\s+/gu, " ");
  const prefix = normalized.match(/^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|INT\.?|EXT\.?)(?:\s+|$)/iu)?.[1] ?? "";
  const interiorExterior = prefix.replace(/\s+/gu, " ").toLocaleUpperCase("es-MX");
  const withoutPrefix = prefix ? normalized.slice(prefix.length).trim() : normalized;
  const location = withoutPrefix.split(/\s+[—–-]\s+(?=(?:D[IÍ]A|NOCHE|TARDE|MAÑANA|MADRUGADA|CONTINUO|MOMENTOS DESPU[EÉ]S)\b)/iu)[0]?.trim() ?? "";
  return { interiorExterior, location };
}

export function normalizeLens(value: string | null | undefined) {
  const text = String(value ?? "").trim().toLocaleLowerCase("es-MX");
  const match = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:mm)?$/u);
  return match ? `${Number(match[1]!.replace(",", "."))} mm` : text;
}

export function shotlistRows(shotlist: WriterShotlist): ShotlistRowContext[] {
  let number = 0;
  return shotlist.groups.flatMap((group, groupIndex) => {
    const context = deriveSceneContext(group.title);
    return group.shots.map((shot) => ({
      group,
      shot,
      number: ++number,
      sceneNumber: groupIndex + 1,
      ...context,
    }));
  });
}

export function filterShotlistRows(rows: ShotlistRowContext[], search: string, filters: ShotlistFilter[]) {
  const query = normalizeText(search);
  const filtersByColumn = new Map<ShotlistFilter["column"], ShotlistFilter[]>();
  for (const filter of filters) filtersByColumn.set(filter.column, [...(filtersByColumn.get(filter.column) ?? []), filter]);
  return rows.filter((row) => {
    if (query && !searchableValues(row).some((value) => normalizeText(value).includes(query))) return false;
    for (const [column, columnFilters] of filtersByColumn) {
      const actual = rowValue(row, column);
      if (!columnFilters.some((filter) => filterMatches(column, actual, filter, row))) return false;
    }
    return true;
  });
}

export function filteredShotlist(shotlist: WriterShotlist, rows: ShotlistRowContext[]): WriterShotlist {
  const allowed = new Set(rows.map((row) => row.shot.id));
  return {
    ...shotlist,
    groups: shotlist.groups.flatMap((group) => {
      const shots = group.shots.filter((shot) => allowed.has(shot.id));
      return shots.length ? [{ ...group, shots }] : [];
    }),
  };
}

export function shotClipboardText(row: ShotlistRowContext) {
  return [
    `Plano ${String(row.number).padStart(2, "0")} · Escena ${String(row.sceneNumber).padStart(2, "0")}`,
    row.group.title,
    `${row.shot.shotType} · ${row.shot.angle} · ${row.shot.movement}`,
    row.shot.lens ? `Óptica: ${row.shot.lens}` : null,
    row.shot.subject || row.shot.description || "Sin acción definida",
    row.shot.notes ? `Observaciones: ${row.shot.notes}` : null,
  ].filter(Boolean).join("\n");
}

export function groupClipboardText(group: WriterShotlistGroup, groupNumber: number, allRows: ShotlistRowContext[]) {
  const rows = allRows.filter((row) => row.group.id === group.id);
  return [
    `Escena ${String(groupNumber).padStart(2, "0")} · ${group.title}`,
    `${rows.length} ${rows.length === 1 ? "plano" : "planos"}`,
    ...rows.map((row) => `${String(row.number).padStart(2, "0")} · ${row.shot.shotType} · ${row.shot.subject || "Sin acción"}`),
  ].join("\n");
}

export function shotlistCsv(shotlist: WriterShotlist, columns: ShotlistColumnKey[]) {
  const printable = columns.filter((column) => column !== "storyboard");
  const rows = shotlistRows(shotlist).map((row) => printable.map((column) => exportValue(row, column)));
  const header = printable.map((column) => SHOTLIST_COLUMNS.find((candidate) => candidate.key === column)?.label ?? column);
  return `\uFEFF${[header, ...rows].map((values) => values.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export type ParsedTable = {
  delimiter: "," | ";";
  headers: string[];
  rows: string[][];
  warnings: string[];
};

export function parseShotlistCsv(input: string, limits = { rows: 5_000, columns: 80, cells: 120_000 }): ParsedTable {
  const source = input.replace(/^\uFEFF/u, "");
  const delimiter = detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"' && cell.length === 0) quoted = true;
    else if (character === delimiter) { row.push(cell); cell = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
      if (rows.length > limits.rows + 1) throw new Error(`El archivo supera el límite de ${limits.rows} filas.`);
    } else cell += character;
  }
  if (quoted) throw new Error("Hay una celda entre comillas sin cerrar.");
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((values) => values.some((value) => value.trim().length));
  const headers = (nonEmpty.shift() ?? []).map((value) => value.trim());
  if (!headers.length) throw new Error("El archivo no contiene encabezados.");
  if (nonEmpty.length > limits.rows) throw new Error(`El archivo supera el límite de ${limits.rows} filas.`);
  if (headers.length > limits.columns) throw new Error(`El archivo supera el límite de ${limits.columns} columnas.`);
  if (nonEmpty.length * headers.length > limits.cells) throw new Error(`El archivo supera el límite de ${limits.cells} celdas.`);
  const warnings: string[] = [];
  const normalizedRows = nonEmpty.map((values, index) => {
    if (values.length !== headers.length) warnings.push(`Fila ${index + 2}: ${values.length} celdas para ${headers.length} encabezados.`);
    return Array.from({ length: headers.length }, (_, column) => values[column] ?? "");
  });
  return { delimiter, headers, rows: normalizedRows, warnings };
}

export function suggestedImportColumn(header: string): ShotlistColumnKey | "skip" {
  const normalized = normalizeText(header).replace(/[^a-z0-9áéíóúñ/ ]/giu, "");
  const exact: Record<string, ShotlistColumnKey> = {
    "#": "number", numero: "number", número: "number", plano: "number",
    escena: "scene", locacion: "location", locación: "location", "int / ext": "interiorExterior", "int/ext": "interiorExterior",
    tipologia: "shotType", tipología: "shotType", "tipo de plano": "shotType", encuadre: "shotType",
    accion: "subject", acción: "subject", sujeto: "subject", descripcion: "description", descripción: "description",
    lente: "lens", optica: "lens", óptica: "lens", composicion: "composition", composición: "composition",
    angulo: "angle", ángulo: "angle", movimiento: "movement", soporte: "support", setup: "setup",
    duracion: "durationSeconds", duración: "durationSeconds", estado: "status", notas: "notes", observaciones: "notes",
  };
  return exact[normalized] ?? "skip";
}

function detectDelimiter(source: string): "," | ";" {
  const sample = source.slice(0, 16_000);
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const character of sample) {
    if (character === '"') quoted = !quoted;
    else if (!quoted && character === ",") commas += 1;
    else if (!quoted && character === ";") semicolons += 1;
    else if (!quoted && (character === "\n" || character === "\r")) break;
  }
  return semicolons > commas ? ";" : ",";
}

function searchableValues(row: ShotlistRowContext) {
  return [row.group.title, row.location, row.interiorExterior, row.shot.shotType, row.shot.subject, row.shot.description, row.shot.lens, row.shot.composition, row.shot.angle, row.shot.movement, row.shot.support, row.shot.setup, row.shot.notes];
}

function rowValue(row: ShotlistRowContext, column: ShotlistFilter["column"]) {
  if (column === "scene") return row.group.title;
  if (column === "location") return row.location;
  if (column === "interiorExterior") return row.interiorExterior;
  if (column === "durationSeconds") return row.shot.durationSeconds == null ? "" : String(row.shot.durationSeconds);
  return String(row.shot[column] ?? "");
}

function filterMatches(column: ShotlistFilter["column"], actual: string, filter: ShotlistFilter, row: ShotlistRowContext) {
  if (filter.condition === "none") return false;
  if (filter.condition === "in") return (filter.values ?? []).includes(shotlistFilterValue(row, column));
  if (filter.condition === "empty") return !actual.trim();
  const expected = filter.value;
  if (column === "lens") {
    const normalizedActual = normalizeLens(actual);
    const normalizedExpected = normalizeLens(expected);
    return filter.condition === "equals"
      ? normalizedActual === normalizedExpected
      : normalizedActual.includes(normalizedExpected);
  }
  const left = normalizeText(actual);
  const right = normalizeText(expected);
  return filter.condition === "equals" ? left === right : left.includes(right);
}

function normalizeText(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("es-MX");
}

function exportValue(row: ShotlistRowContext, column: ShotlistColumnKey) {
  if (column === "number") return row.number;
  if (column === "scene") return `ESC. ${String(row.sceneNumber).padStart(2, "0")} · ${row.group.title}`;
  if (column === "location") return row.location;
  if (column === "interiorExterior") return row.interiorExterior;
  if (column === "durationSeconds") return row.shot.durationSeconds ?? "";
  if (column === "status") return row.shot.status === "ready" ? "Listo" : "Pendiente";
  if (column === "storyboard") return "";
  return row.shot[column] ?? "";
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
