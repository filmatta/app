import assert from "node:assert/strict";
import test from "node:test";
import { StoryboardSaveCoordinator } from "../../lib/storyboard/save-queue.ts";

test("save queue serializes requests and keeps only the newest unsent draft", async () => {
  const calls: Array<{ value: string; expectedRevisionId: string }> = [];
  let releaseFirst: (() => void) | undefined;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const queue = new StoryboardSaveCoordinator<string>("r1", async (input) => {
    calls.push({ value: input.value, expectedRevisionId: input.expectedRevisionId });
    if (calls.length === 1) await firstGate;
    return { revisionId: `r${calls.length + 1}`, revisionNumber: calls.length + 1, noOp: false };
  }, () => undefined, 60_000, 60_000);
  queue.enqueue("A");
  const flush = queue.flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  queue.enqueue("B");
  queue.enqueue("C");
  releaseFirst?.();
  await flush;
  assert.deepEqual(calls, [
    { value: "A", expectedRevisionId: "r1" },
    { value: "C", expectedRevisionId: "r2" },
  ]);
  assert.equal(queue.revisionId, "r3");
});

test("failed save preserves the draft for an explicit retry", async () => {
  let failures = 1;
  const states: string[] = [];
  const queue = new StoryboardSaveCoordinator<string>("r1", async () => {
    if (failures-- > 0) throw new Error("network");
    return { revisionId: "r2", revisionNumber: 2, noOp: false };
  }, (state) => states.push(state), 60_000, 60_000);
  queue.enqueue("draft");
  await assert.rejects(queue.flush(), /network/u);
  assert.equal(queue.hasPending, true);
  await queue.flush();
  assert.equal(queue.hasPending, false);
  assert.deepEqual(states, ["saving", "error", "saved"]);
});
