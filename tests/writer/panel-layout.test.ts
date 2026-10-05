import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  WRITER_PANEL_LAYOUT_DEFAULTS,
  clampWriterPanelWidth,
  fitWriterPanelLayout,
  parseWriterPanelLayout,
  writerPanelBounds,
  writerPanelStorageKey,
} from "../../lib/writer/panel-layout.ts";

test("panel widths clamp to stable desktop bounds", () => {
  assert.equal(clampWriterPanelWidth("left", 120), 200);
  assert.equal(clampWriterPanelWidth("left", 900), 420);
  assert.equal(clampWriterPanelWidth("right", 100), 300);
  assert.equal(clampWriterPanelWidth("right", 900), 520);
  assert.equal(clampWriterPanelWidth("left", Number.NaN), WRITER_PANEL_LAYOUT_DEFAULTS.left);
});

test("stored layout restores valid values and rejects malformed data", () => {
  assert.deepEqual(parseWriterPanelLayout('{"left":312,"right":448}'), { left: 312, right: 448 });
  assert.deepEqual(parseWriterPanelLayout("not-json"), WRITER_PANEL_LAYOUT_DEFAULTS);
  assert.deepEqual(parseWriterPanelLayout(null), WRITER_PANEL_LAYOUT_DEFAULTS);
  assert.deepEqual(parseWriterPanelLayout('{"left":"bad","right":9999}'), { left: 264, right: 520 });
  assert.equal(writerPanelStorageKey("reviewer"), "filmatta.writer.panel-layout.v1:reviewer");
});

test("fitting both panels protects the editor and leaves compact layout untouched", () => {
  assert.deepEqual(fitWriterPanelLayout({ left: 420, right: 520 }, 1200, true), { left: 380, right: 300 });
  assert.deepEqual(fitWriterPanelLayout({ left: 420, right: 520 }, 1600, true), { left: 420, right: 520 });
  assert.deepEqual(fitWriterPanelLayout({ left: 420, right: 520 }, 900, true), { left: 420, right: 520 });
  assert.deepEqual(writerPanelBounds("left", 1440, 360, true), { min: 200, max: 420 });
  assert.deepEqual(writerPanelBounds("right", 1200, 264, true), { min: 300, max: 416 });
});

test("workspace wires accessible desktop splitters without changing mobile drawers or Timeline", () => {
  const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
  const handle = fs.readFileSync("components/writer/WriterPanelResizeHandle.tsx", "utf8");
  const css = fs.readFileSync("app/writer/writer.css", "utf8");
  assert.match(workspace, /WriterPanelResizeHandle[\s\S]*side="left"/u);
  assert.match(workspace, /WriterPanelResizeHandle[\s\S]*side="right"/u);
  assert.match(handle, /role="separator"/u);
  assert.match(handle, /aria-orientation="vertical"/u);
  assert.match(handle, /ArrowLeft/u);
  assert.match(handle, /onDoubleClick/u);
  assert.match(css, /@media \(min-width: 1200px\)[\s\S]*writer-panel-resize-handle/u);
  assert.match(css, /\.writer-timeline-panel \{ grid-column: 2; grid-row: 4/u);
  assert.match(css, /\.writer-observations-panel \{[^}]*grid-row: 3 \/ -1/u);
  assert.match(css, /\.writer-panel-resize-handle--right \{[^}]*grid-row: 3 \/ -1/u);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.writer-sidebar \{ position: fixed/u);
});
