import assert from "node:assert/strict";
import test from "node:test";
import {
  WRITER_IMPORT_PLAN_CONFIG,
  writerImportPageCount,
  writerImportPlanFromAppMetadata,
  writerImportPlanLimit,
} from "../../lib/writer/import-plan.ts";

test("Writer import limits are centralized with a server-side billing integration point", () => {
  assert.equal(writerImportPlanFromAppMetadata(), "free");
  assert.equal(writerImportPlanFromAppMetadata({ writer_import_plan: "free" }), "free");
  assert.equal(writerImportPlanFromAppMetadata({ writer_import_plan: "paid" }), "paid");
  assert.equal(writerImportPlanFromAppMetadata({ writer_import_plan: "enterprise" }), "free");
  assert.equal(writerImportPlanLimit("free").assistedImports, 1);
  assert.equal(writerImportPlanLimit("free").maxPagesPerImport, 15);
  assert.equal(writerImportPlanLimit("paid").maxPagesPerImport, 120);
  assert.equal(WRITER_IMPORT_PLAN_CONFIG.raw.maxBytes, 5_000_000);
  assert.equal(writerImportPageCount(2_155), 9);
});
