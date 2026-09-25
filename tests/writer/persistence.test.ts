import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyWriterDocument } from "../../lib/writer/document.ts";
import {
  WriterPersistenceController,
  type RemoteSaveRequest,
  type RemoteSaveResult,
  type WriterPersistenceState,
} from "../../lib/writer/persistence.ts";

const snapshot = () => ({ title: "Prueba", document: createEmptyWriterDocument(), schemaVersion: 1 });

test("a late acknowledgement confirms only its own snapshot and then saves the queued latest one", async () => {
  const requests: RemoteSaveRequest[] = [];
  const resolvers: Array<(value: RemoteSaveResult) => void> = [];
  const states: WriterPersistenceState[] = [];
  const controller = new WriterPersistenceController({
    origin: "https://test.invalid",
    userId: crypto.randomUUID(),
    scriptId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    initialSnapshot: snapshot(),
    initialRevision: 1,
    saveLocal: async () => {},
    saveRemote: async (request) => {
      requests.push(request);
      return await new Promise((resolve) => resolvers.push(resolve));
    },
    onState: (state) => states.push(state),
  });
  controller.markChanged({ ...snapshot(), title: "Uno" });
  const first = controller.flush();
  await waitFor(() => requests.length === 1);
  controller.markChanged({ ...snapshot(), title: "Dos" });
  assert.equal(requests.length, 1);
  resolvers[0]({ status: "saved", revision: 2 });
  await first;
  await waitFor(() => requests.length === 2);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].title, "Dos");
  assert.equal(requests[1].expectedRevision, 2);
  assert.notEqual(states.at(-1)?.status, "cloud");
  resolvers[1]({ status: "saved", revision: 3 });
  await waitFor(() => states.at(-1)?.status === "cloud");
  assert.equal(states.at(-1)?.status, "cloud");
  await controller.destroy();
});

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for test condition");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("a retryable timeout reuses the same operation id before sending newer work", async () => {
  const requests: RemoteSaveRequest[] = [];
  let attempt = 0;
  const controller = new WriterPersistenceController({
    origin: "https://test.invalid",
    userId: crypto.randomUUID(),
    scriptId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    initialSnapshot: snapshot(),
    initialRevision: 4,
    saveLocal: async () => {},
    saveRemote: async (request) => {
      requests.push(request);
      attempt += 1;
      return attempt === 1 ? { status: "retryable" } : { status: "saved", revision: 5 };
    },
    onState: () => {},
  });
  controller.markChanged({ ...snapshot(), title: "Pendiente" });
  await controller.flush();
  await controller.flush();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].operationId, requests[1].operationId);
  assert.equal(controller.getRevision(), 5);
  await controller.destroy();
});

test("a revision conflict pauses remote writes while retaining the local snapshot", async () => {
  const states: WriterPersistenceState[] = [];
  const controller = new WriterPersistenceController({
    origin: "https://test.invalid",
    userId: crypto.randomUUID(),
    scriptId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    initialSnapshot: snapshot(),
    initialRevision: 2,
    saveLocal: async () => {},
    saveRemote: async () => ({ status: "conflict" }),
    onState: (state) => states.push(state),
  });
  controller.markChanged({ ...snapshot(), title: "Mi versión" });
  await controller.flush();
  assert.equal(states.at(-1)?.status, "conflict");
  assert.equal(controller.getSnapshot().title, "Mi versión");
  await controller.destroy();
});
