import assert from "node:assert/strict";
import test from "node:test";
import { IDEATION_FIELDS, IDEATION_SECTIONS, isIdeationAnalysis, isIdeationSynthesis, selectQuestions, type IdeationAnalysis, type IdeationSynthesis } from "../../lib/create/ideation/contract.ts";
import { createEmptyWriterDocument, WRITER_SCHEMA_VERSION } from "../../lib/writer/document.ts";
import { createBasicFdx } from "../../lib/writer/export.ts";
import { buildIdeationSandboxContext } from "../../lib/create/ideation/sandbox-context.ts";
import { developedIdea, longIdea, minimalIdea } from "./ideation-fixtures.ts";

function analysisWith(known: string[]): IdeationAnalysis {
  return { fields: Object.fromEntries(IDEATION_FIELDS.map((id) => [id, { status: known.includes(id) ? "known" : "missing", value: known.includes(id) ? "Ya definido" : "", evidence: known.includes(id) ? "Texto original" : "", confidence: known.includes(id) ? .95 : .1 }])) as IdeationAnalysis["fields"] };
}

test("la idea desarrollada omite preguntas ya respondidas; la mínima conserva huecos", () => {
  assert.ok(developedIdea.length > minimalIdea.length);
  assert.ok(longIdea.split(/\s+/u).length >= 800 && longIdea.split(/\s+/u).length <= 1200);
  const developed = analysisWith(["protagonist", "goal", "conflict", "stakes", "incident", "images", "ending"]);
  assert.deepEqual(selectQuestions(developed, {}), ["escalation", "turn", "theme"]);
  assert.equal(selectQuestions(analysisWith([]), {}).length, 10);
  assert.ok(!selectQuestions(analysisWith([]), { protagonist: "Lucía" }).includes("protagonist"));
});

test("el análisis y la síntesis rechazan salidas incompletas y cues con prosa multilineal", () => {
  const analysis = analysisWith([]);
  assert.ok(isIdeationAnalysis(analysis));
  assert.ok(!isIdeationAnalysis({ fields: { premise: analysis.fields.premise } }));
  const synthesis: IdeationSynthesis = {
    sections: Object.fromEntries(IDEATION_SECTIONS.map((id) => [id, { text: "Por definir", basis: "open" }])) as IdeationSynthesis["sections"],
    cues: [{ label: "Inicio", objective: "Presentar el conflicto", cue: "Mostrar una decisión", characters: ["Lucía"], setup: "Una etiqueta", payoff: "Por definir", basis: "suggestion" }],
  };
  assert.ok(isIdeationSynthesis(synthesis));
  assert.ok(!isIdeationSynthesis({ ...synthesis, cues: [{ ...synthesis.cues[0], cue: "Lucía entra.\nLa cámara la sigue." }] }));
});

test("los cues separados nunca se exportan como screenplay", () => {
  const document = createEmptyWriterDocument();
  const exportText = createBasicFdx({ title: "Prueba", document, schemaVersion: WRITER_SCHEMA_VERSION });
  assert.ok(!exportText.includes("Presentar el conflicto"));
  assert.ok(!exportText.includes("Mostrar una decisión"));
  assert.equal(document.content.every((block) => !block.content?.length), true);
});

test("el handoff a Sandbox lleva contexto y sólo decisiones aceptadas", () => {
  const synthesis: IdeationSynthesis = {
    sections: Object.fromEntries(IDEATION_SECTIONS.map((id) => [id, { text: id, basis: "source" }])) as IdeationSynthesis["sections"],
    cues: [],
  };
  const context = buildIdeationSandboxContext({ originalIdea: "Una premisa", answers: { goal: "Encontrar a Ana" } }, synthesis, [
    { content: "La ciudad desaparece", state: "maybe" },
    { content: "Ana conoce el secreto", state: "canon" },
    { content: "Todo era un sueño", state: "discarded" },
  ]);
  assert.equal(context.originalIdea, "Una premisa");
  assert.deepEqual(context.acceptedDecisions, ["Ana conoce el secreto"]);
  assert.deepEqual(context.possibilities, ["La ciudad desaparece"]);
  assert.ok(!JSON.stringify(context).includes("Todo era un sueño"));
});
