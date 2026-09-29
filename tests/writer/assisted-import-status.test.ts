import assert from "node:assert/strict";
import test from "node:test";
import {
  assistedImportAnalysisVersion,
  determineAssistedImportAnalysisStatus,
  parseAssistedImportAnalysisVersion,
  parseAssistedImportAnalysisStatus,
  recoverySkippedReasonForErrorCode,
  writerImportCompletionMessage,
} from "../../lib/writer/assisted-import-status.ts";

test("analysis status separates complete, partial, and unusable results", () => {
  assert.equal(determineAssistedImportAnalysisStatus({ incomplete: false, validationIssueCount: 0, usableResultCount: 0 }), "complete");
  assert.equal(determineAssistedImportAnalysisStatus({ incomplete: false, validationIssueCount: 2, usableResultCount: 1 }), "partial");
  assert.equal(determineAssistedImportAnalysisStatus({ incomplete: true, validationIssueCount: 225, usableResultCount: 0 }), "unusable");
  assert.equal(parseAssistedImportAnalysisStatus("untrusted", "partial"), "partial");
});

test("analysis version persists a recovery budget skip without a schema change", () => {
  const value = assistedImportAnalysisVersion({
    version: "writer-assisted-import-v1",
    status: "partial",
    recoverySkippedReason: "recovery_budget_unavailable",
  });
  assert.equal(value, "writer-assisted-import-v1/partial;recovery_budget_unavailable");
  assert.deepEqual(parseAssistedImportAnalysisVersion(value), {
    status: "partial",
    recoverySkippedReason: "recovery_budget_unavailable",
  });
});

test("recovery reservation limits remain distinguishable and provider failures remain fatal", () => {
  assert.equal(recoverySkippedReasonForErrorCode("budget"), "recovery_budget_unavailable");
  assert.equal(recoverySkippedReasonForErrorCode("global_budget"), "recovery_budget_unavailable");
  assert.equal(recoverySkippedReasonForErrorCode("call_limit"), "recovery_call_limit_unavailable");
  assert.equal(recoverySkippedReasonForErrorCode("provider_invalid_output"), null);
  assert.equal(recoverySkippedReasonForErrorCode("provider_uncertain"), null);

  const value = assistedImportAnalysisVersion({
    version: "writer-assisted-import-v1",
    status: "partial",
    recoverySkippedReason: "recovery_call_limit_unavailable",
  });
  assert.equal(value, "writer-assisted-import-v1/partial;recovery_call_limit_unavailable");
  assert.deepEqual(parseAssistedImportAnalysisVersion(value), {
    status: "partial",
    recoverySkippedReason: "recovery_call_limit_unavailable",
  });
});

test("completion copy does not present failed validation as an empty character analysis", () => {
  const base = { mode: "ai", identityCount: 0, sceneCount: 2, characterHeadingCount: 0, blockCount: 4, observationCount: 0 };
  assert.equal(writerImportCompletionMessage({ ...base, analysisStatus: "complete" }),
    "Guion importado completo. El análisis terminó sin referencias de personajes.");
  assert.equal(writerImportCompletionMessage({ ...base, identityCount: 1, analysisStatus: "partial" }),
    "Tu guion se importó completo. Vinculamos algunas referencias de personajes; otras quedaron pendientes.");
  assert.equal(writerImportCompletionMessage({
    ...base,
    identityCount: 1,
    analysisStatus: "partial",
    recoverySkippedReason: "recovery_budget_unavailable",
  }), "Guion importado. Algunas referencias del análisis quedaron pendientes por el límite de uso.");
  assert.equal(writerImportCompletionMessage({
    ...base,
    identityCount: 1,
    analysisStatus: "partial",
    recoverySkippedReason: "recovery_call_limit_unavailable",
  }), "Guion importado. Algunas referencias del análisis quedaron pendientes por el límite de uso.");
  assert.equal(writerImportCompletionMessage({ ...base, analysisStatus: "unusable" }),
    "Tu guion se importó completo. No pudimos vincular el análisis de personajes a sus fragmentos.");
});
