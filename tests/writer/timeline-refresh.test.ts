import assert from "node:assert/strict";
import test from "node:test";
import { TimelineRefreshCoordinator } from "../../lib/writer/timeline-refresh.ts";

test("confirmed revisions coalesce while a Timeline refresh is in flight", async () => {
  let calls = 0;
  let release: (() => void) | null = null;
  const coordinator = new TimelineRefreshCoordinator(async () => {
    calls += 1;
    if (calls === 1) await new Promise<void>((resolve) => { release = resolve; });
  });
  coordinator.request();
  coordinator.request();
  coordinator.request();
  await Promise.resolve();
  assert.equal(calls, 1);
  (release as (() => void) | null)?.();
  await coordinator.whenIdle();
  assert.equal(calls, 2);
});

test("closed Timeline ignores refresh requests and stops queued work", async () => {
  let calls = 0;
  let release: (() => void) | null = null;
  const coordinator = new TimelineRefreshCoordinator(async () => {
    calls += 1;
    await new Promise<void>((resolve) => { release = resolve; });
  });
  coordinator.request();
  coordinator.request();
  coordinator.setActive(false);
  (release as (() => void) | null)?.();
  await coordinator.whenIdle();
  coordinator.request();
  assert.equal(calls, 1);
});

test("refresh work is read-only and does not schedule saves", async () => {
  let refreshes = 0;
  let saves = 0;
  const coordinator = new TimelineRefreshCoordinator(async () => { refreshes += 1; });
  coordinator.request();
  await coordinator.whenIdle();
  assert.equal(refreshes, 1);
  assert.equal(saves, 0);
  saves += 1;
  assert.equal(saves, 1);
  assert.equal(refreshes, 1);
});
