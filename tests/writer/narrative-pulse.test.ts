import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import { deriveWriterSceneSources } from "../../lib/writer/script-assistant.ts";
import fs from "node:fs";
import { WRITER_NARRATIVE_PULSE_CONTEXT_VERSION, WRITER_NARRATIVE_PULSE_MODEL, WRITER_NARRATIVE_PULSE_VERSION, buildWriterPulseContext, validateWriterPulseOutput, writerNarrativePulseSourceHash, writerPulseAnalysisVersionPrefix, writerPulseContextCacheInput, writerPulseDisplaySeries, writerPulseDisplayStats, writerPulseMilestoneLabel, writerPulseOutputSchema, writerPulsePath, writerPulsePlotPoints, writerPulseTooltipPosition, type WriterPulseDimension, type WriterPulseSignal } from "../../lib/writer/narrative-pulse.ts";

const ids = Array.from({ length: 24 }, (_, index) => `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`);
function fixture(): WriterDocument { return { type: "doc", content: Array.from({ length: 7 }, (_, index) => [
  createBlock("sceneHeading", `INT. ESPACIO ${index + 1} - NOCHE`, ids[index * 2]),
  createBlock("action", ["Marta encuentra una llave.", "La espera se prolonga.", "Luis confronta a Marta.", "La carta revela la verdad.", "Todos guardan silencio.", "Marta arriesga su vida.", "La puerta finalmente se abre."][index], ids[index * 2 + 1]),
]).flat() }; }
function payload() { const scenes = deriveWriterSceneSources(fixture()); return { scenes: scenes.map((scene, index) => ({ sceneId: scene.sceneId, intensity: [20, 22, 58, 76, 38, 91, 34][index], signals: index === 3 ? ["revelation", "turn"] : ["activity"], note: `Lectura descriptiva de la escena ${index + 1}.`, dimensions: { threat: index === 5 ? 92 : 10, pressure: 30, stakes: 35, emotion: index === 3 ? 88 : 25, revelation: index === 3 ? 95 : 5, urgency: index === 5 ? 86 : 20 }, evidence: [`Momento verificable ${index + 1}.`] })), milestones: [{ sceneId: scenes[0].sceneId, type: "inciting_incident", label: "La llave", explanation: "La llave altera la dirección inmediata." }, { sceneId: scenes[3].sceneId, type: "midpoint", label: "La revelación", explanation: "La información cambia el objetivo." }], zones: [{ startSceneId: scenes[0].sceneId, endSceneId: scenes[1].sceneId, type: "stable", note: "La intensidad permanece relativamente estable." }] }; }

