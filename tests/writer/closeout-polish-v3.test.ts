import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { WRITER_BREAKDOWN_CATEGORY_PRIORITY, writerBreakdownVisibleCategories } from "../../lib/writer/breakdown-responsive.ts";

test("Breakdown progressively overflows against the measured container and keeps the active category visible", () => {
  assert.deepEqual(writerBreakdownVisibleCategories(400, "character"), WRITER_BREAKDOWN_CATEGORY_PRIORITY);
  assert.deepEqual(writerBreakdownVisibleCategories(295, "character"), ["character", "prop", "location", "wardrobe", "vehicle"]);
  assert.deepEqual(writerBreakdownVisibleCategories(240, "animal"), ["character", "prop", "location", "animal"]);
  assert.deepEqual(writerBreakdownVisibleCategories(198, "vehicle"), ["character", "prop", "vehicle"]);
  assert.deepEqual(writerBreakdownVisibleCategories(156, "other"), ["character", "other"]);
  assert.deepEqual(writerBreakdownVisibleCategories(114, "animal"), ["animal"]);

  const panel = fs.readFileSync("components/writer/WriterBreakdownPanel.tsx", "utf8");
  assert.match(panel, /new ResizeObserver\(measure\)/u);
  assert.match(panel, /hiddenCategories\.map/u);
  assert.match(panel, /title="Más categorías"/u);
  assert.doesNotMatch(panel, /PRIMARY\.map\(\(item\)[\s\S]*writer-breakdown-more/u);
});

test("Pulse points use shared Writer navigation and reveal the screenplay", () => {
  const pulse = fs.readFileSync("components/writer/WriterNarrativePulse.tsx", "utf8");
  const timeline = fs.readFileSync("components/writer/WriterTimeline.tsx", "utf8");
  const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
  assert.match(pulse, /aria-label=\{`Escena \$\{scene\.order\} · intensidad \$\{point\.intensity\} · seleccionar escena`\}/u);
  assert.match(pulse, /onClick=\{\(\) => selectPoint\(scene\)\}/u);
  assert.match(timeline, /onSelectScene=\{\(scene\) => activateScene\(scene, true\)\}/u);
  assert.match(timeline, /onGoToWriter\(scene\.sourceId, \{ preservePanel \}\)/u);
  assert.match(workspace, /onGoToWriter=\{\(sceneId, options\) => \{\s*\/\/[^\n]*\n\s*setTimelineExpanded\(false\)/u);
  assert.match(workspace, /navigateToWriterReference\(\{ sceneId \}, \{ preservePanel: options\?\.preservePanel \}\)/u);
});

test("Writer popovers share outside and Escape dismissal with focus return", () => {
  const hook = fs.readFileSync("components/writer/useWriterPopoverDismissal.ts", "utf8");
  const help = fs.readFileSync("components/writer/WriterAssistantSectionHeading.tsx", "utf8");
  const breakdown = fs.readFileSync("components/writer/WriterBreakdownPanel.tsx", "utf8");
  const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
  assert.match(hook, /document\.addEventListener\("pointerdown", dismissOutside\)/u);
  assert.match(hook, /event\.key !== "Escape"/u);
  assert.match(hook, /triggerRef\.current\?\.focus\(\)/u);
  assert.match(help, /useWriterPopoverDismissal/u);
  assert.match(breakdown, /useWriterPopoverDismissal/u);
  assert.match(workspace, /rootRef: appearanceRootRef[\s\S]*triggerRef: appearanceButtonRef/u);
});

test("Help geometry is invariant and Cream separates button states from the warm-gray sheet", () => {
  const css = fs.readFileSync("app/writer/writer.css", "utf8");
  assert.match(css, /writer-assistant-section-title>button \{[^}]*width:22px;[^}]*height:22px;[^}]*place-items:center;[^}]*font:800 \.72rem\/1[^}]*transform:none!important;/u);
  assert.match(css, /writer-assistant-section-title>button\[aria-expanded="true"\] \{[^}]*writer-intelligence[^}]*background:/u);
  assert.doesNotMatch(css, /writer-assistant-section-title>button\[aria-expanded="true"\][^{]*\{[^}]*#ef5b55/u);
  assert.match(css, /--writer-paper:#efede7;/u);
  assert.match(css, /--writer-button-bg:#f4eee4;[^}]*--writer-button-bg-hover:#e7ddd0;[^}]*--writer-button-border:rgba\(70,54,39,\.36\);[^}]*--writer-button-border-hover:rgba\(70,54,39,\.4\);/u);
  assert.match(css, /data-writer-skin="cream"\] button:hover:not\(:disabled\)\{border-color:var\(--writer-button-border-hover\);background-color:var\(--writer-button-bg-hover\)\}/u);
  assert.match(css, /--writer-chrome-text: #f1efe9;/u);
  assert.match(css, /data-writer-skin="cream"\][^\n]*--writer-chrome-text:#28221d;/u);
  assert.match(css, /writer-breakdown-title details p \{[^}]*color:var\(--writer-chrome-text\);[^}]*background:var\(--writer-panel-raised\);/u);
  assert.match(css, /writer-assistant-help p \{[^}]*color:inherit;/u);
});
