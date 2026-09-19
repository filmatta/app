import assert from "node:assert/strict";
import { test } from "node:test";
import load from "./load.mjs";

const { syncMuxAsset } = load("lib/mux/sync-asset.ts");
const lessonId = "00000000-0000-4000-8000-000000000001";
const videoId = "00000000-0000-4000-8000-000000000002";
const development = { id: "kospfo", type: "development" };

function asset() {
  return {
    id: "asset-development",
    upload_id: "upload-development",
    passthrough: `filmatta:lesson:${lessonId}:${videoId}`,
    meta: { external_id: lessonId },
    playback_ids: [{ id: "playback-development", policy: "signed" }],
    status: "ready",
    duration: 30,
    created_at: "1",
  };
}

function supabaseFixture(video) {
  const writes = [];
  return {
    writes,
    client: {
      from(table) {
        return {
          select() {
            const query = {
              eq() {
                return query;
              },
              async maybeSingle() {
                return { data: video, error: null };
              },
            };
            return query;
          },
          update(values) {
            writes.push([table, values]);
            if (table === "course_lessons") {
              return {
                async eq() {
                  return { error: null };
                },
              };
            }
            const query = {
              eq() {
                return query;
              },
              async select() {
                return { data: [{ id: video.id }], error: null };
              },
            };
            return query;
          },
        };
      },
    },
  };
}

test("validated synchronization safely backfills legacy Development provenance", async () => {
  const fixture = supabaseFixture({
    id: videoId,
    lesson_id: lessonId,
    mux_asset_id: "asset-development",
    playback_policy: "signed",
    status: "ready",
    updated_at: "2026-09-18T00:00:00.000Z",
    created_at: "2026-09-17T00:00:00.000Z",
    mux_environment_id: null,
    mux_environment_type: null,
  });

  const result = await syncMuxAsset(
    fixture.client,
    asset(),
    development,
  );
  assert.equal(result.outcome, "updated");
  const videoWrite = fixture.writes.find(([table]) => table === "lesson_videos");
  assert.equal(videoWrite[1].mux_environment_id, "kospfo");
  assert.equal(videoWrite[1].mux_environment_type, "development");
});

test("known cross-environment rows are rejected before any write", async () => {
  const fixture = supabaseFixture({
    id: videoId,
    lesson_id: lessonId,
    mux_asset_id: "asset-development",
    playback_policy: "signed",
    status: "ready",
    updated_at: "2026-09-18T00:00:00.000Z",
    created_at: "2026-09-17T00:00:00.000Z",
    mux_environment_id: "production-environment",
    mux_environment_type: "production",
  });

  const result = await syncMuxAsset(
    fixture.client,
    asset(),
    development,
  );
  assert.equal(result.outcome, "skipped");
  assert.equal(result.reason, "wrong-environment");
  assert.equal(fixture.writes.length, 0);
});
