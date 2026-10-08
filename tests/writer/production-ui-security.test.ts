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
const applicationMenu = readFileSync("components/shotlist/ShotlistApplicationMenu.tsx", "utf8");
const proposalRoute = readFileSync("app/api/shotlists/[id]/proposals/route.ts", "utf8");
const storyboardDialogs = readFileSync("components/shotlist/ShotlistDialogs.tsx", "utf8");
const storyboardRoute = readFileSync("app/api/shotlists/[id]/storyboard/route.ts", "utf8");
const privateAssetRoute = readFileSync("app/api/writer/production-assets/[assetId]/route.ts", "utf8");

test("Shotlist follows the mockup hierarchy with real panels and one persistent grid", () => {
  assert.match(shotCss, /grid-template-columns:240px minmax\(600px,1fr\) 360px/);
  assert.match(workspace, /shotlist-scenes/);
  assert.match(workspace, /shotlist-grid-panel/);
  assert.match(workspace, /shotlist-inspector/);
  assert.match(workspace, /visibleColumns/);
  assert.match(workspace, /ShotlistFilters/);
  assert.match(workspace, /data-shot-id/);
  assert.match(workspace, /↑ Subir/);
  assert.match(workspace, /↓ Bajar/);
});

test("Libre, Asistido, and Sugerido remain distinct and AI requires an explicit action", () => {
  assert.match(workspace, /no se inventará cobertura/);
  assert.match(workspace, /IA: 0 llamadas/);
  assert.match(workspace, /Puede proponer cobertura nueva con IA/);
  assert.match(workspace, /window\.confirm\("Sugerir planos puede usar IA/);
  assert.match(workspace, /Añadir seleccionados/);
  assert.match(proposalRoute, /body\.value\.mode !== "suggested"/);
  assert.doesNotMatch(proposalRoute, /body\.value\.mode !== "assisted"/);
});

test("Storyboard preview and sharing retain the private, shot-scoped contract", () => {
  assert.match(applicationMenu, /Copiar enlace privado/);
  assert.match(workspace, /Abrir Storyboard/);
  assert.match(workspace, /Crear Storyboard/);
  assert.match(workspace, /storyboardShots\.get\(selectedShot\.id\)\?\.panels/);
  assert.match(workspace, /storyboardShots\.get\(storyboardPreviewShotId\)\?\.panels/);
  assert.match(workspace, /<StoryboardPreviewDialog[^>]+panel=\{previewPanel\}/);
  assert.match(workspace, /<StoryboardPreviewImage panel=\{storyboardPanel\}/);
  assert.match(storyboardDialogs, /role="dialog" aria-modal="true"/);
  assert.match(storyboardDialogs, /<img src=\{`\/api\/writer\/production-assets\/\$\{panel\.previewAssetId\}`\}/);
  assert.doesNotMatch(storyboardDialogs, /getPublicUrl|\/storage\/v1\/object\/public\//);
  assert.ok(storyboardRoute.indexOf("writerApiSession()") < storyboardRoute.indexOf("loadStoryboardBoard(session.supabase, session.user.id, id)"));
  assert.ok(privateAssetRoute.indexOf("writerApiSession()") < privateAssetRoute.indexOf('createSignedUrl(storagePath, 60)'));
  assert.match(privateAssetRoute, /\.eq\("owner_id", session\.user\.id\)\.maybeSingle\(\)/);
  assert.match(privateAssetRoute, /createSignedUrl\(storagePath, 60\)/);
  assert.doesNotMatch(privateAssetRoute, /getPublicUrl/);
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

test("reanalyzing the same revision retires absent automatic evidence but preserves manual occurrences", () => {
  assert.match(productionServer, /\.in\("source", options\.includeRules === false \? \["ai"\] : \["rule", "ai"\]\)/);
  assert.match(productionServer, /row\.source_hash === "0"\.repeat\(64\)/);
  assert.match(productionServer, /currentEvidenceKeys/);
  assert.match(productionServer, /update\(\{ stale: true/);
  assert.match(productionServer, /options\.sceneIds\?\.size/);
  assert.match(breakdown, /appearance\.stale \? "Referencia obsoleta" : "Ir al fragmento"/);
});
