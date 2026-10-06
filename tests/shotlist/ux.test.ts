import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSceneContext,
  filterShotlistRows,
  normalizeLens,
  parseShotlistCsv,
  shotlistCsv,
  shotlistRows,
  suggestedImportColumn,
  type ShotlistFilter,
} from "../../lib/shotlist/ux.ts";
import type { WriterShotlist } from "../../lib/writer/production.ts";

test("scene context exposes location and INT/EXT without mutating the title", () => {
  assert.deepEqual(deriveSceneContext("INT. RADIO K-17 / CABINA — NOCHE"), {
    interiorExterior: "INT.",
    location: "RADIO K-17 / CABINA",
  });
  assert.deepEqual(deriveSceneContext("Grupo manual"), {
    interiorExterior: "",
    location: "Grupo manual",
  });
});

test("lens equality treats 50 and 50 mm as the same value but not 150 mm", () => {
  const rows = shotlistRows(fixture());
  const filters: ShotlistFilter[] = [{ id: "lens", column: "lens", condition: "equals", value: "50" }];
  assert.equal(normalizeLens("050.0 mm"), "50 mm");
  assert.deepEqual(filterShotlistRows(rows, "", filters).map((row) => row.shot.lens), ["50 mm"]);
});

test("filters OR within a column and AND across columns", () => {
  const rows = shotlistRows(fixture());
  const filters: ShotlistFilter[] = [
    { id: "lens-1", column: "lens", condition: "equals", value: "50 mm" },
    { id: "lens-2", column: "lens", condition: "equals", value: "150" },
    { id: "angle", column: "angle", condition: "equals", value: "A nivel" },
  ];
  assert.deepEqual(filterShotlistRows(rows, "", filters).map((row) => row.shot.subject), ["Mara escucha"]);
});

test("CSV parser handles BOM, semicolons, escaped quotes and line breaks", () => {
  const parsed = parseShotlistCsv("\uFEFFPlano;Descripción;Lente\r\n001;\"Mara dice \"\"hola\"\"\ny espera\";50 mm\r\n");
  assert.equal(parsed.delimiter, ";");
  assert.deepEqual(parsed.headers, ["Plano", "Descripción", "Lente"]);
  assert.deepEqual(parsed.rows, [["001", "Mara dice \"hola\"\ny espera", "50 mm"]]);
});

test("CSV parser rejects unterminated cells and real limits", () => {
  assert.throws(() => parseShotlistCsv("Plano,Notas\n1,\"sin cierre"), /sin cerrar/u);
  assert.throws(() => parseShotlistCsv("Plano\n1\n2", { rows: 1, columns: 10, cells: 10 }), /límite de 1 filas/u);
});

test("import mapping is explicit and unknown columns stay unmapped", () => {
  assert.equal(suggestedImportColumn("Lente"), "lens");
  assert.equal(suggestedImportColumn("Notas"), "notes");
  assert.equal(suggestedImportColumn("Cro"), "skip");
});

test("CSV export preserves chosen columns and protects spreadsheet cells", () => {
  const csv = shotlistCsv(fixture(), ["number", "subject", "notes"]);
  assert.match(csv, /^\uFEFF"Plano","Acción","Observaciones"\r\n/u);
  assert.match(csv, /Mara escucha/u);
  assert.doesNotMatch(csv, /Óptica/u);
});

function fixture(): WriterShotlist {
  const groupId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    scriptId: null,
    title: "Prueba",
    sourceRevision: null,
    revision: 1,
    groups: [{
      id: groupId,
      shotlistId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sourceSceneId: null,
      sourceSceneTitle: null,
      title: "INT. CASA — NOCHE",
      position: 0,
      sourceStatus: "manual",
      revision: 1,
      shots: [
        shot(groupId, "1", "Mara escucha", "50 mm", "A nivel"),
        shot(groupId, "2", "Mara corre", "150 mm", "Picado"),
      ],
    }],
  };
}

function shot(groupId: string, suffix: string, subject: string, lens: string, angle: string) {
  return {
    id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${suffix}`,
    shotlistId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    groupId,
    sourceBlockId: null,
    origin: "manual" as const,
    shotType: "Plano medio",
    composition: null,
    subject,
    angle,
    movement: "Fijo",
    support: null,
    lens,
    setup: null,
    durationSeconds: null,
    status: "pending" as const,
    description: null,
    intention: null,
    notes: null,
    assetId: null,
    position: Number(suffix),
    sourceRevision: null,
    revision: 1,
  };
}
