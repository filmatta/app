import assert from "node:assert/strict";
import { test } from "node:test";
import load from "../load.mjs";
const m = load("lib/profiles/media.ts");
test("upload origin uses HTTP Host rather than Next internal URL and rejects cross-origin", () => {
  const p = load(
      "lib/profiles/request-origin.ts",
      {},
      { NODE_ENV: "production" },
    ),
    d = load("lib/profiles/request-origin.ts", {}, { NODE_ENV: "development" });
  const req = (origin, host) =>
    new Request("http://localhost:3106/api/portfolio/uploads", {
      headers: { origin, host },
    });
  assert.equal(
    d.portfolioRequestOrigin(req("http://127.0.0.1:3106", "127.0.0.1:3106")),
    "http://127.0.0.1:3106",
  );
  assert.equal(
    p.portfolioRequestOrigin(
      req("https://preview.vercel.app", "preview.vercel.app"),
    ),
    "https://preview.vercel.app",
  );
  assert.equal(
    p.portfolioRequestOrigin(req("https://evil.test", "preview.vercel.app")),
    null,
  );
  assert.equal(
    p.portfolioRequestOrigin(
      req("http://preview.vercel.app", "preview.vercel.app"),
    ),
    null,
  );
});
test("canonical providers preserve Vimeo privacy hash and reject hostile URLs", () => {
  assert.equal(
    m.externalVideo("https://youtu.be/abcdefghijk?autoplay=1").url,
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  assert.equal(
    m.externalVideo("https://player.vimeo.com/video/12345?h=abcdef").url,
    "https://vimeo.com/12345/abcdef",
  );
  for (const url of [
    "http://vimeo.com/123",
    "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "https://user:pass@vimeo.com/123",
    "https://vimeo.com:123/456",
    "javascript:alert(1)",
    '<iframe src="x">',
    "https://youtu.be/invalid",
  ])
    assert.equal(m.externalVideo(url), null, url);
});
test("declaration boundaries, MIME and extensions are validated without claiming Mux enforcement", () => {
  assert.equal(
    m.validateUploadDeclaration("video", {
      name: "reel.mp4",
      type: "video/mp4",
      size: 5_000_000_000,
    }),
    null,
  );
  assert.match(
    m.validateUploadDeclaration("video", {
      name: "reel.mp4",
      type: "video/mp4",
      size: 5_000_000_001,
    }),
    /YouTube o Vimeo/,
  );
  assert.equal(
    m.validateUploadDeclaration("image", {
      name: "photo.webp",
      type: "image/webp",
      size: 20_000_000,
    }),
    null,
  );
  assert.match(
    m.validateUploadDeclaration("image", {
      name: "photo.webp",
      type: "image/webp",
      size: 20_000_001,
    }),
    /20 MB/,
  );
  for (const size of [0, -1, NaN, Infinity, 1.1, "12"])
    assert.ok(
      m.validateUploadDeclaration("video", {
        name: "a.mp4",
        type: "video/mp4",
        size,
      }),
    );
  for (const [name, type] of [
    ["x.svg", "image/jpeg"],
    ["x.jpg", "image/svg+xml"],
    ["x.tiff", "image/tiff"],
    ["x.raw", "image/jpeg"],
    ["x.png", "image/jpeg"],
  ])
    assert.ok(m.validateUploadDeclaration("image", { name, type, size: 100 }));
});
test("work input validates role/category/provider and strips all caller-supplied authority", () => {
  const value = {
    category: "work",
    title: "Film",
    role: "DP",
    year: "2026",
    description: "Work",
    media_type: "video",
    source: "external",
    url: "https://youtu.be/abcdefghijk",
    featured: true,
    owner_id: "forged",
    mux_playback_id: "forged",
    status: "ready",
  };
  const parsed = m.parseMediaInput(value);
  assert.equal(parsed.url, "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(parsed.owner_id, undefined);
  assert.equal(parsed.mux_playback_id, undefined);
  assert.equal(parsed.status, undefined);
  for (const patch of [
    { role: "" },
    { year: "3000" },
    { category: "book" },
    { source: "storage" },
    { url: "https://evil.test/file" },
    { featured: "true" },
  ])
    assert.equal(m.parseMediaInput({ ...value, ...patch }), null);
});
