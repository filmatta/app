import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import load from "./load.mjs";

const provenance = load("lib/mux/provenance.ts");
const videoActions = fs.readFileSync(
  "app/admin/cursos/video-actions.ts",
  "utf8",
);
const syncAsset = fs.readFileSync("lib/mux/sync-asset.ts", "utf8");
const lessonPage = fs.readFileSync(
  "app/cursos/[slug]/lecciones/[lessonSlug]/page.tsx",
  "utf8",
);

test("environment provenance requires an exact ID and type match", () => {
  const expected = { id: "kospfo", type: "development" };
  assert.equal(
    provenance.muxEnvironmentMatches(
      {
        mux_environment_id: "kospfo",
        mux_environment_type: "development",
      },
      expected,
    ),
    true,
  );
  for (const row of [
    { mux_environment_id: null, mux_environment_type: null },
    { mux_environment_id: "other", mux_environment_type: "development" },
    { mux_environment_id: "kospfo", mux_environment_type: "production" },
  ]) {
    assert.equal(provenance.muxEnvironmentMatches(row, expected), false);
  }
});

test("environment provenance is server-derived and cannot be supplied by the upload client", () => {
  assert.doesNotMatch(
    videoActions,
    /formData\.get\(["']mux_environment_(?:id|type)["']\)/,
  );
  assert.match(videoActions, /createValidatedMuxContext\(\)/);
  assert.match(videoActions, /mux_environment_id: muxEnvironment\.id/);
  assert.match(videoActions, /mux_environment_type: muxEnvironment\.type/);
});

test("Mux synchronization persists validated provenance and rejects a known mismatch", () => {
  assert.match(syncAsset, /hasMuxEnvironmentProvenance\(video\)/);
  assert.match(syncAsset, /!muxEnvironmentMatches\(video, environment\)/);
  assert.match(syncAsset, /reason: "wrong-environment"/);
  assert.match(syncAsset, /mux_environment_id: environment\.id/);
  assert.match(syncAsset, /mux_environment_type: environment\.type/);
});

test("lesson playback reads provenance for both player and poster paths", () => {
  assert.equal(
    (lessonPage.match(/mux_environment_id, mux_environment_type/g) ?? []).length,
    2,
  );
});
