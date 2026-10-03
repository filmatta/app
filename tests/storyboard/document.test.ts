import assert from "node:assert/strict";
import test from "node:test";
import {
  stableStringify,
  storyboardContentKind,
  validateStoryboardDocument,
} from "../../lib/storyboard/document.ts";
import { emptyStoryboardDocument } from "../../lib/storyboard/types.ts";

test("the editable document validates independently from Konva", () => {
  const document = emptyStoryboardDocument();
  document.objects.push({
    id: "11111111-1111-4111-8111-111111111111",
    type: "stroke",
    color: "#ffffff",
    opacity: 1,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    width: 8,
    points: [{ x: 20, y: 30 }, { x: 90, y: 120, pressure: 0.5 }],
  });
  const result = validateStoryboardDocument(document);
  assert.equal(result.ok, true);
  assert.equal(storyboardContentKind(document), "drawing");
  assert.doesNotMatch(JSON.stringify(document), /konva|signed|data:image/iu);
});

test("content state keeps reference and drawing orthogonal", () => {
  const document = emptyStoryboardDocument();
  document.reference = {
    assetId: "22222222-2222-4222-8222-222222222222",
    x: 0,
    y: 0,
    width: 1600,
    height: 900,
    rotation: 0,
    opacity: 1,
  };
  assert.equal(storyboardContentKind(document), "reference");
  document.objects.push({
    id: "33333333-3333-4333-8333-333333333333",
    type: "rectangle",
    color: "#e63b46",
    opacity: 1,
    x: 100,
    y: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    width: 300,
    height: 200,
    strokeWidth: 8,
    fill: null,
  });
  assert.equal(storyboardContentKind(document), "mixed");
});

test("invalid and oversized objects are rejected without truncation", () => {
  const document = emptyStoryboardDocument() as unknown as Record<string, unknown>;
  document.objects = [{
    id: "not-an-id",
    type: "text",
    text: "x".repeat(1001),
  }];
  const result = validateStoryboardDocument(document);
  assert.equal(result.ok, false);
  assert.match(result.reason, /objeto|texto|anotación/iu);
});

test("canonical serialization is stable across key order", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
});
