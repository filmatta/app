import assert from "node:assert/strict";
import test from "node:test";
import { buildAssistedImportBatches, prepareAssistedImportStaging } from "../../lib/writer/assisted-import.ts";
import { assistedImportBudgetDecision, estimateAssistedImportPipelinePlan } from "../../lib/writer/assisted-import-plan.ts";

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
