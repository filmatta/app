import "server-only";

import * as XLSX from "xlsx";
import { parseShotlistCsv, type ParsedTable } from "./ux";

export const SHOTLIST_IMPORT_LIMITS = {
  bytes: 8 * 1024 * 1024,
  rows: 5_000,
  columns: 80,
  cells: 120_000,
  previewRows: 50,
} as const;

export type ParsedWorkbook = {
  kind: "csv" | "xls";
  sheets: Array<{ name: string; table: ParsedTable; rowCount: number; formulaCells: number; formulasWithoutValue: number }>;
};

export async function parseShotlistUpload(file: File): Promise<ParsedWorkbook> {
  if (file.size < 1 || file.size > SHOTLIST_IMPORT_LIMITS.bytes) throw new Error("El archivo debe pesar entre 1 byte y 8 MB.");
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("es-MX");
  if (extension === "csv") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(await file.arrayBuffer());
    const table = parseShotlistCsv(text, SHOTLIST_IMPORT_LIMITS);
    return { kind: "csv", sheets: [{ name: "CSV", table, rowCount: table.rows.length, formulaCells: 0, formulasWithoutValue: 0 }] };
  }
  if (extension !== "xls") throw new Error("Usa un archivo .xls real o .csv. XLSX no forma parte de esta Beta.");
  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
    type: "buffer",
    cellFormula: true,
    cellHTML: false,
    cellStyles: false,
    cellNF: false,
    cellText: true,
    bookVBA: false,
    bookFiles: false,
    dense: false,
    WTF: false,
  });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error(`No pudimos leer la hoja ${name}.`);
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
    if (matrix.length > SHOTLIST_IMPORT_LIMITS.rows + 1) throw new Error(`La hoja ${name} supera ${SHOTLIST_IMPORT_LIMITS.rows} filas.`);
    const width = matrix.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    if (width > SHOTLIST_IMPORT_LIMITS.columns || matrix.length * width > SHOTLIST_IMPORT_LIMITS.cells) throw new Error(`La hoja ${name} supera los límites de columnas o celdas.`);
    const rows = matrix.map((row) => Array.from({ length: width }, (_, index) => safeCell(Array.isArray(row) ? row[index] : "")));
    const headers = (rows.shift() ?? []).map((value) => value.trim());
    if (!headers.length || headers.every((header) => !header)) throw new Error(`La hoja ${name} no contiene encabezados.`);
    let formulaCells = 0;
    let formulasWithoutValue = 0;
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith("!") || !cell || typeof cell !== "object" || !("f" in cell)) continue;
      formulaCells += 1;
      if (!("v" in cell) || (cell as { v?: unknown }).v == null || (cell as { v?: unknown }).v === "") formulasWithoutValue += 1;
    }
    const warnings = [
      ...(formulaCells ? [`${formulaCells} celda(s) con fórmula: se usa únicamente el valor guardado; no se evalúan fórmulas.`] : []),
      ...(formulasWithoutValue ? [`${formulasWithoutValue} fórmula(s) no tienen valor guardado y se importarán vacías.`] : []),
    ];
    const table: ParsedTable = { delimiter: ",", headers, rows, warnings };
    return { name: name.slice(0, 120), table, rowCount: rows.length, formulaCells, formulasWithoutValue };
  });
  if (!sheets.length) throw new Error("El libro no contiene hojas.");
  return { kind: "xls", sheets };
}

export function publicWorkbookPreview(workbook: ParsedWorkbook) {
  return {
    kind: workbook.kind,
    sheets: workbook.sheets.map((sheet) => ({
      name: sheet.name,
      headers: sheet.table.headers,
      rows: sheet.table.rows.slice(0, SHOTLIST_IMPORT_LIMITS.previewRows),
      rowCount: sheet.rowCount,
      warnings: sheet.table.warnings,
      formulaCells: sheet.formulaCells,
      formulasWithoutValue: sheet.formulasWithoutValue,
    })),
    limits: SHOTLIST_IMPORT_LIMITS,
  };
}

function safeCell(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
