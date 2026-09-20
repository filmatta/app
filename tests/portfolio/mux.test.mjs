import assert from "node:assert/strict";
import { test } from "node:test";
import load from "../load.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const environment = { id: "test-mux", type: "development" };
function harness(patch = {}) {
  const writes = [],
    deleted = [];
  const row = {
    id,
    source: "mux",
    mux_upload_id: "upload",
    mux_environment_id: "test-mux",
    mux_environment_type: "development",
    status: "uploading",
    updated_at: "old",
    ...patch.row,
  };
  const asset = {
    id: "asset",
    upload_id: "upload",
    passthrough: "filmatta:portfolio:" + id,
    status: "ready",
    playback_ids: [{ id: "signed", policy: "signed" }],
    ...patch.asset,
  };
  const mux = {
    video: {
      assets: {
        retrieve: async () => asset,
        retrieveInputInfo: async () =>
          patch.inputs ?? [
            { file: { tracks: [{ type: "video", encoding: "h.264" }] } },
          ],
        delete: async (id) => deleted.push(id),
      },
      uploads: {
        retrieve: async () => ({
          id: "upload",
          asset_id: "asset",
          new_asset_settings: { passthrough: asset.passthrough },
        }),
      },
    },
  };
  const db = {
    from() {
      let update;
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        maybeSingle: async () => ({ data: row, error: null }),
        update(v) {
          update = v;
          writes.push(v);
          return q;
        },
        then(resolve) {
          return Promise.resolve({
            data: patch.race ? [] : [{ id }],
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  };
  const module = load("lib/profiles/mux-media.ts", {
    "@/lib/mux/server": {
      createValidatedMuxContext: async () => ({ mux, environment }),
      isMuxNotFoundError: (e) => e?.status === 404,
    },
    "@/lib/supabase/admin": { createAdminClient: () => db },
  });
  return { module, writes, deleted };
}
test("portfolio namespace never accepts Learn or malformed IDs", () => {
  const { module: m } = harness();
  assert.equal(m.portfolioId("filmatta:portfolio:" + id), id);
  assert.equal(m.portfolioId("filmatta:lesson:" + id), null);
  assert.equal(m.portfolioId("filmatta:portfolio:invalid"), null);
});
test("canonical ready state and signed playback converge across repeated webhook events", async () => {
  const h = harness();
  await h.module.syncPortfolioAsset("asset");
  await h.module.syncPortfolioAsset("asset");
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[0].status, "ready");
  assert.equal(h.writes[0].mux_playback_id, "signed");
  assert.deepEqual(h.deleted, []);
});
test("wrong environment, upload or foreign passthrough cannot mutate or delete media", async () => {
  for (const patch of [
    { row: { mux_environment_id: "production" } },
    { row: { mux_upload_id: "foreign" } },
    { asset: { passthrough: "filmatta:lesson:" + id } },
  ]) {
    const h = harness(patch);
    await h.module.syncPortfolioAsset("asset");
    assert.equal(h.writes.length, 0);
    assert.equal(h.deleted.length, 0);
  }
});
test("public playback, ProRes and missing video are rejected before exposure and retained for review", async () => {
  for (const patch of [
    { asset: { playback_ids: [{ id: "public", policy: "public" }] } },
    { inputs: [{ file: { tracks: [{ type: "video", encoding: "prores" }] } }] },
    { inputs: [{ file: { tracks: [{ type: "audio", encoding: "aac" }] } }] },
  ]) {
    const h = harness(patch);
    await h.module.syncPortfolioAsset("asset");
    assert.equal(h.writes[0].status, "rejected");
    assert.equal(h.writes[0].mux_playback_id, null);
    assert.deepEqual(h.deleted, []);
  }
});
test("webhook races remain retryable; terminal deletion cannot resurrect playback", async () => {
  const race = harness({ race: true });
  await assert.rejects(race.module.syncPortfolioAsset("asset"), /Concurrent/);
  const early = harness({ row: { mux_upload_id: null } });
  await assert.rejects(early.module.syncPortfolioAsset("asset"), /binding/);
  const deleted = harness({ row: { status: "deleted" } });
  await deleted.module.syncPortfolioAsset("asset");
  assert.equal(deleted.writes.length, 0);
  assert.deepEqual(deleted.deleted, []);
});

test("cancelled and expired attempts cannot resurrect from late ready events", async () => {
  for (const reason of ["cancelled", "expired"]) {
    const h = harness({ row: { status: "errored", terminal_reason: reason } });
    await h.module.syncPortfolioAsset("asset");
    assert.equal(h.writes.length, 0);
    assert.equal(h.deleted.length, 0);
  }
});
test("real duration is attested without rounding; long video remains ready", async () => {
  for (const duration of [179.9, 180, 180.01, 900]) {
    const h = harness({ asset: { duration, aspect_ratio: "16:9" } });
    await h.module.syncPortfolioAsset("asset");
    assert.equal(h.writes[0].duration_seconds, duration);
    assert.equal(h.writes[0].status, "ready");
    assert.equal(h.deleted.length, 0);
  }
});
