import assert from "node:assert/strict";
import test from "node:test";
import { nearestCharacterAppearanceIndex, orderedCharacterAppearances } from "../../lib/writer/character-appearance-navigation.ts";

test("one compact navigator orders 1,000 appearances without rendering an appearance list", () => {
  const scenes = Array.from({ length: 20 }, (_, index) => `scene-${index}`);
  const source = Array.from({ length: 1_000 }, (_, index) => ({
    id: `appearance-${index}`,
    sceneId: scenes[index % scenes.length],
    blockId: `block-${String(index).padStart(4, "0")}`,
    start: index % 17,
  })).reverse();
  const ordered = orderedCharacterAppearances(source, scenes);
  assert.equal(ordered.length, 1_000);
  assert.equal(ordered[0].sceneId, scenes[0]);
  assert.equal(ordered.at(-1)?.sceneId, scenes.at(-1));
  const nearest = nearestCharacterAppearanceIndex(ordered, scenes[11], null, scenes);
  assert.equal(ordered[nearest].sceneId, scenes[11]);
});

test("selected block wins, boundaries remain deterministic and never wrap", () => {
  const scenes = ["one", "two", "three"];
  const ordered = orderedCharacterAppearances([
    { id: "c", sceneId: "three", blockId: "c", start: 0 },
    { id: "a", sceneId: "one", blockId: "a", start: 0 },
    { id: "b", sceneId: "two", blockId: "b", start: 0 },
  ], scenes);
  assert.deepEqual(ordered.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(nearestCharacterAppearanceIndex(ordered, "three", "a", scenes), 0);
  assert.equal(nearestCharacterAppearanceIndex(ordered, null, null, scenes), 0);
});
