import assert from "node:assert/strict";
import test from "node:test";
import {
  assistedImportBudgetPolicy,
  isKnownAssistedImportOperationBudget,
} from "../../lib/writer/assisted-import-budget-policy.ts";

test("the private staging review policy selects three dollars per operation and ten dollars globally", () => {
  assert.deepEqual(assistedImportBudgetPolicy({
    WRITER_ASSISTED_IMPORT_BUDGET_POLICY: "staging-human-review-v1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
  }), {
    operationBudgetMicroUsd: 3_000_000,
    globalBudgetMicroUsd: 10_000_000,
    name: "staging-human-review-v1",
  });
});

test("production, incomplete, unknown, and public configuration retain the old policy", () => {
  const expected = {
    operationBudgetMicroUsd: 200_000,
    globalBudgetMicroUsd: 2_000_000,
    name: "default",
  };
  assert.deepEqual(assistedImportBudgetPolicy({}), expected);
  assert.deepEqual(assistedImportBudgetPolicy({
    WRITER_ASSISTED_IMPORT_BUDGET_POLICY: "staging-human-review-v1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
  }), expected);
  assert.deepEqual(assistedImportBudgetPolicy({
    WRITER_ASSISTED_IMPORT_BUDGET_POLICY: "3000000",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
  }), expected);
  assert.deepEqual(assistedImportBudgetPolicy({
    NEXT_PUBLIC_WRITER_ASSISTED_IMPORT_BUDGET_POLICY: "staging-human-review-v1",
    NEXT_PUBLIC_WRITER_ASSISTED_IMPORT_OPERATION_BUDGET: "3000000",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
  }), expected);
});

test("only persisted product, QA grant, and staging operation budgets are accepted", () => {
  assert.equal(isKnownAssistedImportOperationBudget(200_000), true);
  assert.equal(isKnownAssistedImportOperationBudget(600_000), true);
  assert.equal(isKnownAssistedImportOperationBudget(3_000_000), true);
  assert.equal(isKnownAssistedImportOperationBudget(3_000_001), false);
});
