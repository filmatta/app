import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import {
  buildGuidedWritingContext,
  validateWriterGuidedWritingOutput,
  writerGuidedWritingOutputSchema,
  writerGuidedWritingProviderInput,
  writerGuidedWritingRequestAsksForProse,
  type WriterGuidedWritingContext,
  type WriterGuidedWritingMessage,
} from "../../lib/writer/guided-writing.ts";
import { deriveWriterSceneSources, writerSceneSourceHash, type WriterSceneAnalysisRecord } from "../../lib/writer/script-assistant.ts";
import type { WriterNarrativeElement, WriterNarrativeLink } from "../../lib/writer/setup-payoff.ts";

const ids = Array.from({ length: 20 }, (_, index) => `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`);

function fixture(): WriterDocument {
  return { type: "doc", content: [
    createBlock("sceneHeading", "INT. ARCHIVO - NOCHE", ids[0]),
    createBlock("action", "Marta oculta una carta antes de que Luis entre.", ids[1]),
    createBlock("character", "MARTA", ids[2]),
    createBlock("dialogue", "Aquí no hay nada para ti.", ids[3]),
    createBlock("sceneHeading", "INT. PASILLO - NOCHE", ids[4]),
    createBlock("action", "Luis observa la puerta cerrada y decide esperar.", ids[5]),
    createBlock("sceneHeading", "EXT. ESTACIÓN - AMANECER", ids[6]),
    createBlock("action", "Marta entrega la carta sin abrirla.", ids[7]),
  ] };
}

async function analysis(): Promise<WriterSceneAnalysisRecord> {
  const scene = deriveWriterSceneSources(fixture())[0];
  const hash = await writerSceneSourceHash(scene);
  return {
    id: ids[10], scriptId: ids[11], sceneId: scene.sceneId, sourceHash: hash,
    analysisVersion: "assistant-core-v1", model: "gpt-5.6-terra", status: "fresh", updatedAt: "2026-09-30T12:00:00Z",
    payload: {
      objective: { value: "Evitar que Luis encuentre la carta.", confidence: "high", evidence: [{ blockId: ids[1] }] },
      obstacle: { value: "Luis está a punto de entrar.", confidence: "medium", evidence: [{ blockId: ids[1] }] },
      change: { value: null, confidence: "low", evidence: [] },
      observations: [{
        id: "obs-1", category: "change", state: "QUESTION", title: "La escena conserva el mismo equilibrio",
        question: "¿Qué cambia para Marta después de mentir?", observation: null, evidence: [{ blockId: ids[3] }],
      }],
    },
  };
}

function narrativeState() {
  const setup: WriterNarrativeElement = {
    id: ids[12], scriptId: ids[11], sceneId: ids[0], blockId: ids[1], type: "setup", category: "información",
    label: "Carta oculta", excerpt: "Marta oculta una carta", explanation: "Información retenida.", status: "confirmed",
    source: "ai", sourceHash: "a".repeat(64), fingerprint: "setup:carta", confidence: "high", updatedAt: "2026-09-30T12:00:00Z",
  };
  const payoff: WriterNarrativeElement = {
    ...setup, id: ids[13], sceneId: ids[6], blockId: ids[7], type: "payoff", category: "resolución",
    label: "Entrega de la carta", excerpt: "Marta entrega la carta", fingerprint: "payoff:carta",
  };
  const dismissed: WriterNarrativeElement = {
    ...setup, id: ids[14], label: "Relación descartada", status: "dismissed", fingerprint: "dismissed",
  };
  const link: WriterNarrativeLink = {
    id: ids[15], scriptId: ids[11], setupElementId: setup.id, payoffElementId: payoff.id,
    status: "confirmed", source: "user", explanation: "Decisión humana.", confidence: "high", updatedAt: "2026-09-30T12:00:00Z",
  };
  return { elements: [setup, payoff, dismissed], links: [link] };
}

