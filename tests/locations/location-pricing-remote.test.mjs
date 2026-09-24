import assert from "node:assert/strict";
import { test } from "node:test";
import { checked, withTestUsers } from "../integration/test-project.mjs";

test("attendee pricing persists atomically and remains owner-scoped in Test", async () =>
  withTestUsers(async ({ prefix, anon, owner, stranger }) => {
    const capacities = [1, 5, 6, 15, 16, 30];
    for (const capacity of capacities) {
      const tiers = suggested(capacity).map((tier, index) => ({
        ...tier,
        price: index === 0 ? 0 : 1400 + index * 100,
        currency: "MXN",
      }));
      const row = checked(await owner.client.from("locations").insert({
        owner_id: owner.id,
        title: `QA tarifa ${capacity}`,
        slug: `${prefix}-rate-${capacity}`,
        city: "Ciudad QA",
        space_type: "Estudio",
        environment: "interior",
        characteristics: { declared_capacity: capacity },
        rate_mode: "tiers",
        rate_tiers: tiers,
        minimum_hours: capacity === 30 ? 4.5 : null,
        status: "published",
      }).select("id,rate_mode,rate_tiers,minimum_hours").single());
      assert.equal(row.rate_mode, "tiers");
      assert.equal(row.rate_tiers.length, tiers.length);

      const publicRow = checked(await anon.rpc("get_public_location", { p_slug: `${prefix}-rate-${capacity}` }));
      assert.equal(publicRow.rate_mode, "tiers");
      assert.deepEqual(publicRow.rate_tiers, tiers);

      const foreign = await stranger.client.from("locations").update({ rate_mode: "inquire", rate_tiers: [] }).eq("id", row.id).select("id");
      assert.equal(foreign.error, null);
      assert.equal(foreign.data.length, 0);
    }

    const target = checked(await owner.client.from("locations").select("id").eq("slug", `${prefix}-rate-15`).single());
    const invalidCases = [
      [{ min: 1, max: 5, price: 1000, currency: "MXN" }, { min: 7, max: 15, price: 1400, currency: "MXN" }],
      [{ min: 1, max: 6, price: 1000, currency: "MXN" }, { min: 6, max: 15, price: 1400, currency: "MXN" }],
      [{ min: 1, max: 14, price: 1000, currency: "MXN" }],
      [{ min: 1, max: 15, price: -1, currency: "MXN" }],
      [{ min: 1, max: 15, price: 1000.001, currency: "MXN" }],
    ];
    for (const rate_tiers of invalidCases) {
      const invalid = await owner.client.from("locations").update({ rate_tiers }).eq("id", target.id);
      assert.equal(invalid.error?.code, "23514");
    }

    checked(await owner.client.from("locations").update({
      rate_mode: "inquire",
      rate_tiers: [],
      minimum_hours: null,
      characteristics: { declared_capacity: 30 },
    }).eq("id", target.id).select("id").single());
    const inquire = checked(await anon.rpc("get_public_location", { p_slug: `${prefix}-rate-15` }));
    assert.equal(inquire.rate_mode, "inquire");
    assert.deepEqual(inquire.rate_tiers, []);
  }));

function suggested(capacity) {
  if (capacity <= 5) return [{ min: 1, max: capacity }];
  if (capacity <= 15) return [{ min: 1, max: 5 }, { min: 6, max: capacity }];
  return [{ min: 1, max: 5 }, { min: 6, max: 15 }, { min: 16, max: capacity }];
}
