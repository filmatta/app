import assert from "node:assert/strict";
import test from "node:test";
import {
  determineAssistedImportAnalysisStatus,
  parseAssistedImportAnalysisStatus,
  writerImportCompletionMessage,
} from "../../lib/writer/assisted-import-status.ts";

test("analysis status separates complete, partial, and unusable results", () => {
  assert.equal(determineAssistedImportAnalysisStatus({ incomplete: false, validationIssueCount: 0, usableResultCount: 0 }), "complete");
  assert.equal(determineAssistedImportAnalysisStatus({ incomplete: false, validationIssueCount: 2, usableResultCount: 1 }), "partial");
  assert.equal(determineAssistedImportAnalysisStatus({ incomplete: true, validationIssueCount: 225, usableResultCount: 0 }), "unusable");
  assert.equal(parseAssistedImportAnalysisStatus("untrusted", "partial"), "partial");
});

test("completion copy does not present failed validation as an empty character analysis", () => {
  const base = { mode: "ai", identityCount: 0, sceneCount: 2, characterHeadingCount: 0, blockCount: 4, observationCount: 0 };
  assert.equal(writerImportCompletionMessage({ ...base, analysisStatus: "complete" }),
    "Guion importado completo. El análisis terminó sin referencias de personajes.");
  assert.equal(writerImportCompletionMessage({ ...base, identityCount: 1, analysisStatus: "partial" }),
    "Tu guion se importó completo. Vinculamos algunas referencias de personajes; otras quedaron pendientes.");
  assert.equal(writerImportCompletionMessage({ ...base, analysisStatus: "unusable" }),
    "Tu guion se importó completo. No pudimos vincular el análisis de personajes a sus fragmentos.");
});
