import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import { analyzeWriterDocxText, validateWriterImportFile, writerImportPreservesSignificantText } from "../../lib/writer/import.ts";
import { validateWriterIdeasOutput } from "../../lib/writer/ideas.ts";
import { buildWriterPulseContext, writerPulseDisplaySeries, writerPulseDisplayStats } from "../../lib/writer/narrative-pulse.ts";
import { calculateWriterSceneAnalysisCost } from "../../lib/writer/script-assistant-accounting.ts";
import { deriveWriterSceneSources } from "../../lib/writer/script-assistant.ts";

const read = (path: string) => fs.readFileSync(path, "utf8");

test("Ideas has one intentional action, optional brief, and explicit provenance", () => {
  const component = read("components/writer/WriterErgonomicTools.tsx");
  const route = read("app/api/writer/scripts/[id]/ideas/route.ts");
  assert.match(component, /Breve opcional/u);
  assert.match(component, /SmartFeatureIndicator label="Generar ideas"/u);
  assert.equal((component.match(/SmartFeatureIndicator label="Generar ideas"/gu) ?? []).length, 1);
  for (const oldAction of ["Explorar direcciones", ">Conflicto<", ">Giro<", ">Obstáculo<"]) assert.doesNotMatch(component, new RegExp(oldAction, "u"));
  assert.match(route, /question\.length > 500/u);
  assert.doesNotMatch(route, /!body\.value\.question\.trim/u);
  const source = { scope: "document" as const, sceneId: null, scenes: [], references: [] };
  const payload = Array.from({ length: 3 }, (_, index) => ({
    id: `idea-${index}`, category: "Conflicto", basis: (["source_fact", "interpretation", "new_direction"] as const)[index],
    title: `Dirección ${index}`, direction: `Propuesta concreta ${index}`, consequence: `Consecuencia ${index}`, referenceIds: [],
  }));
  assert.deepEqual(validateWriterIdeasOutput({ ideas: payload }, source).map((idea) => idea.basis), ["source_fact", "interpretation", "new_direction"]);
  assert.throws(() => validateWriterIdeasOutput({ ideas: payload.slice(0, 2) }, source), /invalid_schema/u);
  assert.throws(() => validateWriterIdeasOutput({ ideas: [...payload, payload[0], payload[1], payload[2]] }, source), /invalid_schema/u);
});

test("Guide and contextual selection remain one bounded analysis service", () => {
  const guide = read("components/writer/WriterGuidedWriting.tsx");
  const dialog = read("components/writer/WriterSelectionAnalysisDialog.tsx");
  const route = read("app/api/writer/scripts/[id]/guided-writing/route.ts");
  const workspace = read("components/writer/WriterWorkspace.tsx");
  const writingTools = read("components/writer/WriterWritingTools.tsx");
  assert.match(guide, /GUÍA · ASISTENTE DE ESCRITURA/u);
  assert.match(guide, /SmartFeatureIndicator label="Analizar"/u);
  assert.doesNotMatch(`${guide}\n${dialog}\n${workspace}`, /Pensarlo juntos/u);
  assert.match(writingTools, /Analizar selección/u);
  assert.match(route, /value\.text\.length <= 6_000/u);
  assert.match(route, /value\.blockIds\.length <= 100/u);
  assert.match(route, /value\.sceneIds\.length <= 30/u);
  assert.match(dialog, /Ver en guion/u);
  assert.match(dialog, /revisión \{selection\.sourceRevision\}/u);
  assert.match(dialog, /El guion cambió desde esta selección/u);
  assert.doesNotMatch(dialog, /setContent|insertContent|replaceWith/u);
});

