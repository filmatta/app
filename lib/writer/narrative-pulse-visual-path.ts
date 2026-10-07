type PlotCoordinate = { x: number; y: number };

// Shape-preserving cubic interpolation changes only the SVG stroke, never the plotted points.
export function writerPulseVisualPath(points: ReadonlyArray<PlotCoordinate>): string {
  if (!points.length) return "";
  const vertex = (value: number) => value.toFixed(2);
  const handle = (value: number) => value.toFixed(4);
  const start = `M${vertex(points[0].x)},${vertex(points[0].y)}`;
  if (points.length === 1) return start;

  // Match the exact two-decimal vertices of the previous straight-line SVG path.
  const visualPoints = points.map((point) => ({ x: Number(vertex(point.x)), y: Number(vertex(point.y)) }));
  const gaps = visualPoints.slice(1).map((point, index) => point.x - visualPoints[index].x);
  if (gaps.some((gap) => gap <= 0)) {
    return points.map((point, index) => `${index ? "L" : "M"}${vertex(point.x)},${vertex(point.y)}`).join(" ");
  }

  const secants = gaps.map((gap, index) => (visualPoints[index + 1].y - visualPoints[index].y) / gap);
  const slopes = new Array<number>(points.length).fill(0);
  slopes[0] = secants[0];
  slopes[points.length - 1] = secants.at(-1)!;
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = secants[index - 1];
    const after = secants[index];
    if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) continue;
    const left = gaps[index - 1];
    const right = gaps[index];
    const firstWeight = 2 * right + left;
    const secondWeight = right + 2 * left;
    slopes[index] = (firstWeight + secondWeight) / (firstWeight / before + secondWeight / after);
  }
  // Keep both Bézier handles ordered between neighboring values. Reducing a slope
  // also preserves the constraint already established for its previous segment.
  for (let index = 0; index < secants.length; index += 1) {
    const allowed = 3 * Math.abs(secants[index]);
    const combined = Math.abs(slopes[index]) + Math.abs(slopes[index + 1]);
    if (combined > allowed && combined > 0) {
      const scale = allowed / combined;
      slopes[index] *= scale;
      slopes[index + 1] *= scale;
    }
  }

  const segments = gaps.map((gap, index) => {
    const from = visualPoints[index];
    const to = visualPoints[index + 1];
    const lower = Math.min(from.y, to.y);
    const upper = Math.max(from.y, to.y);
    const clamp = (value: number) => Math.max(lower, Math.min(upper, value));
    const firstX = from.x + gap / 3;
    const firstY = clamp(from.y + slopes[index] * gap / 3);
    const secondX = to.x - gap / 3;
    const secondY = clamp(to.y - slopes[index + 1] * gap / 3);
    return `C${handle(firstX)},${handle(firstY)} ${handle(secondX)},${handle(secondY)} ${vertex(to.x)},${vertex(to.y)}`;
  });
  return `${start} ${segments.join(" ")}`;
}
