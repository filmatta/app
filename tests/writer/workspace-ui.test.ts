import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  WRITER_TIMELINE_DESKTOP_QUERY,
  writerTimelineRestoresAfterFocus,
  writerTimelineStartsOpen,
} from "../../lib/writer/workspace-ui.ts";

test("Timeline starts open only on the desktop breakpoint", () => {
  assert.equal(WRITER_TIMELINE_DESKTOP_QUERY, "(min-width: 1024px)");
  assert.equal(writerTimelineStartsOpen(true), true);
  assert.equal(writerTimelineStartsOpen(false), false);
});

test("Focus restores only a previously open desktop Timeline", () => {
  assert.equal(writerTimelineRestoresAfterFocus(true, true), true);
  assert.equal(writerTimelineRestoresAfterFocus(false, true), false);
  assert.equal(writerTimelineRestoresAfterFocus(true, false), false);
});

test("Writer responsive controls keep actions reachable and native scrollbars scoped", () => {
  const css = fs.readFileSync("app/writer/writer.css", "utf8");
  assert.match(css, /\.writer-library-action-button/u);
  assert.match(css, /\.writer-import-actions\s*\{[^}]*flex-wrap:\s*wrap/u);
  assert.match(css, /\.writer-import-source textarea\s*\{[^}]*min-height/u);
  assert.match(css, /scrollbar-width:\s*thin/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.match(css, /\.writer-mobile-app-bar/u);
  assert.match(css, /\.writer-toolbar select\s*\{[^}]*min-width:\s*0/u);
  assert.match(css, /\.writer-context-menu--touch/u);
  assert.match(css, /\.writer-drag-preview/u);
  assert.doesNotMatch(css, /\.writer-toolbar\s*\{[^}]*overflow-x:\s*auto/u);
  assert.doesNotMatch(css, /scrollbar-width:\s*none/u);
});

test("the assisted rejection copy does not repeat the basic-import alternative", () => {
  const source = fs.readFileSync("components/writer/WriterImportFlow.tsx", "utf8");
  assert.match(source, /assistedImportError\(cause\)/u);
  assert.doesNotMatch(source, /`\$\{importError\(cause\)\} Puedes conservar/u);
});
