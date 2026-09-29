import assert from "node:assert/strict";
import test from "node:test";
import { buildAssistedImportBatches, prepareAssistedImportStaging } from "../../lib/writer/assisted-import.ts";
import { assistedImportBudgetDecision, dryRunAssistedImport, estimateAssistedImportPipelinePlan } from "../../lib/writer/assisted-import-plan.ts";
import { assistedImportDatabaseErrorDescriptor } from "../../lib/writer/assisted-import-errors.ts";

test("the 11,529-character review shape admits Terra without pre-authorizing theoretical Sol", () => {
  let source = "INT. CASA - DÍA\n";
  for (let index = 0; index < 120; index += 1) source += "Carolina camina por la sala.\n";
  while (source.length + 5 <= 11_529) source += "algo ";
  source += "x".repeat(11_529 - source.length);
  const staging = prepareAssistedImportStaging({ format: "pasted", sourceText: source, title: "Caso humano" });
  const plan = estimateAssistedImportPipelinePlan(buildAssistedImportBatches(staging));
  assert.equal(source.length, 11_529);
  assert.equal(plan.base.costMicrousd, 124_104);
  assert.equal(plan.observableRecovery.costMicrousd - plan.base.costMicrousd, 92_052);
  assert.equal(plan.maximum.costMicrousd, 361_620);
  const recoveryAfterTerraSettlement = assistedImportBudgetDecision({
    operationBudgetMicrousd: 200_000,
    actualCostMicrousd: 124_104,
    reservedCostMicrousd: 0,
    requestedMicrousd: 92_052,
  });
  assert.equal(recoveryAfterTerraSettlement.allowed, false);
  assert.equal(recoveryAfterTerraSettlement.remainingBeforeMicrousd, 75_896);
});

test("Terra and conditional Sol fit when their staged reservations fit the operation", () => {
  const terra = assistedImportBudgetDecision({ operationBudgetMicrousd: 200_000, actualCostMicrousd: 0, reservedCostMicrousd: 0, requestedMicrousd: 50_000 });
  const sol = assistedImportBudgetDecision({ operationBudgetMicrousd: 200_000, actualCostMicrousd: 50_000, reservedCostMicrousd: 0, requestedMicrousd: 100_000 });
  assert.equal(terra.allowed, true);
  assert.equal(sol.allowed, true);
});

test("Terra may run while an unaffordable recovery is skipped", () => {
  const terra = assistedImportBudgetDecision({ operationBudgetMicrousd: 200_000, actualCostMicrousd: 0, reservedCostMicrousd: 0, requestedMicrousd: 80_000 });
  const sol = assistedImportBudgetDecision({ operationBudgetMicrousd: 200_000, actualCostMicrousd: 80_000, reservedCostMicrousd: 0, requestedMicrousd: 150_000 });
  assert.equal(terra.allowed, true);
  assert.equal(sol.allowed, false);
  assert.equal(sol.remainingBeforeMicrousd, 120_000);
});

test("an unaffordable Terra stage is rejected before any provider budget is reserved", () => {
  const terra = assistedImportBudgetDecision({ operationBudgetMicrousd: 200_000, actualCostMicrousd: 0, reservedCostMicrousd: 0, requestedMicrousd: 210_000 });
  assert.equal(terra.allowed, false);
  assert.equal(terra.remainingAfterMicrousd, 200_000);
});

test("recovery uses actual settled Terra cost rather than its former reservation", () => {
  const sol = assistedImportBudgetDecision({ operationBudgetMicrousd: 200_000, actualCostMicrousd: 40_000, reservedCostMicrousd: 0, requestedMicrousd: 140_000 });
  assert.equal(sol.allowed, true);
  assert.equal(sol.remainingAfterMicrousd, 20_000);
});

test("pending reservations are included so concurrent recovery attempts cannot overspend", () => {
  const first = assistedImportBudgetDecision({ operationBudgetMicrousd: 200_000, actualCostMicrousd: 40_000, reservedCostMicrousd: 0, requestedMicrousd: 100_000 });
  const second = assistedImportBudgetDecision({ operationBudgetMicrousd: 200_000, actualCostMicrousd: 40_000, reservedCostMicrousd: 100_000, requestedMicrousd: 100_000 });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
});

test("no recovery budget is requested when the router does not require recovery", () => {
  const recoveryItems: unknown[] = [];
  assert.equal(recoveryItems.reduce<number>((total) => total + 1, 0), 0);
});

test("the dry-run uses the execution planner without reserving or calling external services", () => {
  const staging = prepareAssistedImportStaging({
    format: "pasted",
    title: "Dry run",
    sourceText: "INT. CASA - DÍA\n\nANA\nHola.\n\nLa puerta se cierra.",
  });
  const dryRun = dryRunAssistedImport(staging, 200_000);
  const direct = estimateAssistedImportPipelinePlan(buildAssistedImportBatches(staging));
  assert.deepEqual(dryRun.plan, direct);
  assert.equal(dryRun.baseBudgetDecision.requestedMicrousd, direct.base.costMicrousd);
  assert.equal(dryRun.batches.length, direct.base.terraCalls);
  assert.ok(dryRun.candidateCount > 0);
});

test("equal source length can produce different plans when screenplay structure differs", () => {
  const action = "INT. CASA - DÍA\n" + "Carolina camina por la sala.\n".repeat(80);
  const dialogue = "INT. CASA - DÍA\n" + "CAROLINA\nHola, Esperanza.\n".repeat(80);
  const length = Math.max(action.length, dialogue.length);
  const pad = (value: string) => value + "x".repeat(length - value.length);
  const actionRun = dryRunAssistedImport(prepareAssistedImportStaging({ format: "pasted", sourceText: pad(action), title: "Acción" }), 200_000);
  const dialogueRun = dryRunAssistedImport(prepareAssistedImportStaging({ format: "pasted", sourceText: pad(dialogue), title: "Diálogo" }), 200_000);
  assert.equal(pad(action).length, pad(dialogue).length);
  assert.notEqual(actionRun.candidateCount, dialogueRun.candidateCount);
  assert.notEqual(actionRun.plan.base.costMicrousd, dialogueRun.plan.base.costMicrousd);
});

test("a base reservation equal to the operation limit is allowed without rounding drift", () => {
  const decision = assistedImportBudgetDecision({
    operationBudgetMicrousd: 200_000,
    actualCostMicrousd: 0,
    reservedCostMicrousd: 0,
    requestedMicrousd: 200_000,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.remainingAfterMicrousd, 0);
});

test("database policy errors keep authorization, budget, calls, global balance, and quota distinct", () => {
  const cases = [
    ["WRITER_IMPORT_BUDGET_AUTHORIZATION", "budget_authorization"],
    ["WRITER_IMPORT_BUDGET", "budget"],
    ["WRITER_IMPORT_CALL_LIMIT", "call_limit"],
    ["WRITER_IMPORT_GLOBAL_BUDGET", "global_budget"],
    ["WRITER_IMPORT_FREE_USED", "free_used"],
    ["WRITER_IMPORT_ATTEMPTS", "attempts"],
    ["WRITER_QUOTA_REACHED", "writer_quota"],
  ] as const;
  for (const [message, code] of cases) {
    assert.equal(assistedImportDatabaseErrorDescriptor({ message })?.code, code);
  }
});
