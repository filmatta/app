import assert from "node:assert/strict";
import { test } from "node:test";
import load from "./load.mjs";

function loadRoute({ event, signatureError = null }) {
  const calls = {
    environment: 0,
    uploadRetrieve: 0,
    syncUpload: 0,
  };
  const mux = {
    webhooks: {
      unwrap: async () => {
        if (signatureError) throw signatureError;
        return event;
      },
    },
    video: {
      uploads: {
        retrieve: async (id) => {
          calls.uploadRetrieve++;
          return { id, status: "asset_created", asset_id: "asset-fixture" };
        },
      },
      assets: {
        retrieve: async (id) => ({ id, status: "ready" }),
      },
    },
  };
  const route = load(
    "app/api/mux/webhooks/route.ts",
    {
      "@/lib/mux/server": { createMuxClient: () => mux },
      "@/lib/mux/environment": {
        getMuxEnvironmentExpectation: () => ({
          id: "env-production-fixture",
          type: "production",
        }),
        assertMuxEnvironment: async () => {
          calls.environment++;
        },
      },
      "@/lib/mux/sync-asset": {
        syncMuxAsset: async () => ({ outcome: "updated" }),
        syncMuxUpload: async () => {
          calls.syncUpload++;
          return { outcome: "updated" };
        },
      },
      "@/lib/supabase/admin": { createAdminClient: () => ({}) },
    },
    { MUX_WEBHOOK_SECRET: "webhook-secret-fixture" },
  );
  return { ...route, calls };
}

function request() {
  return new Request("https://example.test/api/mux/webhooks", {
    method: "POST",
    body: "fixture-body",
  });
}

test("webhook rejects an invalid signature before environment validation", async () => {
  const route = loadRoute({
    event: null,
    signatureError: new Error("invalid signature fixture"),
  });
  const response = await route.POST(request());
  assert.equal(response.status, 400);
  assert.equal(route.calls.environment, 0);
  assert.equal(route.calls.syncUpload, 0);
});

test("webhook rejects a valid event from another environment before processing", async () => {
  const route = loadRoute({
    event: {
      id: "event-fixture",
      type: "video.upload.asset_created",
      environment: { id: "env-other-fixture" },
      data: { id: "upload-fixture" },
    },
  });
  const response = await route.POST(request());
  assert.equal(response.status, 403);
  assert.equal(route.calls.environment, 0);
  assert.equal(route.calls.uploadRetrieve, 0);
  assert.equal(route.calls.syncUpload, 0);
});

test("webhook processes a signed event only after environment validation", async () => {
  const route = loadRoute({
    event: {
      id: "event-fixture",
      type: "video.upload.asset_created",
      environment: { id: "env-production-fixture" },
      data: { id: "upload-fixture" },
    },
  });
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  assert.equal(route.calls.environment, 1);
  assert.equal(route.calls.uploadRetrieve, 1);
  assert.equal(route.calls.syncUpload, 1);
});
