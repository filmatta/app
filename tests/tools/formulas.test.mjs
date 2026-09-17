import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import load from "../load.mjs";
const f = load("lib/tools/formulas.ts");
const near = (a, b) =>
  assert.ok(
    Math.abs(a - b) <= Math.max(1, Math.abs(b)) * 1e-10,
    `${a} vs ${b}`,
  );
test("180 degrees at 24fps is 1/48s and reverse uses recording fps", () => {
  near(f.angleToExposure(24, 180).seconds, 1 / 48);
  near(f.exposureToAngle(24, 48).angle, 180);
  near(f.angleToExposure(24000 / 1001, 180).denominator, 48000 / 1001);
  near(f.angleToExposure(25, 360).seconds, 1 / 25);
  for (const fps of [0.001, 24, 24000 / 1001, 120, 10000])
    for (const angle of [0.01, 90, 180, 360])
      near(
        f.exposureToAngle(fps, f.angleToExposure(fps, angle).denominator).angle,
        angle,
      );
});
test("exposure validates zero, nonfinite, maximum angle and frame duration", () => {
  for (const v of [NaN, Infinity, -1, 0]) {
    assert.throws(() => f.angleToExposure(v, 180));
    assert.throws(() => f.angleToExposure(24, v));
    assert.throws(() => f.exposureToAngle(24, v));
  }
  assert.throws(() => f.angleToExposure(24, 360.01));
  assert.throws(() => f.exposureToAngle(24, 23));
  assert.throws(() => f.angleToExposure(10001, 180));
  assert.throws(() => f.exposureToAngle(0.001, 1e9));
  near(f.angleToExposure(10000, 0.001).denominator, 3.6e9);
});
test("storage distinguishes bits, bytes, decimal GB, binary GiB and margin", () => {
  const r = f.storageEstimate(100, 60, 20);
  assert.equal(r.bytes, 45000000000);
  assert.equal(r.gb, 45);
  near(r.gib, 41.90951585769653);
  assert.equal(r.plannedGb, 54);
  assert.equal(f.storageEstimate(100, 0).gb, 0);
  near(f.storageEstimate(8, 1 / 60).bytes, 1000000);
  for (const v of [NaN, Infinity, 0, -1, 100001])
    assert.throws(() => f.storageEstimate(v, 60));
  for (const v of [-1, 10081, NaN])
    assert.throws(() => f.storageEstimate(100, v));
  for (const v of [-1, 101, Infinity])
    assert.throws(() => f.storageEstimate(100, 60, v));
  assert.ok(Number.isFinite(f.storageEstimate(100000, 10080, 100).plannedGb));
});
test("aspect ratio supports portrait, square and dimension rounding without pretending codec compliance", () => {
  const r = f.aspectFromDimensions(1920, 1080);
  assert.equal(r.numerator, 16);
  assert.equal(r.denominator, 9);
  assert.equal(f.aspectFromDimensions(1080, 1920).decimal, 9 / 16);
  assert.equal(f.aspectFromDimensions(1, 1).decimal, 1);
  assert.equal(f.dimensionFromAspect(1920, 16, 9, "width").height, 1080);
  assert.equal(f.dimensionFromAspect(1080, 16, 9, "height").width, 1920);
  assert.equal(f.dimensionFromAspect(1920, 2.39, 1, "width").pixels, 803);
  for (const [w, h] of [
    [0, 1],
    [1, 0],
    [1.5, 2],
    [Infinity, 2],
    [131073, 1],
  ])
    assert.throws(() => f.aspectFromDimensions(w, h));
  assert.throws(() => f.dimensionFromAspect(1920, 0, 9, "width"));
  assert.throws(() => f.dimensionFromAspect(131072, 0.001, 10000, "width"));
  assert.throws(() => f.dimensionFromAspect(1, 10000, 0.001, "width"));
  assert.equal(f.aspectFromDimensions(131072, 131072).numerator, 1);
});
test("full-frame equivalence uses diagonal and preserves physical focal as input", () => {
  assert.equal(f.focalFromCrop(50, 1.5).equivalentMm, 75);
  near(f.focalFromSensor(50, 36, 24).crop, 1);
  near(f.focalFromSensor(50, 24, 16).equivalentMm, 75);
  near(f.focalFromSensor(50, 16, 24).equivalentMm, 75);
  assert.ok(f.focalFromSensor(50, 44, 33).crop < 1);
  near(
    f.focalFromSensor(50, 36, 20.25).crop,
    Math.hypot(36, 24) / Math.hypot(36, 20.25),
  );
  for (const v of [0, -1, Infinity, NaN, 10001])
    assert.throws(() => f.focalFromCrop(v, 1.5));
  for (const v of [0, -1, Infinity, 101])
    assert.throws(() => f.focalFromCrop(50, v));
  for (const v of [0, NaN, 1001])
    assert.throws(() => f.focalFromSensor(50, v, 24));
});
test("typed Tools registry exposes four implemented utilities and honest product states", () => {
  const { tools, getUtility } = load("lib/tools/registry.ts");
  assert.equal(new Set(tools.map((t) => t.slug)).size, tools.length);
  assert.equal(tools.filter((t) => t.status === "available").length, 4);
  for (const t of tools) {
    assert.equal(t.access, "public");
    if (t.utility) assert.ok(getUtility(t.slug));
    else {
      assert.equal(t.status, "in-development");
      assert.ok(fs.existsSync(`app${t.href}/page.tsx`));
    }
  }
  assert.equal(getUtility("__proto__"), undefined);
});

test("bitrate units preserve storage and decimal output selects MB, GB, TB at boundaries", () => {
  near(f.bitrateToMbps(100000, "kbps"), 100);
  near(f.bitrateToMbps(0.1, "Gbps"), 100);
  for (const unit of ["kbps", "Mbps", "Gbps"]) {
    for (const value of [NaN, Infinity, 0, -1]) assert.throws(() => f.bitrateToMbps(value, unit));
  }
  assert.throws(() => f.bitrateToMbps(100, "MBps"));
  assert.throws(() => f.bitrateToMbps(100, "__proto__"));
  near(f.bitrateToMbps(0.000001, "Gbps"), 0.001);
  assert.equal(f.decimalStorage(0).unit, "MB");
  assert.equal(f.decimalStorage(1e6).value, 1);
  assert.equal(f.decimalStorage(1e9 - 1).unit, "MB");
  assert.equal(f.decimalStorage(1e9).unit, "GB");
  assert.equal(f.decimalStorage(1e12 - 1).unit, "GB");
  assert.equal(f.decimalStorage(1e12).unit, "TB");
  assert.equal(f.decimalStorage(1e12).value, 1);
  for (const value of [NaN, Infinity, -1]) assert.throws(() => f.decimalStorage(value));
});
