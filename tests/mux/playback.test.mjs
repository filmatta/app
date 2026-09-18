import assert from "node:assert/strict";
import { test } from "node:test";
import load from "./load.mjs";

const signedVideo = {
  status: "ready",
  playback_policy: "signed",
  mux_playback_id: "playback-fixture",
};

test("signed playback produces no token when the environment guard fails", async () => {
  const playback = load(
    "lib/mux/playback.ts",
    {
      "./server": {
        createValidatedMuxClient: async () => {
          throw new Error("environment mismatch fixture");
        },
      },
    },
    {
      MUX_SIGNING_KEY: "signing-key-fixture",
      MUX_PRIVATE_KEY: "private-key-fixture",
    },
  );

  await assert.rejects(playback.presentVideo(signedVideo), /environment mismatch/);
});

test("public preview playback does not require signing or call the environment guard", async () => {
  let guardCalls = 0;
  const playback = load("lib/mux/playback.ts", {
    "./server": {
      createValidatedMuxClient: async () => {
        guardCalls++;
        throw new Error("guard should not run for public playback");
      },
    },
  });

  const result = await playback.presentVideo({
    ...signedVideo,
    playback_policy: "public",
  });
  assert.equal(result.playbackId, "playback-fixture");
  assert.equal(guardCalls, 0);
});