test("scene scope uses the focus scene, adjacent scenes, O-O-C, doubts and confirmed Setup / Payoff", async () => {
  const sceneAnalysis = await analysis();
  const context = await buildGuidedWritingContext({
    document: fixture(), scope: "scene", sceneId: ids[0], analyses: [sceneAnalysis],
    overrides: [{ sceneId: ids[0], objective: "Marta decide proteger el secreto.", obstacle: null, change: null }],
    ...narrativeState(),
  });
  assert.equal(context.focusSceneId, ids[0]);
  assert.deepEqual(context.scenes.map((scene) => scene.role), ["focus", "adjacent"]);
  assert.ok(context.scenes[0].blocks.some((block) => block.blockId === ids[3]));
  assert.equal(context.scenes[1].blocks.length, 0);
  assert.equal(context.ooc.find((item) => item.field === "objective")?.authority, "user");
  assert.equal(context.observations[0].id, "obs-1");
  assert.deepEqual(new Set(context.narrativeElements.map((item) => item.type)), new Set(["setup", "payoff"]));
  assert.equal(context.narrativeLinks[0].authority, "user");
});

test("document scope uses a compact global outline instead of every screenplay block", async () => {
  const context = await buildGuidedWritingContext({ document: fixture(), scope: "document", sceneId: null, analyses: [await analysis()], ...narrativeState() });
  assert.equal(context.scenes.length, 3);
  assert.ok(context.scenes.every((scene) => scene.role === "outline" && scene.blocks.length === 0));
  assert.ok(context.scenes.every((scene) => scene.excerpt.length <= 480));
  assert.equal(context.narrativeLinks.length, 1);
});

test("dismissed observations and narrative candidates never become Guided Writing facts", async () => {
  const sceneAnalysis = await analysis();
  const context = await buildGuidedWritingContext({
    document: fixture(), scope: "scene", sceneId: ids[0], analyses: [sceneAnalysis], ...narrativeState(),
    dismissals: [{ sceneId: ids[0], sourceHash: sceneAnalysis.sourceHash, analysisVersion: sceneAnalysis.analysisVersion, observationId: "obs-1" }],
  });
  assert.equal(context.observations.length, 0);
  assert.equal(context.narrativeElements.some((element) => element.label === "Relación descartada"), false);
  assert.equal(context.narrativeElements.find((element) => element.label === "Carta oculta")?.authority, "confirmed");
});

test("structured responses keep 2–5 questions and resolve only catalogued stable references", async () => {
  const context = await buildGuidedWritingContext({ document: fixture(), scope: "scene", sceneId: ids[0], analyses: [await analysis()], ...narrativeState() });
  const referenceId = context.references.find((reference) => reference.type === "setup")!.referenceId;
  const response = validateWriterGuidedWritingOutput({
    summary: "Marta intenta conservar el control de la información, pero la escena todavía no cambia su posición.",
    questions: [
      { id: "q1", text: "¿Qué debería saber Luis al terminar esta escena que no sabía al entrar?", referenceIds: [referenceId] },
      { id: "q2", text: "¿La mentira de Marta acerca o retrasa la entrega de la carta?", referenceIds: [referenceId] },
    ],
    options: [{ id: "a", title: "Retrasar la revelación", change: "Luis sólo detecta una contradicción.", consequence: "La sospecha crece sin resolver la carta.", referenceIds: [referenceId] }],
    references: [{ referenceId, note: "Setup confirmado por el usuario." }], warnings: [], redirectedFromWritingRequest: false,
  }, context, "Siento que esta escena no avanza.");
  assert.equal(response.questions.length, 2);
  assert.equal(response.references[0].targetId, ids[12]);
  assert.equal(response.references[0].type, "setup");
});

