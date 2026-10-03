import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { parseWriterAppearance, WRITER_APPEARANCE_DEFAULTS } from "../../lib/writer/appearance.ts";
import { writerKindShortcut, writerShortcutLabel } from "../../lib/writer/shortcuts.ts";

function key(overrides: Partial<KeyboardEvent> = {}) {
  return { key: "1", ctrlKey: true, metaKey: false, altKey: true, shiftKey: false, repeat: false, isComposing: false, getModifierState: (name: string) => name === "AltGraph" ? false : false, ...overrides } as KeyboardEvent;
}

test("Writer appearance defaults to Carbon and keeps warm comfort explicitly off", () => {
  assert.deepEqual(parseWriterAppearance(null), WRITER_APPEARANCE_DEFAULTS);
  assert.equal(parseWriterAppearance('{"skin":"cream","warmFilter":true,"warmIntensity":99}').warmIntensity, 14);
});

test("element shortcuts require the screenplay modifier contract and reject IME, AltGraph, and repeats", () => {
  assert.equal(writerKindShortcut(key(), "Win32"), "sceneHeading");
  assert.equal(writerKindShortcut(key({ key: "9" }), "Linux"), "authorNote");
  assert.equal(writerKindShortcut(key({ ctrlKey: false, metaKey: true }), "MacIntel"), "sceneHeading");
  assert.equal(writerKindShortcut(key({ repeat: true }), "Win32"), null);
  assert.equal(writerKindShortcut(key({ isComposing: true }), "Win32"), null);
  assert.equal(writerKindShortcut(key({ getModifierState: () => true }), "Win32"), null);
  assert.equal(writerShortcutLabel("3", "MacIntel"), "⌘⌥3");
});

test("Shotlist CTA is one shared sidebar footer and no longer a global header command", () => {
  const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
  const panel = fs.readFileSync("components/writer/WriterObservationsPanel.tsx", "utf8");
  assert.match(workspace, /footer=\{<button[^>]+writer-shotlist-footer-button/u);
  assert.doesNotMatch(workspace, /writer-shotlist-open-button/u);
  assert.match(panel, /writer-observations-footer/u);
});
