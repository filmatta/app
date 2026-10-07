import assert from "node:assert/strict";
import { test } from "node:test";
import { writerPulseVisualPath } from "../../lib/writer/narrative-pulse-visual-path.ts";

function segments(path: string) {
  return [...path.matchAll(/C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/gu)]
    .map((match) => match.slice(1).map(Number));
}

function cubic(start: number, first: number, second: number, end: number, progress: number) {
  const remaining = 1 - progress;
  return remaining ** 3 * start + 3 * remaining ** 2 * progress * first
    + 3 * remaining * progress ** 2 * second + progress ** 3 * end;
}

test("visual spline passes through every original point without changing source coordinates", () => {
  const points = [
    { x: 24, y: 160, rawIntensity: 18, displayIntensity: 20 },
    { x: 112.125, y: 52.75, rawIntensity: 76, displayIntensity: 78 },
    { x: 200.25, y: 52.75, rawIntensity: 77, displayIntensity: 78 },
    { x: 288.375, y: 190, rawIntensity: 8, displayIntensity: 9 },
    { x: 376.5, y: 30, rawIntensity: 92, displayIntensity: 94 },
  ];
  const before = structuredClone(points);
  const path = writerPulseVisualPath(points);
  const commands = segments(path);
  assert.equal(commands.length, points.length - 1);
  assert.ok(path.startsWith(`M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`));
  for (let index = 0; index < commands.length; index += 1) {
    assert.equal(commands[index][4], Number(points[index + 1].x.toFixed(2)));
    assert.equal(commands[index][5], Number(points[index + 1].y.toFixed(2)));
  }
  assert.deepEqual(points, before);
});

test("visual spline has no invented peak or valley between neighboring scenes", () => {
  const intensities = [18, 21, 83, 83, 12, 96, 38, 37, 74, 9, 9, 58];
  for (const width of [390, 1440]) {
    const points = intensities.map((intensity, index) => ({
      x: 24 + index * (width - 48) / (intensities.length - 1),
      y: 24 + (1 - intensity / 100) * 182,
    }));
    const commands = segments(writerPulseVisualPath(points));
    assert.equal(commands.length, points.length - 1);
    for (let index = 0; index < commands.length; index += 1) {
      const [firstX, firstY, secondX, secondY, endX, endY] = commands[index];
      const from = { x: Number(points[index].x.toFixed(2)), y: Number(points[index].y.toFixed(2)) };
      const to = { x: Number(points[index + 1].x.toFixed(2)), y: Number(points[index + 1].y.toFixed(2)) };
      assert.equal(endX, Number(to.x.toFixed(2)));
      assert.equal(endY, Number(to.y.toFixed(2)));
      let previousY = from.y;
      for (let step = 0; step <= 100; step += 1) {
        const progress = step / 100;
        const x = cubic(from.x, firstX, secondX, endX, progress);
        const y = cubic(from.y, firstY, secondY, endY, progress);
        assert.ok(x >= from.x - 0.0001 && x <= to.x + 0.0001);
        assert.ok(y >= Math.min(from.y, to.y) - 0.0001 && y <= Math.max(from.y, to.y) + 0.0001);
        if (to.y >= from.y) assert.ok(y >= previousY - 0.0001);
        else assert.ok(y <= previousY + 0.0001);
        previousY = y;
      }
    }
  }
});

test("empty, single-point and invalid x geometry stay safe", () => {
  assert.equal(writerPulseVisualPath([]), "");
  assert.equal(writerPulseVisualPath([{ x: 24, y: 80 }]), "M24.00,80.00");
  assert.equal(writerPulseVisualPath([{ x: 24, y: 80 }, { x: 24, y: 40 }]), "M24.00,80.00 L24.00,40.00");
});
