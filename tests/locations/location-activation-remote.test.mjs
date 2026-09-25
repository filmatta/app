import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { checked, withTestUsers } from "../integration/test-project.mjs";

function baseLocation(prefix, ownerId, suffix) {
  return {
    owner_id: ownerId,
    title: `Activation ${suffix}`,
    slug: `${prefix}-${suffix}`,
    city: "Guadalajara",
    space_type: "Casa",
    environment: "both",
    status: "draft",
  };
}

test("Locations Activation schema and ownership contract hold in Supabase Test", async () =>
  withTestUsers(async ({ prefix, owner, stranger }) => {
    const historical = checked(await owner.client.from("locations").insert(
      baseLocation(prefix, owner.id, "historical"),
    ).select("id,onboarding_step,onboarding_completed_at").single());
    assert.equal(historical.onboarding_step, null);
    assert.equal(historical.onboarding_completed_at, null);

    const creationKey = randomUUID();
    const active = checked(await owner.client.from("locations").insert({
      ...baseLocation(prefix, owner.id, "active"),
      creation_key: creationKey,
      onboarding_step: 3,
      onboarding_completed_at: null,
    }).select("id,status,onboarding_step,onboarding_completed_at").single());
    assert.equal(active.onboarding_step, 3);
    assert.equal(active.status, "draft");

    const resumed = checked(await owner.client.from("locations")
      .select("id,onboarding_step,onboarding_completed_at")
      .eq("id", active.id).single());
    assert.equal(resumed.onboarding_step, 3);
    assert.equal(resumed.onboarding_completed_at, null);

    const duplicate = await owner.client.from("locations").insert({
      ...baseLocation(prefix, owner.id, "duplicate"),
      creation_key: creationKey,
      onboarding_step: 3,
    });
    assert.equal(duplicate.error?.code, "23505", "creation_key remains owner-idempotent");

    const invalidStates = [
      { onboarding_step: 0, onboarding_completed_at: null },
      { onboarding_step: 9, onboarding_completed_at: null },
      { onboarding_step: 7, onboarding_completed_at: new Date().toISOString() },
      { onboarding_step: 8, onboarding_completed_at: null },
      { onboarding_step: null, onboarding_completed_at: new Date().toISOString() },
    ];
    for (const [index, invalid] of invalidStates.entries()) {
      const result = await owner.client.from("locations").insert({
        ...baseLocation(prefix, owner.id, `invalid-${index}`),
        ...invalid,
      });
      assert.equal(result.error?.code, "23514", `invalid onboarding combination ${index} must be rejected`);
    }

    checked(await owner.client.from("locations").update({
      characteristics: { declared_capacity: 24 },
      onboarding_step: 4,
    }).eq("id", active.id).select("id").single());
    const failedSave = await owner.client.from("locations").update({
      rate_mode: "tiers",
      rate_tiers: [{ min: 1, max: 23, price: 1000, currency: "MXN" }],
      onboarding_step: 5,
    }).eq("id", active.id);
    assert.equal(failedSave.error?.code, "23514");
    assert.equal(checked(await owner.client.from("locations").select("onboarding_step").eq("id", active.id).single()).onboarding_step, 4);

    const foreign = await stranger.client.from("locations").update({ onboarding_step: 5 })
      .eq("id", active.id).select("id");
    assert.equal(foreign.error, null);
    assert.equal(foreign.data.length, 0);
    assert.equal(checked(await owner.client.from("locations").select("onboarding_step").eq("id", active.id).single()).onboarding_step, 4);

    const completedAt = new Date().toISOString();
    const completed = checked(await owner.client.from("locations").update({
      onboarding_step: 8,
      onboarding_completed_at: completedAt,
    }).eq("id", active.id).select("status,onboarding_step,onboarding_completed_at").single());
    assert.equal(completed.onboarding_step, 8);
    assert.equal(new Date(completed.onboarding_completed_at).getTime(), new Date(completedAt).getTime());
    assert.equal(completed.status, "draft", "activation completion never publishes");
  }));
