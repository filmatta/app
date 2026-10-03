import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("components/shotlist/ShotlistWorkspace.tsx", "utf8");
const shotCss = readFileSync("app/shotlists/shotlist.css", "utf8");
const breakdown = readFileSync("components/writer/WriterBreakdownPanel.tsx", "utf8");
const ai = readFileSync("lib/writer/production-ai-server.ts", "utf8");
const productionServer = readFileSync("lib/writer/production-server.ts", "utf8");
const assetRoute = readFileSync("app/api/writer/production-assets/route.ts", "utf8");
const importFlow = readFileSync("components/writer/WriterImportFlow.tsx", "utf8");

test("Shotlist follows the mockup hierarchy with real panels and one persistent grid", () => {
  assert.match(shotCss, /grid-template-columns:240px minmax\(600px,1fr\) 360px/);
  assert.match(workspace, /shotlist-scenes/);
  assert.match(workspace, /shotlist-grid-panel/);
  assert.match(workspace, /shotlist-inspector/);
  assert.match(workspace, /showSecondaryColumns/);
  assert.match(workspace, /↑ Subir/);
  assert.match(workspace, /↓ Bajar/);
});

test("Libre, Asistido, and Sugerido remain distinct and AI requires an explicit action", () => {
  assert.match(workspace, /No usa IA y cada plano queda editable/);
  assert.match(workspace, /addAssistedCoverage/);
  assert.match(workspace, /Propuesta contextual con IA/);
  assert.match(workspace, /window\.confirm\(`Preparar una propuesta/);
  assert.match(workspace, /Añadir seleccionados/);
});

test("Storyboard and sharing disclose the private V1 contract instead of faking features", () => {
  assert.match(workspace, /Copiar enlace privado/);
  assert.match(workspace, /Generación de storyboard: próxima etapa/);
  assert.doesNotMatch(workspace, />Generar storyboard</);
  assert.match(workspace, /Quitar referencia/);
});

test("Breakdown keeps human review, recovery, categories, and canonical navigation visible", () => {
  assert.match(breakdown, /Por revisar/);
  assert.match(breakdown, /Descartados/);
  assert.match(breakdown, /Recuperar/);
  assert.match(breakdown, /Cambiar imagen/);
  assert.match(breakdown, /Ir al fragmento/);
  assert.match(breakdown, /WRITER_BREAKDOWN_CATEGORIES/);
});

test("production AI and assets fail closed and never expose screenplay content in operational logs", () => {
  assert.match(ai, /WRITER_PRODUCTION_AI_ENABLED !== "enabled"/);
  assert.match(ai, /store: false/);
  assert.match(ai, /MAX_OPERATION_COST_MICRO_USD = 200_000/);
  assert.match(ai, /scenes\.length > 12/);
  assert.doesNotMatch(ai, /console\.(?:info|log)\([^\n]*(?:source|instructions|providerInput)/);
  assert.ok(assetRoute.indexOf("writerApiSession()") < assetRoute.indexOf("request.formData()"));
  assert.match(assetRoute, /limitInputPixels: 40_000_000/);
  assert.match(importFlow, /destination === "writer"/);
  assert.match(importFlow, /router\.push\(`\/shotlists\/\$\{payload\.id\}`\)/);
});

test("reanalyzing a newer revision stales only automated evidence from older revisions", () => {
  assert.match(productionServer, /\.neq\("source", "user"\)/);
  assert.match(productionServer, /\.lt\("source_revision", script\.revision\)/);
  assert.match(productionServer, /update\(\{ stale: true/);
  assert.match(productionServer, /options\.sceneIds\?\.size/);
  assert.match(breakdown, /appearance\.stale \? "Referencia obsoleta" : "Ir al fragmento"/);
});
