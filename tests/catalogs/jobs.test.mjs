import test from "node:test";
import assert from "node:assert/strict";
import load from "../load.mjs";
const { parseOpportunityForm } = load("lib/opportunities/form.ts");
const values = {
  title: "Edición de cortometraje",
  project_title: "Proyecto prueba",
  opportunity_type: "job",
  category: "paid_work",
  compensation_type: "paid",
  work_mode: "remote",
  description: "Edición y revisión de un cortometraje audiovisual de ficción.",
  deliverables: "Un montaje final y sus archivos de exportación.",
  discipline: "Edición",
  compensation_min: "1500",
  compensation_currency: "MXN",
  application_deadline: "2030-01-01",
  status: "published",
};
const parse = (changes) => {
  const form = new FormData();
  for (const [k, v] of Object.entries({ ...values, ...changes }))
    form.set(k, v);
  return parseOpportunityForm(form);
};
test("job publication validates structured paid work without duplicating budget fields", () => {
  assert.equal(parse({}).ok, true);
  assert.equal(parse({}).values.opportunity_type, "job");
  for (const invalid of [
    { opportunity_type: "fake" },
    { category: "casting" },
    { compensation_type: "unpaid" },
    { compensation_min: "0" },
    { deliverables: "Short" },
    { discipline: "" },
    { description: "Short" },
    { application_deadline: "" },
    { compensation_currency: "" },
    { application_deadline: "2030-02-30" },
  ])
    assert.equal(parse(invalid).ok, false, JSON.stringify(invalid));
  assert.equal(
    parse({
      status: "draft",
      description: "",
      deliverables: "",
      discipline: "",
      compensation_min: "",
      compensation_currency: "",
      application_deadline: "",
    }).ok,
    true,
  );
});
