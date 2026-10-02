import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import { deriveWriterSceneSources } from "../../lib/writer/script-assistant.ts";
import fs from "node:fs";
import { WRITER_NARRATIVE_PULSE_MODEL, WRITER_NARRATIVE_PULSE_VERSION, buildWriterPulseContext, validateWriterPulseOutput, writerNarrativePulseSourceHash, writerPulseDisplaySeries, writerPulseDisplayStats, writerPulseMilestoneLabel, writerPulseOutputSchema, writerPulsePath } from "../../lib/writer/narrative-pulse.ts";

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
test("strict response schema and supported milestone labels remain bounded", () => { const schema = writerPulseOutputSchema(); assert.equal(schema.additionalProperties, false); assert.equal(schema.properties.scenes.items.additionalProperties, false); assert.equal(writerPulseMilestoneLabel("custom"), "Hito personalizado"); assert.equal(WRITER_NARRATIVE_PULSE_VERSION, "narrative-pulse-v2"); assert.equal(WRITER_NARRATIVE_PULSE_MODEL, "gpt-5.6-terra"); });
test("extra free-form or quality fields cannot enter the structured response", () => { const value = { ...payload(), score: 83 }; assert.throws(() => validateWriterPulseOutput(value, deriveWriterSceneSources(fixture())), /invalid_schema/u); });
