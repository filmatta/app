import assert from "node:assert/strict";
import { test } from "node:test";
import load from "./load.mjs";

const development = { id: "env-development-fixture", type: "development" };
const production = { id: "env-production-fixture", type: "production" };

function video(policy, environment = development) {
  return {
    status: "ready",
    playback_policy: policy,
    mux_playback_id: "playback-fixture",
    mux_environment_id: environment?.id ?? null,
    mux_environment_type: environment?.type ?? null,
  };
}

function playbackFor(environment, env = {}) {
  let tokenCalls = 0;
  const mux = {
    jwt: {
      async signPlaybackId(_playbackId, options) {
        tokenCalls++;
        return `${options.type}-token`;
      },
    },
  };
  const playback = load(
    "lib/mux/playback.ts",
    {
      "./server": {
        createValidatedMuxContext: async () => ({ mux, environment }),
      },
    },
    env,
  );
  return { playback, tokenCalls: () => tokenCalls };
}

test("signed playback produces no token when the environment guard fails", async () => {
  const playback = load(
    "lib/mux/playback.ts",
    {
      "./server": {
        createValidatedMuxContext: async () => {
          throw new Error("environment mismatch fixture");
        },
      },
    },
    {
      MUX_SIGNING_KEY: "signing-key-fixture",
      MUX_PRIVATE_KEY: "private-key-fixture",
    },
  );

  await assert.rejects(
    playback.presentVideo(video("signed")),
    /environment mismatch/,
  );
});

test("Preview accepts Development provenance for public and signed playback", async () => {
  const fixture = playbackFor(development, {
    MUX_SIGNING_KEY: "signing-key-fixture",
    MUX_PRIVATE_KEY: "private-key-fixture",
  });

  const publicResult = await fixture.playback.presentVideo(video("public"));
  assert.equal(publicResult.playbackId, "playback-fixture");
  assert.equal(fixture.tokenCalls(), 0);

  const signedResult = await fixture.playback.presentVideo(video("signed"));
  assert.equal(signedResult.playbackId, "playback-fixture");
  assert.equal(signedResult.tokens.playback, "video-token");
  assert.equal(fixture.tokenCalls(), 3);
});

test("Preview rejects Production provenance for public and signed playback", async () => {
  const fixture = playbackFor(development, {
    MUX_SIGNING_KEY: "signing-key-fixture",
    MUX_PRIVATE_KEY: "private-key-fixture",
  });

  await assert.rejects(
    fixture.playback.presentVideo(video("public", production)),
    /unexpected environment/,
  );
  await assert.rejects(
    fixture.playback.presentVideo(video("signed", production)),
    /unexpected environment/,
  );
  assert.equal(fixture.tokenCalls(), 0);
});

test("Production accepts Production provenance", async () => {
  const fixture = playbackFor(production, {
    MUX_SIGNING_KEY: "signing-key-fixture",
    MUX_PRIVATE_KEY: "private-key-fixture",
  });
  const result = await fixture.playback.presentVideo(
    video("signed", production),
  );
  assert.equal(result.tokens.playback, "video-token");
});

test("Production rejects Development provenance for public and signed playback", async () => {
  const fixture = playbackFor(production, {
    MUX_SIGNING_KEY: "signing-key-fixture",
    MUX_PRIVATE_KEY: "private-key-fixture",
  });

  await assert.rejects(
    fixture.playback.presentVideo(video("public", development)),
    /unexpected environment/,
  );
  await assert.rejects(
    fixture.playback.presentVideo(video("signed", development)),
    /unexpected environment/,
  );
  assert.equal(fixture.tokenCalls(), 0);
});

test("missing provenance fails closed for public, signed and poster paths", async () => {
  const fixture = playbackFor(development, {
    MUX_SIGNING_KEY: "signing-key-fixture",
    MUX_PRIVATE_KEY: "private-key-fixture",
  });

  await assert.rejects(
    fixture.playback.presentVideo(video("public", null)),
    /unexpected environment/,
  );
  await assert.rejects(
    fixture.playback.presentVideo(video("signed", null)),
    /unexpected environment/,
  );
  await assert.rejects(
    fixture.playback.presentVideoPoster(video("public", null)),
    /unexpected environment/,
  );
  assert.equal(fixture.tokenCalls(), 0);
});
