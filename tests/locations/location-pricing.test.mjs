import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import load from "../load.mjs";

const pricing = load("lib/locations/pricing.ts");
const migration = fs.readFileSync(
  "supabase/migrations/20260928070000_location_attendee_pricing.sql",
  "utf8",
);

test("suggested attendee ranges cover the requested capacity exactly", () => {
  const cases = new Map([
    [1, [{ min: 1, max: 1 }]],
    [5, [{ min: 1, max: 5 }]],
    [6, [{ min: 1, max: 5 }, { min: 6, max: 6 }]],
    [15, [{ min: 1, max: 5 }, { min: 6, max: 15 }]],
    [16, [{ min: 1, max: 5 }, { min: 6, max: 15 }, { min: 16, max: 16 }]],
    [30, [{ min: 1, max: 5 }, { min: 6, max: 15 }, { min: 16, max: 30 }]],
  ]);
  for (const [capacity, expected] of cases) {
    assert.equal(JSON.stringify(pricing.suggestedLocationRanges(capacity)), JSON.stringify(expected));
  }
  assert.equal(pricing.formatAttendeeRange(6, 6), "6 personas");
});

test("server parser distinguishes explicit zero from an empty price", () => {
  const zero = tierForm({ count: 1, maxima: [5], prices: ["0"] });
  assert.equal(JSON.stringify(pricing.parseLocationPricingForm(zero, 5, false)), JSON.stringify({
    ok: true,
    value: { rateMode: "tiers", rateTiers: [{ min: 1, max: 5, price: 0, currency: "MXN" }], minimumHours: null },
  }));
  const empty = tierForm({ count: 1, maxima: [5], prices: [""] });
  assert.equal(pricing.parseLocationPricingForm(empty, 5, false).error, "incomplete-pricing");
});

test("server parser rejects gaps, overlaps, invalid bounds and an obsolete final limit", () => {
  const wrongFinal = tierForm({ count: 2, maxima: [5, 14], prices: ["1000", "1400"] });
  assert.equal(pricing.parseLocationPricingForm(wrongFinal, 15, false).error, "invalid-pricing");

  const overlap = [
    { min: 1, max: 5, price: "1000" },
    { min: 5, max: 15, price: "1400" },
  ];
  assert.match(pricing.locationPricingProblem(15, overlap), /consecutivos/);

  const gap = [
    { min: 1, max: 5, price: "1000" },
    { min: 7, max: 15, price: "1400" },
  ];
  assert.match(pricing.locationPricingProblem(15, gap), /consecutivos/);

  for (const capacity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(pricing.isPositiveIntegerCapacity(capacity), false);
  }
});

test("legacy mode is permitted only for an existing historical record", () => {
  const data = new FormData();
  data.set("rate_mode", "legacy");
  assert.equal(pricing.parseLocationPricingForm(data, null, true).value.rateMode, "legacy");
  assert.equal(pricing.parseLocationPricingForm(data, null, false).error, "invalid-pricing");
  data.set("rate_mode", "inquire");
  assert.equal(pricing.parseLocationPricingForm(data, null, true).value.rateMode, "inquire");
});

test("database validates pricing atomically and public projections carry its complete state", () => {
  assert.match(migration, /location_attendee_pricing_valid\(characteristics, rate_mode, rate_tiers\)/);
  assert.match(migration, /expected_min = capacity \+ 1/);
  assert.match(migration, /tier_price <> round\(tier_price, 2\)/);
  assert.match(migration, /rate_mode text,rate_tiers jsonb,minimum_hours numeric/);
  assert.match(migration, /'rate_mode',l\.rate_mode,'rate_tiers',l\.rate_tiers,'minimum_hours',l\.minimum_hours/);
});

function tierForm({ count, maxima, prices }) {
  const data = new FormData();
  data.set("rate_mode", "tiers");
  data.set("rate_currency", "MXN");
  data.set("rate_tier_count", String(count));
  for (let index = 0; index < count; index += 1) {
    data.set(`rate_tier_${index}_max`, String(maxima[index]));
    data.set(`rate_tier_${index}_price`, prices[index]);
  }
  return data;
}