test("DOCX is local, bounded and staged through the existing deterministic classifier", () => {
  const extractor = read("lib/writer/docx-import.ts");
  const flow = read("components/writer/WriterImportFlow.tsx");
  const staging = analyzeWriterDocxText("INT. CAFÉ - DÍA\nÁNGELA observa el reloj.\nÁNGELA\n¿Llegaste?", "acentos.docx", ["Aviso sintético"]);
  assert.equal(staging.source.format, "docx");
  assert.equal(staging.source.extractedText.includes("ÁNGELA"), true);
  assert.equal(staging.warnings?.[0], "Aviso sintético");
  assert.equal(writerImportPreservesSignificantText(staging), true);
  assert.equal(validateWriterImportFile({ name: "guion.docx", size: 200, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "docx");
  assert.throws(() => validateWriterImportFile({ name: "guion.docm", size: 200, type: "application/zip" }), /sin macros/u);
  assert.match(extractor, /MAX_ARCHIVE_ENTRIES = 1_024/u);
  assert.match(extractor, /MAX_EXPANDED_BYTES = 24_000_000/u);
  assert.match(extractor, /checkCRC32: true/u);
  assert.match(extractor, /TargetMode\\s\*=\\s\*\["'\]External/u);
  assert.match(extractor, /vbaProject/u);
  assert.match(extractor, /local === "moveFrom"/u);
  assert.match(extractor, /no se aplicó OCR/u);
  assert.doesNotMatch(extractor, /fetch\(|OpenAI|service_role/u);
  assert.match(flow, /\.txt,\.fdx,\.docx/u);
  assert.doesNotMatch(flow, /accept=.*\.pdf/u);
  assert.match(flow, /sourceParagraphs: extracted\.paragraphs/u);
  assert.match(flow, /Importar y organizar con IA/u);
  assert.match(flow, /Seleccionar archivo/u);
  assert.match(flow, /availability\.enabled \|\| canOrganizeLocally/u);
  assert.match(flow, /selectedFileExtension === "fdx" \|\| selectedFileExtension === "docx"/u);
  assert.doesNotMatch(flow, /la organización asistida no recibe el archivo/u);
});

test("PDF import is not public while PDF export infrastructure remains present", () => {
  const flow = read("components/writer/WriterImportFlow.tsx");
  const importer = read("lib/writer/import.ts");
  assert.match(importer, /extension === "pdf"/u);
  assert.match(importer, /todavía no está disponible/u);
  assert.doesNotMatch(flow, /PDF con texto/u);
  assert.equal(fs.existsSync("tools/build-writer-pdf-worker.mjs"), true);
  assert.equal(fs.existsSync("lib/writer/pdf-renderer.ts"), true);
});

test("Breakdown preserves valid evidence on failures and reuses unchanged completed batches", () => {
  const route = read("app/api/writer/scripts/[id]/breakdown/route.ts");
  const server = read("lib/writer/production-ai-server.ts");
  const production = read("lib/writer/production-server.ts");
  const panel = read("components/writer/WriterBreakdownPanel.tsx");
  assert.match(route, /reconcileStale: true/u);
  assert.match(route, /expectedRevision: script\.revision/u);
  assert.match(route, /includeRules: false/u);
  assert.match(server, /input\.kind === "breakdown_detect"/u);
  assert.match(server, /metrics: \{ reused: true, cached: true, costMicrousd: 0/u);
  assert.match(production, /script\.revision !== options\.expectedRevision/u);
  assert.match(production, /options\.reconcileStale === false \? null/u);
  assert.match(panel, /Reanalizar todo/u);
  assert.equal((panel.match(/Detectar elementos|Reanalizar todo/gu) ?? []).length >= 2, true);
});

test("provider prompt caching is scoped and usage accounting distinguishes reads and writes", () => {
  const ideas = read("lib/writer/ideas-server.ts");
  const guide = read("lib/writer/guided-writing-server.ts");
  const pulse = read("lib/writer/narrative-pulse-server.ts");
  const production = read("lib/writer/production-ai-server.ts");
  for (const source of [ideas, guide, pulse, production]) {
    assert.match(source, /store: false/u);
    assert.match(source, /prompt_cache_key/u);
    assert.match(source, /cache_write_tokens/u);
  }
  assert.equal(calculateWriterSceneAnalysisCost({ inputTokens: 1_000, cachedInputTokens: 400, cacheWriteTokens: 200, outputTokens: 100, reasoningTokens: 0 }), 2_580);
});

test("dense 32-scene Pulse context covers every scene and retains decisive endings", () => {
  const content = Array.from({ length: 32 }, (_, index) => {
    const id = String(index + 1).padStart(12, "0");
    const event = index === 17 ? "Al final, MARA toma el arma y amenaza con disparar." : index === 24 ? "ELENA revela que la llamada era una trampa." : "Mara conversa mientras la presión cambia lentamente.";
    const body = `${"El equipo revisa pistas, discute opciones y escucha el pasillo. ".repeat(22)}${event}`;
    return [
      createBlock("sceneHeading", `INT. ESPACIO ${index + 1} - NOCHE`, `10000000-0000-4000-8000-${id}`),
      createBlock("action", body, `20000000-0000-4000-8000-${id}`),
    ];
  }).flat();
  const document: WriterDocument = { type: "doc", content };
  const context = buildWriterPulseContext(deriveWriterSceneSources(document));
  assert.equal(context.scenes.length, 32);
  assert.match(context.scenes[17]!.summary, /momento final/u);
  assert.match(context.scenes[17]!.summary, /amenaza con disparar/u);
  assert.match(context.scenes[24]!.summary, /llamada era una trampa/u);
  const display = writerPulseDisplaySeries(context.scenes.map((_, index) => ({ intensity: [24, 35, 58, 82, 43, 91][index % 6]! })));
  const stats = writerPulseDisplayStats(display.map((point) => ({ intensity: point.rawIntensity })));
  assert.equal(display.length, 32);
  assert.ok(stats.displayMax - stats.displayMin >= 65);
});

test("toolbar, Cream, Comfort and transient feedback preserve the approved shell", () => {
  const tools = read("components/writer/WriterWritingTools.tsx");
  const workspace = read("components/writer/WriterWorkspace.tsx");
  const timeline = read("components/writer/WriterTimeline.tsx");
  const css = read("app/writer/writer.css");
  assert.doesNotMatch(tools, /aria-label="Tipo de bloque"/u);
  assert.match(tools, /Cambiar bloque a/u);
  assert.equal((workspace.match(/Confort visual \/ filtro cálido/gu) ?? []).length, 1);
  assert.match(workspace, /type="checkbox"/u);
  assert.match(timeline, /setTimeout\(\(\) => setNotice\(null\), 3_500\)/u);
  assert.match(css, /data-writer-skin="cream"[\s\S]*writer-observations-known/iu);
  assert.match(css, /data-writer-skin="cream"[\s\S]*writer-guided/iu);
});
