import test from "node:test";
import assert from "node:assert/strict";
import load from "../load.mjs";
const f = load("lib/tools/formulas.ts");
test("remote QA reference cases: 25fps/90 degrees, 50Mbps/10min, portrait and 35mm/2x", () => {
  assert.equal(f.angleToExposure(25, 90).denominator, 100);
  assert.equal(f.exposureToAngle(25, 100).angle, 90);
  assert.equal(f.storageEstimate(50, 10, 20).plannedGb, 4.5);
  assert.equal(f.dimensionFromAspect(1080, 9, 16, "width").height, 1920);
  assert.deepEqual(
    { ...f.aspectFromDimensions(1080, 1920) },
    {
      numerator: 9,
      denominator: 16,
      decimal: 0.5625,
    },
  );
  assert.equal(f.focalFromCrop(35, 2).equivalentMm, 70);
  assert.equal(f.focalFromSensor(35, 36, 24).equivalentMm, 35);
});
