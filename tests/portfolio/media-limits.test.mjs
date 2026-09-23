import assert from "node:assert/strict";
import { test } from "node:test";
import load from "../load.mjs";

const limits = load("lib/profiles/media-limits.ts");

function item(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    category: "work",
    title: "Media",
    role: "DP",
    year: "2026",
    description: "",
    media_type: "video",
    source: "mux",
    url: "",
    provider: null,
    external_video_id: null,
    thumbnail_id: null,
    featured: false,
    sort_order: 0,
    visibility: "visible",
    status: "ready",
    created_at: "2026-09-23T00:00:00Z",
    updated_at: "2026-09-23T00:00:00Z",
    purpose: "portfolio",
    ...overrides,
  };
}

test("Free counters separate Reel, Videos and Book while counting pending, external and restorable archived media", () => {
  const items = [
    item({ category: "reel", source: "external" }),
    item(),
    item({ source: "external", status: "processing" }),
    ...Array.from({ length: 6 }, () =>
      item({ category: "book", media_type: "image", source: "storage" }),
    ),
    item({ category: "book", media_type: "image", visibility: "archived" }),
    item({
      category: "book",
      media_type: "image",
      visibility: "archived",
      status: "deleted",
    }),
    item({ category: "book", media_type: "image", purpose: "reel_cover" }),
  ];
  const counts = limits.getProfileMediaCounts(items);
  assert.equal(counts.reel, 1);
  assert.equal(counts.work, 2);
  assert.equal(counts.book, 7);
  assert.match(
    limits.profileMediaQuotaError({
      items,
      category: "reel",
      mediaType: "video",
    }),
    /1 Reel/,
  );
  assert.match(
    limits.profileMediaQuotaError({
      items,
      category: "work",
      mediaType: "video",
    }),
    /2 videos/,
  );
  assert.match(
    limits.profileMediaQuotaError({
      items,
      category: "book",
      mediaType: "image",
    }),
    /6 fotos/,
  );
});

test("archived restorable assets keep their slot while deleted historical rows do not", () => {
  const archived = item({ visibility: "archived" });
  const deleted = item({ visibility: "archived", status: "deleted" });
  assert.equal(limits.countsTowardProfileQuota(archived), true);
  assert.equal(limits.countsTowardProfileQuota(deleted), false);
});

test("editing metadata on an existing item does not require a new slot", () => {
  const items = [item({ category: "reel" })];
  assert.equal(
    limits.profileMediaQuotaError({
      items,
      category: "reel",
      mediaType: "video",
      editingExisting: true,
    }),
    null,
  );
});

test("historical over-limit content remains counted and only new additions are blocked", () => {
  const items = Array.from({ length: 8 }, () =>
    item({ category: "book", media_type: "image", source: "storage" }),
  );
  assert.equal(limits.getProfileMediaCounts(items).book, 8);
  assert.match(
    limits.profileMediaQuotaError({
      items,
      category: "book",
      mediaType: "image",
    }),
    /6 fotos/,
  );
});

test("video duration accepts 300 seconds and rejects 301 or unavailable metadata", () => {
  assert.equal(limits.validateVideoDuration(300), null);
  assert.match(limits.validateVideoDuration(301), /5 minutos/);
  assert.match(limits.validateVideoDuration(Number.NaN), /determinar/);
});
