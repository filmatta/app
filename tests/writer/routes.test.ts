import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { writerTimelineHref } from "../../lib/writer/routes.ts";

test("Timeline access targets the current Writer document", () => {
  const documentId = "77b4941d-6d7f-4aad-a243-77795953b292";
  assert.equal(writerTimelineHref(documentId), `/writer/${documentId}/timeline`);
});

test("Editor Timeline links use the authorized current script id in the same tab", async () => {
  const workspace = await readFile("components/writer/WriterWorkspace.tsx", "utf8");
  assert.equal(workspace.match(/href=\{writerTimelineHref\(script\.id\)\}/g)?.length, 2);
  assert.doesNotMatch(workspace, /writer-timeline-(?:link|mobile-link)[^>]+target=/);
});
