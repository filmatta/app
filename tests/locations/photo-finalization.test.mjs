import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import load from "../load.mjs";

const finalization = load("lib/locations/photo-finalization.ts");
const route = readFileSync("app/api/locations/photos/[id]/complete/route.ts", "utf8");
const proxy = readFileSync("proxy.ts", "utf8");
const uploader = readFileSync("components/locations/LocationPhotoManager.tsx", "utf8");

test("photo signature prefix does not wait on a cancelled response stream", async () => {
  let arrayBufferCalls = 0;
  const response = {
    async arrayBuffer() {
      arrayBufferCalls += 1;
      return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).buffer;
    },
    get body() {
      throw new Error("the response stream must not be opened or cancelled");
    },
  };
  const prefix = await finalization.readLocationPhotoPrefix(response, 4);
  assert.equal(arrayBufferCalls, 1);
  assert.deepEqual(Array.from(prefix), [0xff, 0xd8, 0xff, 0xe0]);
});

test("photo finalization has a bounded exit and reaches the route before session refresh", async () => {
  await assert.rejects(
    finalization.withLocationPhotoDeadline(new Promise(() => {}), 5),
    (error) => error.name === "LocationPhotoFinalizationTimeout",
  );
  assert.doesNotMatch(route, /reader\.cancel/);
  assert.match(route, /AbortSignal\.timeout\(LOCATION_PHOTO_FINALIZATION_TIMEOUT_MS\)/);
  assert.match(proxy, /api\\\/locations\\\/photos\\\/\[\^\/\]\+\\\/complete/);
  assert.match(route, /if \(row\.lifecycle_status === "ready"\) return Response\.json\(\{ ready: true \}\)/);
});

test("stored photos reconcile and retry finalization without another upload or reservation", () => {
  assert.match(uploader, /if \(!reservationId\)/);
  assert.match(uploader, /stored: preserve/);
  assert.match(uploader, /reconcileLocationPhoto/);
  assert.match(uploader, /Reintentar confirmación/);
  assert.match(uploader, /readyIds\.has\(item\.reservationId\)/);
  assert.match(uploader, /request\.timeout = 30_000/);
});
