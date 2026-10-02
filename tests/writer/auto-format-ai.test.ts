import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  classifyWriterAutoFormatCandidatesWithProvider,
  writerAutoFormatAiAvailable,
  type WriterAutoFormatProvider,
} from "../../lib/writer/auto-format-classifier.ts";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import {
  createWriterAutoFormatPlan,
  mergeWriterAutoFormatClassifications,
  writerAutoFormatCandidates,
} from "../../lib/writer/smart-format.ts";

function ambiguousDocument(): WriterDocument {
  return { type: "doc", content: [
    createBlock("action", "INT. CASA - NOCHE"),
    createBlock("action", ""),
    createBlock("action", "Una lámpara tiembla."),
    createBlock("action", ""),
    createBlock("action", "VOZ"),
    createBlock("action", ""),
    createBlock("action", "Silencio."),
  ] };
}

test("a mocked classifier receives only bounded ambiguous blocks and resolves canonical types without rewriting", async () => {
  const document = ambiguousDocument();
  const plan = createWriterAutoFormatPlan(document, { scope: "document" });
  const candidates = writerAutoFormatCandidates(document, plan);
  const providerInputs: Parameters<WriterAutoFormatProvider>[0][] = [];
  const provider: WriterAutoFormatProvider = async (input) => {
    providerInputs.push(input);
    return {
      result: {
        classifications: input.candidates.map((candidate) => ({
          blockId: candidate.blockId,
          kind: candidate.text === "VOZ" ? "character" : candidate.text === "Silencio." ? "dialogue" : "action",
          characterName: candidate.text === "VOZ" || candidate.text === "Silencio." ? "VOZ" : null,
        })),
      },
      usage: { inputTokens: 240, cachedInputTokens: 0, outputTokens: 64, reasoningTokens: 0 },
      latencyMs: 18,
      requestId: "mock-request",
    };
  };
  const result = await classifyWriterAutoFormatCandidatesWithProvider(candidates, { operationId: crypto.randomUUID() }, provider);
  const merged = mergeWriterAutoFormatClassifications(plan, result.classifications);
  const providerInput = providerInputs[0];

  assert.ok(providerInput);
  assert.equal(providerInput.candidates.length, candidates.length);
  assert.equal(providerInput.candidates.some((candidate) => candidate.text === "INT. CASA - NOCHE"), false);
  assert.ok(providerInput.candidates.every((candidate) => candidate.text.length <= 240));
  assert.equal(merged.changes.find((change) => change.text === "VOZ")?.proposedKind, "character");
  assert.equal(merged.changes.find((change) => change.text === "Silencio.")?.proposedKind, "dialogue");
  assert.equal(merged.changes.find((change) => change.text === "Silencio.")?.text, "Silencio.");
  assert.equal(result.model, "gpt-5.6-terra");
  assert.ok(result.costMicrousd > 0);
});

test("malformed provider output fails closed so the deterministic plan remains available", async () => {
  const document = ambiguousDocument();
  const plan = createWriterAutoFormatPlan(document, { scope: "document" });
  const candidates = writerAutoFormatCandidates(document, plan);
  await assert.rejects(
    classifyWriterAutoFormatCandidatesWithProvider(candidates, { operationId: crypto.randomUUID() }, async () => ({
      result: { classifications: [{ blockId: candidates[0]?.blockId, kind: "rewrite", characterName: null, text: "cambiado" }] },
      usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, reasoningTokens: 0 },
      latencyMs: 1,
    })),
    /inválido|todos los bloques/iu,
  );
  assert.ok(plan.changes.length > 0);
  assert.equal(plan.changes.some((change) => change.text === "Silencio."), true);
});

test("AI classification is closed to the exact authorized Preview and Supabase Test", () => {
  const allowed = {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "codex/writer-smart-format-layout-v1",
    NEXT_PUBLIC_SUPABASE_URL: "https://ezlycwkuzkwcnhrhiruv.supabase.co",
  };
  assert.equal(writerAutoFormatAiAvailable(allowed), true);
  assert.equal(writerAutoFormatAiAvailable({ ...allowed, VERCEL_ENV: "production" }), false);
  assert.equal(writerAutoFormatAiAvailable({ ...allowed, VERCEL_GIT_COMMIT_REF: "staging" }), false);
  assert.equal(writerAutoFormatAiAvailable({ ...allowed, NEXT_PUBLIC_SUPABASE_URL: "https://production.invalid" }), false);
  assert.equal(writerAutoFormatAiAvailable({}), false);
});

test("the endpoint derives candidates from the saved canonical document and logs no screenplay content", () => {
  const route = fs.readFileSync("app/api/writer/scripts/[id]/auto-format/route.ts", "utf8");
  const client = fs.readFileSync("lib/writer/auto-format-client.ts", "utf8");
  const server = fs.readFileSync("lib/writer/auto-format-server.ts", "utf8");
  assert.match(route, /select\("id,document"\)/u);
  assert.match(route, /createWriterAutoFormatPlan\(document\.document/u);
  assert.match(route, /writerAutoFormatCandidates\(document\.document/u);
  assert.doesNotMatch(client, /candidate\.text|candidates:/u);
  assert.match(server, /store: false/u);
  assert.match(server, /additionalProperties: false/u);
  assert.doesNotMatch(route, /originalText|candidate\.text|sourceText/u);
});