test("unknown references, arbitrary fields and screenplay prose are rejected", async () => {
  const context = await buildGuidedWritingContext({ document: fixture(), scope: "scene", sceneId: ids[0] });
  const base = {
    summary: "La escena mantiene el secreto.",
    questions: [
      { id: "q1", text: "¿Qué cambia para Marta?", referenceIds: [] },
      { id: "q2", text: "¿Qué percibe Luis?", referenceIds: [] },
    ], options: [], references: [], warnings: [], redirectedFromWritingRequest: false,
  };
  assert.throws(() => validateWriterGuidedWritingOutput({ ...base, references: [{ referenceId: "scene:inventada", note: "No existe." }] }, context, "Ayúdame a decidir."), /invalid_reference/u);
  assert.throws(() => validateWriterGuidedWritingOutput({ ...base, summary: "INT. CASA - NOCHE\nMARTA: Nunca debiste venir." }, context, "Ayúdame a decidir."), /screenplay_prose/u);
  assert.throws(() => validateWriterGuidedWritingOutput({ ...base, score: 8 }, context, "Ayúdame a decidir."), /invalid_schema/u);
});

test("an explicit write-my-scene request must be redirected into decisions", async () => {
  const context = await buildGuidedWritingContext({ document: fixture(), scope: "scene", sceneId: ids[0] });
  const value = {
    summary: "Primero conviene decidir qué cambia en la escena.",
    questions: [
      { id: "q1", text: "¿Luis debe salir con una sospecha concreta?", referenceIds: [] },
      { id: "q2", text: "¿Marta mantiene o pierde el control?", referenceIds: [] },
    ], options: [], references: [], warnings: [{ code: "writing_request_redirected", message: "La petición se recondujo a decisiones narrativas." }],
    redirectedFromWritingRequest: false,
  };
  assert.equal(writerGuidedWritingRequestAsksForProse("Escríbeme esta escena completa."), true);
  assert.throws(() => validateWriterGuidedWritingOutput(value, context, "Escríbeme esta escena completa."), /missing_redirect/u);
  assert.equal(validateWriterGuidedWritingOutput({ ...value, redirectedFromWritingRequest: true }, context, "Escríbeme esta escena completa.").redirectedFromWritingRequest, true);
});

test("follow-up provider input retains recent user decisions and the current document hash", async () => {
  const context = await buildGuidedWritingContext({ document: fixture(), scope: "scene", sceneId: ids[0] });
  const history: WriterGuidedWritingMessage[] = [{
    id: ids[16], role: "user", content: "Quiero que Marta mienta.", response: null,
    documentHash: context.documentHash, sceneId: ids[0], createdAt: "2026-09-30T12:00:00Z",
  }];
  const input = writerGuidedWritingProviderInput(context, history, "Quiero que Luis sospeche.", { blockId: ids[3], text: "Aquí no hay nada para ti." });
  assert.match(input, /Quiero que Marta mienta/u);
  assert.match(input, /Quiero que Luis sospeche/u);
  assert.match(input, new RegExp(context.documentHash, "u"));
  assert.match(input, /Aqu[ií] no hay nada para ti/u);
});

test("selection analysis sends only selected scenes and their immediate neighbours", async () => {
  const context = await buildGuidedWritingContext({ document: fixture(), scope: "document", sceneId: null });
  const input = JSON.parse(writerGuidedWritingProviderInput(context, [], "¿Qué cambia aquí?", {
    blockIds: [ids[1]],
    sceneIds: [ids[0]],
    text: "Marta oculta una carta",
    from: 1,
    to: 24,
    sourceRevision: 7,
    documentHash: context.documentHash,
  })) as { context: WriterGuidedWritingContext };
  assert.deepEqual(input.context.scenes.map((scene) => scene.sceneId), [ids[0], ids[4]]);
  assert.equal(input.context.scenes.some((scene) => scene.sceneId === ids[6]), false);
  assert.ok(input.context.references.every((reference) => reference.sceneId !== ids[6]));
});

test("the provider JSON schema is strict at every response layer", () => {
  const schema = writerGuidedWritingOutputSchema();
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.questions.items.additionalProperties, false);
  assert.equal(schema.properties.options.items.additionalProperties, false);
  assert.equal(schema.properties.references.items.additionalProperties, false);
});
