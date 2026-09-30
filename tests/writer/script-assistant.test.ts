import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WRITER_SCRIPT_ASSISTANT_VERSION,
  deriveWriterSceneSources,
  effectiveWriterSceneOoc,
  validateWriterSceneAnalysisOutput,
  writerAssistantOutputSchema,
  writerSceneAnalysisStatus,
  writerSceneSourceHash,
} from "../../lib/writer/script-assistant.ts";
import {
  calculateWriterSceneAnalysisCost,
  estimateWriterSceneAnalysisMaximumCost,
} from "../../lib/writer/script-assistant-accounting.ts";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";

const sceneA = "11111111-1111-4111-8111-111111111101";
const actionA = "11111111-1111-4111-8111-111111111102";

function fixture(): WriterDocument {
  return { type: "doc", content: [
    createBlock("sceneHeading", "INT. COCINA - NOCHE", sceneA),
    createBlock("action", "CAROLINA esconde la carta antes de que VERA entre.", actionA),
    createBlock("character", "CAROLINA", "11111111-1111-4111-8111-111111111103"),
    createBlock("dialogue", "Necesito que te vayas.", "11111111-1111-4111-8111-111111111104"),
    createBlock("authorNote", "Recordar utilería.", "11111111-1111-4111-8111-111111111105"),
    createBlock("sceneHeading", "EXT. BOSQUE - DÍA", "11111111-1111-4111-8111-111111111106"),
    createBlock("action", "Una niña entra al bosque.", "11111111-1111-4111-8111-111111111107"),
  ] };
}

test("scene source hash is stable, excludes notes/nicknames/order, and changes with canonical narrative text", async () => {
  const document = fixture();
  const scene = deriveWriterSceneSources(document)[0];
  const first = await writerSceneSourceHash(scene);
  const second = await writerSceneSourceHash(deriveWriterSceneSources(structuredClone(document))[0]);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/u);
  assert.equal(scene.blocks.some((block) => String(block.kind) === "authorNote"), false);

  const nickname = structuredClone(document) as WriterDocument;
  (nickname.content[0].attrs as Record<string, unknown>).sceneNickname = "LA CARTA";
  assert.equal(await writerSceneSourceHash(deriveWriterSceneSources(nickname)[0]), first);

  const reordered: WriterDocument = { type: "doc", content: [...document.content.slice(5), ...document.content.slice(0, 5)] };
  assert.equal(await writerSceneSourceHash(deriveWriterSceneSources(reordered).find((item) => item.sceneId === sceneA)!), first);

  const changed = structuredClone(document);
  changed.content[1].content = [{ type: "text", text: "CAROLINA quema la carta antes de que VERA entre." }];
  assert.notEqual(await writerSceneSourceHash(deriveWriterSceneSources(changed)[0]), first);
});

test("duplicate scene IDs create an independent UNANALYZED cache identity", async () => {
  const original = deriveWriterSceneSources(fixture())[0];
  const duplicate = {
    ...original,
    sceneId: "22222222-2222-4222-8222-222222222201",
    blocks: original.blocks.map((block, index) => ({ ...block, id: `22222222-2222-4222-8222-22222222220${index + 1}` })),
  };
  assert.notEqual(await writerSceneSourceHash(original), await writerSceneSourceHash(duplicate));
  assert.equal(writerSceneAnalysisStatus(null, await writerSceneSourceHash(duplicate)), "UNANALYZED");
});

test("structured output accepts conservative O-O-C and validates every evidence reference", async () => {
  const scene = deriveWriterSceneSources(fixture())[0];
  const hash = await writerSceneSourceHash(scene);
  const payload = validateWriterSceneAnalysisOutput({
    objective: { value: "Ocultar la carta antes de que Vera la vea.", confidence: "high", evidence: [{ blockId: actionA }] },
    obstacle: { value: "Vera está a punto de entrar.", confidence: "medium", evidence: [{ blockId: actionA }] },
    change: { value: null, confidence: "low", evidence: [] },
    observations: [{
      category: "change", state: "QUESTION", title: "Cambio de la escena", question: "¿Qué cambia para Carolina antes de salir?",
      observation: null, evidence: [{ blockId: actionA }],
    }],
  }, scene, hash);
  assert.equal(payload.change.value, null);
  assert.equal(payload.observations.length, 1);
  assert.match(payload.observations[0].id, new RegExp(`^${hash.slice(0, 16)}`));
  assert.throws(() => validateWriterSceneAnalysisOutput({
    objective: { value: null, confidence: "low", evidence: [{ blockId: "99999999-9999-4999-8999-999999999999" }] },
    obstacle: { value: null, confidence: "low", evidence: [] },
    change: { value: null, confidence: "low", evidence: [] }, observations: [],
  }, scene, hash), /assistant_invalid_evidence/u);
});

test("no rewrite field is accepted and schema closes every object", async () => {
  const scene = deriveWriterSceneSources(fixture())[0];
  const hash = await writerSceneSourceHash(scene);
  assert.throws(() => validateWriterSceneAnalysisOutput({
    objective: { value: null, confidence: "low", evidence: [] },
    obstacle: { value: null, confidence: "low", evidence: [] },
    change: { value: null, confidence: "low", evidence: [] },
    observations: [],
    rewrite: "Carolina quema la carta.",
  }, scene, hash), /assistant_invalid_schema/u);
  const schema = writerAssistantOutputSchema();
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.observations.items.additionalProperties, false);
});

test("human override wins, survives automatic replacement, and can return to automatic", () => {
  const analysis = {
    objective: { value: "Ocultar la carta.", confidence: "high" as const, evidence: [] },
    obstacle: { value: "Vera entra.", confidence: "high" as const, evidence: [] },
    change: { value: null, confidence: "low" as const, evidence: [] }, observations: [],
  };
  const user = effectiveWriterSceneOoc(analysis, { sceneId: sceneA, objective: "Proteger a Vera.", obstacle: null, change: null });
  assert.equal(user.objective, "Proteger a Vera.");
  assert.equal(user.source.objective, "user");
  const automatic = effectiveWriterSceneOoc(analysis, { sceneId: sceneA, objective: null, obstacle: null, change: null });
  assert.equal(automatic.objective, "Ocultar la carta.");
  assert.equal(automatic.source.objective, "auto");
});

test("fresh/stale/partial/error statuses never present old analysis as current", () => {
  const record = {
    id: "a", scriptId: "s", sceneId: sceneA, sourceHash: "a".repeat(64), analysisVersion: WRITER_SCRIPT_ASSISTANT_VERSION,
    model: "gpt-5.6-terra", status: "fresh" as const, payload: null, updatedAt: new Date(0).toISOString(),
  };
  assert.equal(writerSceneAnalysisStatus(record, record.sourceHash), "FRESH");
  assert.equal(writerSceneAnalysisStatus(record, "b".repeat(64)), "STALE");
  assert.equal(writerSceneAnalysisStatus({ ...record, status: "partial" }, record.sourceHash), "PARTIAL");
  assert.equal(writerSceneAnalysisStatus({ ...record, status: "error" }, record.sourceHash), "ERROR");
});

test("scene-analysis accounting reserves calculated maximum and settles actual usage", () => {
  assert.equal(estimateWriterSceneAnalysisMaximumCost(1_000, 1_200), 16_400);
  assert.equal(calculateWriterSceneAnalysisCost({ inputTokens: 1_000, cachedInputTokens: 200, outputTokens: 300, reasoningTokens: 0 }), 5_240);
});
