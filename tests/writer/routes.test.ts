import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { writerDocumentHref, writerTimelineHref } from "../../lib/writer/routes.ts";

test("Timeline access targets the current Writer document", () => {
  const documentId = "77b4941d-6d7f-4aad-a243-77795953b292";
  assert.equal(writerTimelineHref(documentId), `/writer/${documentId}/timeline`);
  assert.equal(writerDocumentHref(documentId), `/writer/${documentId}`);
  assert.equal(writerDocumentHref(documentId, "scene/id"), `/writer/${documentId}?scene=scene%2Fid`);
});

test("Editor exposes one integrated Timeline control without opening another tab", async () => {
  const workspace = await readFile("components/writer/WriterWorkspace.tsx", "utf8");
  assert.equal(workspace.match(/>Timeline<\/button>/g)?.length, 1);
  assert.match(workspace, /<WriterTimelineView/);
  assert.doesNotMatch(workspace, /writer-timeline-(?:button|panel)[^>]+target=/);
});
