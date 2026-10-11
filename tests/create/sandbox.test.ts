import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { IDEATION_SECTIONS, type IdeationSynthesis } from "../../lib/create/ideation/contract.ts";
import { buildSandboxProviderContext, initialSandboxBrief, sandboxEntryPrompts } from "../../lib/create/sandbox/context.ts";
import { estimateSandboxCostUsd, SANDBOX_DEFAULT_MODEL, SANDBOX_FREE_RESPONSE_LIMIT } from "../../lib/create/sandbox/config.ts";
import { isSandboxAiResponse } from "../../lib/create/sandbox/types.ts";
import { addSandboxGuideMaterial, emptySandboxSynthesis } from "../../lib/create/sandbox/handoff.ts";
import { createEmptyWriterDocument } from "../../lib/writer/document.ts";
import { createBlock } from "../../lib/writer/document.ts";
import { extractBoundedWriterEvidence, isSandboxWriterSummary } from "../../lib/create/sandbox/writer-context.ts";

test("Writer context needs explicit source extraction and stays bounded", () => {
  const empty = createEmptyWriterDocument();
  assert.equal(extractBoundedWriterEvidence(empty), null);
  const document = { type: "doc" as const, content: [createBlock("sceneHeading", "INT. CASA - NOCHE"),
    ...Array.from({ length: 100 }, (_, index) => createBlock("action", `Mateo busca a Lucía ${index}. ` + "x".repeat(300))),
    createBlock("character", "MATEO")] };
  const evidence = extractBoundedWriterEvidence(document);
  assert.ok(evidence && evidence.length <= 8000);
  assert.match(evidence, /MATEO/u);
  assert.ok(!evidence.includes("Mateo busca a Lucía 99."));
  assert.ok(isSandboxWriterSummary({ premise: "Memoria ajena", characters: "Mateo", motivations: "", conflicts: "", structure: "", events: "" }));
});

test("Writer summary has provenance and is omitted when Ideation guide exists", () => {
  const writerContext = { writerId: "writer-a", writerRevision: 7,
    summary: { premise: "Memoria prestada", characters: "Mateo", motivations: "Buscar su pasado",
      conflicts: "Sus recuerdos se contradicen", structure: "Tres actos", events: "Encuentra una carta" } };
  const input = { project, possibilities: [], messages: [], memorySummary: "", mode: "divergence" as const, writerContext };
  const fromWriter = buildSandboxProviderContext({ ...input, guide: null });
  assert.deepEqual(fromWriter.writerContext, { source: "writer_opt_in", writerId: "writer-a", writerRevision: 7,
    narrative: writerContext.summary });
  assert.equal(buildSandboxProviderContext({ ...input, guide }).writerContext, null);
});

const project = { id: "project-a", name: "Memoria prestada", summary: "Un hombre recuerda otras vidas.",
  projectType: null, writers: [] };
const synthesis: IdeationSynthesis = { sections: Object.fromEntries(IDEATION_SECTIONS.map((id) =>
  [id, { text: id === "premise" ? "Un hombre recuerda la vida de otra persona." : id === "protagonists" ? "Mateo" : "",
    basis: id === "premise" || id === "protagonists" ? "source" : "open" }])) as IdeationSynthesis["sections"], cues: [] };
const guide = { source_draft_id: "draft-a", context: { originalIdea: "Un hombre recuerda la vida de otra persona.", answers: { protagonist: "Mateo" } }, synthesis };

test("Sandbox opens with known story and real gaps without a greeting call", () => {
  const brief = initialSandboxBrief(project, guide);
  assert.match(brief, /recuerda la vida/u);
  assert.match(brief, /Mateo/u);
  assert.doesNotMatch(brief, /en qué puedo ayudarte/u);
  assert.ok(sandboxEntryPrompts(guide).includes("Intensificar el conflicto"));
});

test("provider context prioritizes Canon, keeps Maybe hypothetical and omits discarded", () => {
  const context = buildSandboxProviderContext({ project, guide, mode: "convergence", memorySummary: "Mateo duda.",
    possibilities: [
      { id: "canon", content: "Mateo no recuerda su infancia.", state: "canon" },
      { id: "maybe", content: "Tal vez su madre sea la fuente.", state: "maybe" },
      { id: "discarded", content: "Un dragón revela todo.", state: "discarded" },
      { id: "proposed", content: "Una carta puede abrir otra línea.", state: "proposed" },
    ] as never[],
    messages: [{ role: "user", content: "Explora la memoria" }] as never[],
  });
  assert.equal(context.mode, "convergence");
  assert.deepEqual(context.canon, [{ id: "canon", content: "Mateo no recuerda su infancia." }]);
  assert.deepEqual(context.maybe, ["Tal vez su madre sea la fuente."]);
  assert.ok(!JSON.stringify(context).includes("Un dragón"));
  assert.equal(context.ideation?.originalIdea, guide.context.originalIdea);
});

test("structured output validation, safe model default and no prompt cache key", () => {
  assert.equal(SANDBOX_DEFAULT_MODEL, "gpt-5.6-terra");
  assert.equal(SANDBOX_FREE_RESPONSE_LIMIT, 3);
  assert.equal(estimateSandboxCostUsd("gpt-5.6-terra", 1000, 200, 500), 0.00764);
  assert.equal(estimateSandboxCostUsd("unpriced-model", 1000, 0, 500), null);
  const response = { assistant_message: "Hay tres caminos.", possibilities: [], questions: [], contradictions: [],
    signals: [], session_summary: "La memoria sigue abierta." };
  assert.ok(isSandboxAiResponse(response));
  assert.ok(!isSandboxAiResponse({ ...response, assistant_message: "" }));
  assert.ok(!isSandboxAiResponse({ ...response, possibilities: [{ title: "X" }] }));
  const source = fs.readFileSync("lib/create/sandbox/ai-server.ts", "utf8");
  assert.ok(!source.includes("prompt_cache_key"));
  assert.match(source, /store: false/u);
});

test("Sandbox handoff adds sourced cues without modifying screenplay or removing existing cues", () => {
  const existing = emptySandboxSynthesis("Una historia en curso.");
  existing.cues.push({ label: "Inicio", objective: "Presentar a Mateo", cue: "Mateo despierta", characters: ["Mateo"],
    setup: "", payoff: "", basis: "source" });
  const writer = createEmptyWriterDocument();
  const before = JSON.stringify(writer);
  const selected = [{ id: "a", content: "Mateo decide ocultar la memoria.", state: "canon" }];
  const updated = addSandboxGuideMaterial(existing, selected, ["¿Quién lo descubre?"], []);
  assert.equal(updated.cues.length, 2);
  assert.equal(updated.cues[0].label, "Inicio");
  assert.equal(updated.cues[1].basis, "source");
  assert.equal((updated.cues[1] as typeof updated.cues[1] & { sourcePossibilityId: string }).sourcePossibilityId, "a");
  assert.match(updated.sections.openQuestions.text, /Quién lo descubre/u);
  assert.equal(addSandboxGuideMaterial(updated, selected, [], []).cues.length, 2);
  assert.equal(JSON.stringify(writer), before);
  assert.ok(writer.content.every((block) => !block.content?.length));
});
