import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  calculateAssistedImportCostMicrousd,
  countAssistedImportTokens,
  estimateAssistedImportMaximumCostMicrousd,
  assistedImportReasoning,
  intervalUnionMs,
} from "../../lib/writer/assisted-import-accounting.ts";
import { checkAssistedImportAccess } from "../../lib/writer/assisted-import-access.ts";

const server = fs.readFileSync("lib/writer/assisted-import-server.ts", "utf8");
const route = fs.readFileSync("app/api/writer/imports/assisted/route.ts", "utf8");
const interfaceSource = fs.readFileSync("components/writer/WriterImportFlow.tsx", "utf8");

test("provider configuration is server-only, stored-output disabled, strict, and tool-free", () => {
  assert.match(server, /import "server-only"/u);
  assert.match(server, /model: WRITER_ASSISTED_IMPORT_MODEL/u);
  assert.match(server, /reasoning: \{ effort: input\.reasoning \}/u);
  assert.match(server, /store: false/u);
  assert.match(server, /type: "json_schema"/u);
  assert.match(server, /strict: true/u);
  assert.match(server, /maxRetries: 0/u);
  assert.doesNotMatch(server, /NEXT_PUBLIC_OPENAI/u);
  assert.doesNotMatch(server, /\btools\s*:/u);
});

test("QA reasoning selection is server-controlled and defaults to none", () => {
  assert.equal(assistedImportReasoning({}), "none");
  assert.equal(assistedImportReasoning({ WRITER_AI_IMPORT_QA_REASONING: "low" }), "low");
  assert.equal(assistedImportReasoning({ WRITER_AI_IMPORT_QA_REASONING: "high" }), "none");
  assert.equal(intervalUnionMs([
    { start: 0, end: 100 },
    { start: 25, end: 75 },
    { start: 120, end: 150 },
  ]), 130);
});

test("private endpoint authenticates before reading the body and ignores client pricing or model choices", () => {
  const authIndex = route.indexOf("writerApiSession()");
  const bodyIndex = route.indexOf("request.text()");
  assert.ok(authIndex >= 0 && bodyIndex > authIndex);
  assert.doesNotMatch(route, /value\.(?:model|price|plan|cost)/u);
  assert.match(route, /MAX_REQUEST_BYTES/u);
});

test("main import flow is one click, discloses OpenAI, and keeps manual review optional", () => {
  assert.ok(interfaceSource.includes("Importar y organizar"));
  assert.ok(interfaceSource.includes("Importar sin IA"));
  assert.ok(interfaceSource.includes("Ajustar formato manualmente"));
  assert.match(interfaceSource, /Enviaremos el texto necesario a OpenAI/u);
  assert.doesNotMatch(interfaceSource, /IMPORT FOUNDATION V0/u);
  assert.doesNotMatch(interfaceSource, />Revisar \(0\)</u);
});

test("token and cost accounting includes cached input and output in microdollars", () => {
  assert.ok(countAssistedImportTokens("Carolina abre la puerta.") > 0);
  assert.equal(estimateAssistedImportMaximumCostMicrousd(10_000, 2_400), 4_880);
  assert.equal(calculateAssistedImportCostMicrousd({
    inputTokens: 10_000,
    cachedInputTokens: 4_000,
    outputTokens: 2_000,
    reasoningTokens: 0,
  }), 3_680);
});

test("server activation fails closed unless flag, key, and exact QA allowlist all match", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  assert.equal(checkAssistedImportAccess({}, userId).enabled, false);
  assert.equal(checkAssistedImportAccess({ WRITER_AI_IMPORT_ENABLED: "true" }, userId).enabled, false);
  assert.equal(checkAssistedImportAccess({ WRITER_AI_IMPORT_ENABLED: "true", OPENAI_API_KEY: "configured" }, userId).enabled, false);
  assert.deepEqual(checkAssistedImportAccess({
    WRITER_AI_IMPORT_ENABLED: "true",
    OPENAI_API_KEY: "configured",
    WRITER_AI_IMPORT_QA_USER_IDS: `other, ${userId}`,
  }, userId), { enabled: true, reason: null });
});
