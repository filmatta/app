import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
const smart = fs.readFileSync("components/writer/WriterSmartFormatting.tsx", "utf8");
const setup = fs.readFileSync("components/writer/WriterSetupPayoff.tsx", "utf8");
const pulse = fs.readFileSync("components/writer/WriterNarrativePulse.tsx", "utf8");
const css = fs.readFileSync("app/writer/writer.css", "utf8");

test("paste onboarding is an explicit modal with two decisions and one recovery flow", () => {
  assert.match(workspace, /assessWriterPaste\(text\)/u);
  assert.doesNotMatch(workspace, /writer-paste-assist/u);
  assert.match(smart, /WriterPasteFormatPrompt/u);
  assert.match(smart, /✦ Formatear este guion/u);
  assert.match(smart, /¿Continuar sin identificar la estructura\?/u);
  assert.match(smart, /CONTINUAR SIN FORMATO/u);
  assert.match(workspace, /startAutoFormat\("paste", pasteAssist\.blockIds\)/u);
  assert.match(smart, /Aplicar formato revisado/u);
});

test("readiness notices cover every structured Writer surface and remain dismissible", () => {
  for (const feature of ["review", "assistant", "setupPayoff", "guided", "timeline", "pulse"]) {
    assert.match(smart, new RegExp(`${feature}: \\{ title:`));
  }
  assert.match(smart, /Ahora no/u);
  assert.match(workspace, /timelineReadinessNotice=\{readinessNotice\("timeline"\)\}/u);
  assert.match(workspace, /pulseReadinessNotice=\{readinessNotice\("pulse"\)\}/u);
});

test("automatic formatting is hybrid, included, idempotent, and one undoable transaction", () => {
  assert.match(smart, /parser resuelve lo evidente/u);
  assert.match(smart, /0 AI Credits/u);
  assert.doesNotMatch(smart, /upgrade|paywall|checkout/iu);
  assert.match(workspace, /applyWriterAutoFormat\(editor, mutations\)/u);
  assert.match(workspace, /refreshWriterDerivedStateAfterFormatting/u);
  assert.match(workspace, /Este documento ya parece estar correctamente formateado como guion/u);
});

test("Pulse turns one analysis intent into save, hash reload, and analysis", () => {
  assert.match(workspace, /onEnsureCurrentSaved=\{ensureCurrentDocumentSaved\}/u);
  assert.match(pulse, /Guardando cambios…/u);
  assert.match(pulse, /await onEnsureCurrentSaved\?\.\(\)/u);
  assert.match(pulse, /const latest = await pulse\.reload\(\)/u);
  assert.match(pulse, /pulse\.analyze\(latest\.currentSourceHash\)/u);
  assert.match(pulse, /Reintentar guardado/u);
});

test("smart indicator is shared only by analytical or automated actions", () => {
  assert.match(smart, /function SmartFeatureIndicator/u);
  assert.match(workspace, /label="FORMATO AUTOMÁTICO"/u);
  assert.match(pulse, /SmartFeatureIndicator label=\{pulse\.analysis/u);
  assert.doesNotMatch(workspace, /aria-label="Negrita"[^\n]*SmartFeatureIndicator/u);
});

test("Setup Payoff uses accessible inline accordions and separate navigation references", () => {
  assert.match(setup, /writer-setup-payoff-accordion/u);
  assert.match(setup, /aria-expanded=\{expanded\}/u);
  assert.match(setup, /writer-setup-payoff-reference/u);
  assert.doesNotMatch(setup, /selectedLink && <RelationDetail/u);
});

test("desktop layout keeps both sidebars and splitters full-height with Timeline only in center", () => {
  assert.match(css, /\.writer-sidebar \{[^}]*grid-row: 2 \/ -1/u);
  assert.match(css, /\.writer-observations-panel \{[^}]*grid-row: 2 \/ -1/u);
  assert.match(css, /\.writer-panel-resize-handle--left \{[^}]*grid-row: 2 \/ -1/u);
  assert.match(css, /\.writer-panel-resize-handle--right \{[^}]*grid-row: 2 \/ -1/u);
  assert.match(css, /\.writer-timeline-panel \{ grid-column: 2; grid-row: 3/u);
});

test("navigation uses one reference contract and a bounded highlight", () => {
  assert.match(workspace, /const navigateToWriterReference = useCallback/u);
  assert.match(workspace, /setWriterSceneHighlight\(editor, target\.id\)/u);
  assert.match(workspace, /window\.setTimeout\(clearSceneHighlight, 1_800\)/u);
  assert.match(workspace, /viewNarrativeObservation[\s\S]*navigateToWriterReference/u);
  assert.match(workspace, /viewSetupPayoffElement[\s\S]*navigateToWriterReference/u);
});
