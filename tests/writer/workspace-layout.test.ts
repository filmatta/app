import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  WRITER_WORKSPACE_LAYOUT_DEFAULTS,
  clampWriterHorizontalPanelHeight,
  parseWriterWorkspaceLayout,
  migrateWriterWorkspaceLayout,
  writerWorkspaceLayoutStorageKey,
} from "../../lib/writer/workspace-layout.ts";

test("workspace layout parses visibility and bounded independent heights", () => {
  assert.deepEqual(parseWriterWorkspaceLayout('{"leftSidebarVisible":false,"rightSidebarVisible":true,"timelineHeight":340,"charactersHeight":190}'), {
    leftSidebarVisible: false,
    rightSidebarVisible: true,
    timelineHeight: 340,
    charactersHeight: 190,
  });
  assert.deepEqual(parseWriterWorkspaceLayout(null), WRITER_WORKSPACE_LAYOUT_DEFAULTS);
  assert.equal(clampWriterHorizontalPanelHeight("timeline", 10), 160);
  assert.equal(clampWriterHorizontalPanelHeight("characters", 999), 620);
  assert.equal(writerWorkspaceLayoutStorageKey("reviewer"), "filmatta.writer.workspace-layout.v2:reviewer");
  assert.equal(WRITER_WORKSPACE_LAYOUT_DEFAULTS.charactersHeight, 440);
  assert.equal(migrateWriterWorkspaceLayout('{"charactersHeight":260}').charactersHeight, 440);
  assert.equal(migrateWriterWorkspaceLayout('{"charactersHeight":360}').charactersHeight, 440);
  assert.equal(migrateWriterWorkspaceLayout('{"charactersHeight":315}').charactersHeight, 315);
});

test("workspace exposes persisted panel toggles and accessible horizontal splitters", () => {
  const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
  const handle = fs.readFileSync("components/writer/WriterHorizontalResizeHandle.tsx", "utf8");
  const css = fs.readFileSync("app/writer/writer.css", "utf8");
  assert.match(workspace, /name="panelLeft"/u);
  assert.match(workspace, /name="panelRight"/u);
  assert.match(workspace, /panel="characters"/u);
  assert.match(workspace, /panel="timeline"/u);
  assert.match(handle, /aria-orientation="horizontal"/u);
  assert.match(handle, /setPointerCapture/u);
  assert.match(handle, /onDoubleClick/u);
  assert.match(handle, /ArrowUp/u);
  assert.match(css, /--writer-timeline-panel-height/u);
  assert.match(css, /--writer-character-panel-height/u);
  assert.match(css, /--writer-character-panel-height: 440px/u);
  assert.match(css, /writer-breakdown \{[^}]*minmax\(0,1fr\)[^}]*height: calc\(100% - 15px\)/u);
  assert.match(css, /writer-breakdown-title>div>span \{ display:none; \}/u);
});
