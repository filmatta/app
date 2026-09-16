import assert from "node:assert/strict";
import test from "node:test";
import load from "../load.mjs";
const { parseOpportunityForm } = load("lib/opportunities/form.ts");
function form(overrides = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    title: "Convocatoria",
    project_title: "Cortometraje",
    category: "crew",
    work_mode: "remote",
    compensation_type: "unspecified",
    ...overrides,
  }))
    f.set(k, v);
  return f;
}
test("draft default and explicit publication completeness", () => {
  assert.equal(parseOpportunityForm(form()).status, "draft");
  assert.equal(parseOpportunityForm(form({title:'a'.repeat(160)})).ok, true);
  assert.equal(parseOpportunityForm(form({title:'a'.repeat(161)})).ok, false);
  assert.equal(parseOpportunityForm(form({ status: "published" })).ok, false);
  assert.equal(
    parseOpportunityForm(
      form({
        status: "published",
        description: "Necesitamos una persona para sonido directo.",
      }),
    ).ok,
    true,
  );
});
test("reject forged IDs, invalid money, impossible dates and reversed ranges", () => {
  for (const invalid of [
    { id: "other-user" },
    { status: "admin" },
    {
      compensation_type: "paid",
      compensation_min: "Infinity",
      compensation_currency: "MXN",
    },
    {
      compensation_type: "paid",
      compensation_min: "200",
      compensation_max: "100",
      compensation_currency: "MXN",
    },
    { starts_on: "2026-02-30" },
    { starts_on: "2026-05-02", ends_on: "2026-05-01" },
    { compensation_min: "0xA", compensation_type: "unpaid" },
  ])
    assert.equal(
      parseOpportunityForm(form(invalid)).ok,
      false,
      JSON.stringify(invalid),
    );
});

test("budgets use decimal input, preserve cents and identify the currency", () => {
  for (const amount of ["0xA", "1e3", "100.001", "-1"])
    assert.equal(
      parseOpportunityForm(
        form({
          compensation_type: "paid",
          compensation_min: amount,
          compensation_currency: "MXN",
        }),
      ).ok,
      false,
    );
  assert.equal(
    parseOpportunityForm(
      form({
        compensation_type: "paid",
        compensation_min: "1000.25",
        compensation_currency: "MXN",
      }),
    ).ok,
    true,
  );
  const { formatOpportunityCompensation } = load("lib/opportunities/format.ts");
  const label = formatOpportunityCompensation({
    compensationType: "paid",
    compensationMin: 1000.25,
    compensationMax: null,
    compensationCurrency: "MXN",
  });
  assert.match(label, /MXN/);
  assert.match(label, /1,000.25/);
});
