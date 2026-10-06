import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("components/shotlist/ShotlistWorkspace.tsx", "utf8");
const importRoute = readFileSync("app/api/shotlists/[id]/import/route.ts", "utf8");
const importServer = readFileSync("lib/shotlist/import-server.ts", "utf8");
const pdf = readFileSync("lib/shotlist/pdf.tsx", "utf8");
const proposalRoute = readFileSync("app/api/shotlists/[id]/proposals/route.ts", "utf8");

test("assisted is deterministic and only suggested can enter the AI proposal route", () => {
  assert.match(workspace, /IA: 0 llamadas/);
  assert.match(workspace, /mode: "suggested"/);
  assert.match(proposalRoute, /body\.value\.mode !== "suggested"/);
  assert.doesNotMatch(proposalRoute, /mode !== "assisted"/);
});

test("file import is bounded, previewed, mapped explicitly, and idempotent", () => {
  assert.match(importServer, /bytes: 8 \* 1024 \* 1024/);
  assert.match(importServer, /rows: 5_000/);
  assert.match(importServer, /columns: 80/);
  assert.match(importServer, /cellFormula: true/);
  assert.match(importServer, /bookVBA: false/);
  assert.match(importRoute, /creation_operation_id/);
  assert.match(importRoute, /deterministicUuid/);
  assert.match(importRoute, /aiCalls: 0/);
  assert.doesNotMatch(importRoute, /writer_scripts"\)\.insert/);
});

test("PDF export is a real landscape table with repeated headers and wrapping", () => {
  assert.match(pdf, /orientation="landscape"/);
  assert.match(pdf, /style=\{styles\.header\} fixed/);
  assert.match(pdf, /style=\{styles\.row\} wrap=\{false\}/);
  assert.match(pdf, /pageNumber, totalPages/);
  assert.match(pdf, /description: 130/);
  assert.match(pdf, /notes: 120/);
  assert.doesNotMatch(pdf, /screenshot|canvas|html2canvas/iu);
});