test("classic arc fixture validates one stable point per scene and optional milestones", () => { const result = validateWriterPulseOutput(payload(), deriveWriterSceneSources(fixture())); assert.equal(result.scenes.length, 7); assert.equal(result.milestones.length, 2); assert.equal(result.zones[0].type, "stable"); });
test("plateaus and several local peaks remain descriptive rather than scores", () => { const result = validateWriterPulseOutput(payload(), deriveWriterSceneSources(fixture())); assert.deepEqual(result.scenes.slice(0, 2).map((point) => point.intensity), [20, 22]); assert.ok(result.scenes.filter((point) => point.intensity >= 70).length >= 2); assert.doesNotMatch(JSON.stringify(result), /quality|pacing score|script health/iu); });
test("ambiguous midpoint and non-traditional structure may omit standard milestones", () => { const value = payload(); value.milestones = []; assert.equal(validateWriterPulseOutput(value, deriveWriterSceneSources(fixture())).milestones.length, 0); });
test("context is compact, accepts confirmed Setup/Payoff and human O-O-C changes", () => { const scenes = deriveWriterSceneSources(fixture()); const context = buildWriterPulseContext(scenes, { setupPayoff: [{ sceneId: scenes[0].sceneId, label: "Llave confirmada", status: "confirmed" }], changes: [{ sceneId: scenes[3].sceneId, change: "Marta decide revelar la verdad." }] }); assert.equal(context.scenes.length, 7); assert.deepEqual(context.scenes[0].setupPayoff, ["Llave confirmada"]); assert.deepEqual(context.scenes[3].changes, ["Marta decide revelar la verdad."]); assert.ok(context.scenes.every((scene) => scene.summary.length <= 1_400)); });
test("a decisive moment at the end of a long scene is retained", () => { const long = fixture(); long.content[1].content = [{ type: "text", text: `${"Conversación cotidiana. ".repeat(90)}Marta saca el arma y amenaza a Luis.` }]; const context = buildWriterPulseContext(deriveWriterSceneSources(long)); assert.match(context.scenes[0].summary, /momento final/u); assert.match(context.scenes[0].summary, /saca el arma y amenaza/u); });
test("unknown scenes, duplicate points and reversed zones are rejected", () => { const scenes = deriveWriterSceneSources(fixture()); const unknown = payload(); unknown.scenes[0].sceneId = ids[23]; assert.throws(() => validateWriterPulseOutput(unknown, scenes), /invalid_scene/u); const duplicate = payload(); duplicate.scenes[1].sceneId = duplicate.scenes[0].sceneId; assert.throws(() => validateWriterPulseOutput(duplicate, scenes), /invalid_scene/u); const reversed = payload(); reversed.zones[0] = { ...reversed.zones[0], startSceneId: scenes[4].sceneId, endSceneId: scenes[1].sceneId }; assert.throws(() => validateWriterPulseOutput(reversed, scenes), /zone_order/u); });
test("intensity stays internal and constrained to normalized integer bounds", () => { const scenes = deriveWriterSceneSources(fixture()); const tooHigh = payload(); tooHigh.scenes[0].intensity = 101; assert.throws(() => validateWriterPulseOutput(tooHigh, scenes), /invalid_point/u); const fractional = payload(); fractional.scenes[0].intensity = 8.4; assert.throws(() => validateWriterPulseOutput(fractional, scenes), /invalid_point/u); });
test("SVG path is deterministic and scales to 160 scenes without a chart dependency", () => { const points = writerPulseDisplaySeries(Array.from({ length: 160 }, (_, index) => ({ intensity: index % 101 }))); const path = writerPulsePath(points, 12800, 230); assert.match(path, /^M/u); assert.equal((path.match(/L/gu) ?? []).length, 159); assert.equal(path, writerPulsePath(points, 12800, 230)); });
test("line and interactive markers share the exact same responsive plot geometry", () => {
  const display = writerPulseDisplaySeries([{ intensity: 12 }, { intensity: 61 }, { intensity: 94 }]);
  const plot = writerPulsePlotPoints(display, 997, 287, 24);
  const path = writerPulsePath(display, 997, 287, 24);
  assert.equal(path, plot.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "));
  assert.deepEqual(plot.map((point) => [point.x, point.y]), writerPulsePlotPoints(display, 997, 287, 24).map((point) => [point.x, point.y]));
  assert.ok(plot.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
});
test("Pulse tooltip flips below and shifts inside lateral viewport edges", () => {
  const flipped = writerPulseTooltipPosition({ anchor: { left: 190, right: 210, top: 14, bottom: 34, width: 20, height: 20 }, tooltip: { width: 180, height: 80 }, viewport: { width: 400, height: 300 } });
  assert.equal(flipped.placement, "bottom");
  assert.equal(flipped.top, 42);
  const shifted = writerPulseTooltipPosition({ anchor: { left: 386, right: 398, top: 180, bottom: 192, width: 12, height: 12 }, tooltip: { width: 180, height: 80 }, viewport: { width: 400, height: 300 } });
  assert.equal(shifted.left, 210);
  assert.equal(shifted.shifted, true);
  assert.ok(shifted.left >= 10 && shifted.left + 180 <= 390);
  assert.ok(shifted.top >= 10 && shifted.top + 80 <= 290);
});
test("adaptive display keeps a genuinely flat fixture restrained without mutating raw values", () => {
  const fixture = JSON.parse(fs.readFileSync("tests/fixtures/writer/pulse-flat.json", "utf8")) as { intensities: number[] };
  const source = fixture.intensities.map((intensity) => ({ intensity }));
  const series = writerPulseDisplaySeries(source);
  const stats = writerPulseDisplayStats(source);
  assert.deepEqual(series.map((point) => point.rawIntensity), fixture.intensities);
  assert.ok(stats.displayMax - stats.displayMin <= 4);
  assert.equal(stats.rawMin, 48);
  assert.equal(stats.rawMax, 50);
  assert.equal(stats.rawMedian, 49);
});
test("high-dynamic-thriller fixture uses a broad display range while preserving all 48 raw values", () => {
  const fixture = JSON.parse(fs.readFileSync("tests/fixtures/writer/high-dynamic-thriller.json", "utf8")) as { scenes: Array<{ intensity: number }> };
  const series = writerPulseDisplaySeries(fixture.scenes);
  const stats = writerPulseDisplayStats(fixture.scenes);
  assert.equal(series.length, 48);
  assert.deepEqual(series.map((point) => point.rawIntensity), fixture.scenes.map((scene) => scene.intensity));
  assert.ok(stats.displayMax - stats.displayMin >= 65 && stats.displayMax - stats.displayMin <= 80);
  assert.equal(stats.rawMin, 18);
  assert.equal(stats.rawMax, 97);
  assert.ok(stats.rawVariance > 400);
});
test("canonical hash survives reorder-independent cloning but changes with screenplay text", async () => { const document = fixture(); const hash = await writerNarrativePulseSourceHash(document); assert.equal(hash, await writerNarrativePulseSourceHash(structuredClone(document))); const changed = structuredClone(document); changed.content[1].content = [{ type: "text", text: "Marta destruye la llave." }]; assert.notEqual(hash, await writerNarrativePulseSourceHash(changed)); });
test("cache input changes when accepted narrative context changes even if screenplay text does not", () => { const scenes = deriveWriterSceneSources(fixture()); const first = buildWriterPulseContext(scenes, { changes: [{ sceneId: scenes[0].sceneId, change: "Marta espera." }] }); const second = buildWriterPulseContext(scenes, { changes: [{ sceneId: scenes[0].sceneId, change: "Marta decide actuar." }] }); assert.notEqual(writerPulseContextCacheInput(first), writerPulseContextCacheInput(second)); });
test("strict response schema and supported milestone labels remain bounded", () => { const schema = writerPulseOutputSchema(); assert.equal(schema.additionalProperties, false); assert.equal(schema.properties.scenes.items.additionalProperties, false); assert.equal(writerPulseMilestoneLabel("custom"), "Hito personalizado"); assert.equal(WRITER_NARRATIVE_PULSE_VERSION, "narrative-pulse-v4"); assert.equal(WRITER_NARRATIVE_PULSE_CONTEXT_VERSION, "context-v1"); assert.equal(writerPulseAnalysisVersionPrefix(), "narrative-pulse-v4:context-v1:"); assert.equal(WRITER_NARRATIVE_PULSE_MODEL, "gpt-5.6-terra"); });
test("extra free-form or quality fields cannot enter the structured response", () => { const value = { ...payload(), score: 83 }; assert.throws(() => validateWriterPulseOutput(value, deriveWriterSceneSources(fixture())), /invalid_schema/u); });

test("missing scores fail validation instead of becoming a legitimate point at 50", () => {
  const value = structuredClone(payload()) as unknown as { scenes: Array<Record<string, unknown>>; milestones: unknown[]; zones: unknown[] };
  value.scenes[2] = Object.fromEntries(Object.entries(value.scenes[2]).filter(([key]) => key !== "intensity"));
  assert.throws(() => validateWriterPulseOutput(value, deriveWriterSceneSources(fixture())), /invalid_(scene|point)/u);
});

test("dense original screenplay crosses context, structured mock, validation, raw and display without flattening", () => {
  const source = JSON.parse(fs.readFileSync("tests/fixtures/writer/pulse-dense-original.json", "utf8")) as { scenes: Array<{ heading: string; action: string }> };
  const document: WriterDocument = { type: "doc", content: source.scenes.flatMap((scene, index) => [
    createBlock("sceneHeading", scene.heading, denseId(index * 2 + 1)),
    createBlock("action", scene.action, denseId(index * 2 + 2)),
  ]) };
  const scenes = deriveWriterSceneSources(document);
  const context = buildWriterPulseContext(scenes);
  const structured = denseMockProvider(context);
  const parsed = validateWriterPulseOutput(structured, scenes);
  const display = writerPulseDisplaySeries(parsed.scenes);
  const byScene = new Map(parsed.scenes.map((point) => [point.sceneId, point]));
  const point = (sceneNumber: number) => byScene.get(scenes[sceneNumber - 1].sceneId)!;

  assert.equal(context.scenes.length, 40);
  assert.equal(parsed.scenes.length, 40);
  assert.equal(display.length, 40);
  assert.deepEqual(display.map((item) => item.rawIntensity), parsed.scenes.map((item) => item.intensity));
  assert.ok(point(20).intensity > point(17).intensity, "amenaza directa debe superar arma guardada");
  assert.ok(point(21).intensity > point(1).intensity, "violencia física debe superar conversación cotidiana");
  assert.ok(point(27).intensity >= 75 && (point(27).dimensions?.threat ?? 101) <= 15, "revelación emocional puede ser alta sin violencia");
  assert.ok(point(24).intensity < point(21).intensity && point(24).intensity < point(29).intensity, "pausa posterior debe bajar frente a violencia/persecución");
  assert.ok((point(38).dimensions?.threat ?? 101) < (point(17).dimensions?.threat ?? 0), "metáfora no debe parecer arma física");
  assert.ok(Math.max(...parsed.scenes.map((item) => item.intensity)) - Math.min(...parsed.scenes.map((item) => item.intensity)) >= 65);
  assert.ok(Math.max(...display.map((item) => item.displayIntensity)) - Math.min(...display.map((item) => item.displayIntensity)) >= 65);
  for (let index = 1; index < display.length; index += 1) {
    for (let previous = 0; previous < index; previous += 1) {
      if (display[index]!.rawIntensity > display[previous]!.rawIntensity) assert.ok(display[index]!.displayIntensity >= display[previous]!.displayIntensity);
    }
  }
});

function denseId(index: number) { return `90000000-0000-4000-8000-${String(index).padStart(12, "0")}`; }

function denseMockProvider(context: ReturnType<typeof buildWriterPulseContext>) {
  return {
    scenes: context.scenes.map((scene) => {
      const text = scene.summary;
      const dimensions: Record<WriterPulseDimension, number> = { threat: 8, pressure: 16, stakes: 14, emotion: 18, revelation: 8, urgency: 12 };
      let intensity = 18;
      let signals: WriterPulseSignal[] = ["activity"];
      if (/factura|deuda|acusa|discuten|firma|golpea la puerta/iu.test(text)) { dimensions.pressure = 48; dimensions.stakes = 42; intensity = 44; signals = ["conflict", "pressure"]; }
      if (/pasos detrás|no ser encontrada|cierra el local|reja baja/iu.test(text)) { dimensions.threat = 46; dimensions.urgency = 55; dimensions.stakes = 58; intensity = 57; signals = ["risk", "pressure"]; }
      if (/pistola guardada/iu.test(text)) { dimensions.threat = 24; dimensions.pressure = 20; intensity = 30; signals = ["risk"]; }
      if (/saca una pistola/iu.test(text)) { dimensions.threat = 68; dimensions.pressure = 72; dimensions.stakes = 70; intensity = 72; signals = ["risk", "pressure"]; }
      if (/apunta la pistola|amenaza con disparar/iu.test(text)) { dimensions.threat = 94; dimensions.pressure = 88; dimensions.stakes = 91; intensity = 91; signals = ["risk", "conflict", "pressure"]; }
      if (/forcejean|un disparo rompe/iu.test(text)) { dimensions.threat = 98; dimensions.pressure = 94; dimensions.stakes = 96; dimensions.urgency = 92; intensity = 97; signals = ["risk", "conflict", "consequence"]; }
      if (/estable|comparten agua|lluvia disminuye/iu.test(text)) { dimensions.threat = 4; dimensions.pressure = 8; dimensions.urgency = 5; intensity = 22; signals = ["consequence"]; }
      if (/confiesa|toda su amistad nació/iu.test(text)) { dimensions.threat = 6; dimensions.emotion = 96; dimensions.revelation = 94; dimensions.stakes = 74; intensity = 88; signals = ["revelation", "turn", "change"]; }
      if (/corre tras|persecución|continúa la persecución/iu.test(text)) { dimensions.threat = 68; dimensions.pressure = 78; dimensions.urgency = 94; intensity = 86; signals = ["risk", "activity", "pressure"]; }
      if (/policía lo rodea/iu.test(text)) { dimensions.threat = 76; dimensions.pressure = 92; dimensions.stakes = 86; dimensions.urgency = 90; intensity = 93; signals = ["turn", "risk", "consequence"]; }
      if (/disparo al corazón/iu.test(text)) { dimensions.threat = 3; dimensions.pressure = 12; dimensions.emotion = 40; intensity = 28; signals = ["activity"]; }
      return { sceneId: scene.sceneId, intensity, signals, note: `Lectura sintética de la escena ${scene.sceneNumber}.`, dimensions, evidence: [text.slice(0, 160)] };
    }),
    milestones: [],
    zones: [],
  };
}
