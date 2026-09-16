import test from "node:test";
import assert from "node:assert/strict";
import load from "../load.mjs";
const { parseServiceForm } = load("lib/services/form.ts", {
  "@/lib/opportunities/form": load("lib/opportunities/form.ts"),
});
const form = (changes = {}) => {
  const f = new FormData();
  for (const [key, value] of Object.entries({
    title: "Edición audiovisual",
    category: "postproduction",
    work_mode: "remote",
    ...changes,
  }))
    f.set(key, value);
  return f;
};
test("service validation defaults to draft and enforces publication, money and safe portfolio URLs", () => {
  assert.equal(parseServiceForm(form()).status, "draft");
  for (const invalid of [
    { status: "published" },
    { category: "invalid" },
    { id: "other-owner" },
    { status: "archived" },
    { indicative_price: "0xA", currency: "MXN" },
    { indicative_price: "10.123", currency: "MXN" },
    { currency: "USD" },
    { link_label_0: "Reel", link_url_0: "javascript:alert(1)" },
    { link_label_0: "Reel", link_url_0: "https://user:pass@example.com" },
    { link_label_0: "Missing URL" },
  ])
    assert.equal(
      parseServiceForm(form(invalid)).ok,
      false,
      JSON.stringify(invalid),
    );
  const valid = parseServiceForm(
    form({
      status: "published",
      description:
        "Edición y acabado de piezas audiovisuales con entregables claros.",
      indicative_price: "1500.25",
      currency: "MXN",
      link_label_0: "Reel",
      link_url_0: "https://example.com/reel",
    }),
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.values.indicative_price, 1500.25);
  assert.equal(valid.values.portfolio_links[0].label, "Reel");
});
